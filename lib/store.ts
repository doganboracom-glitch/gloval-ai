"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentProvider, type PaymentProviderId } from "@/lib/payments";
import { getCurrentCustomerIdForProject } from "@/lib/store-customer";
import { sanitizeInvoice } from "@/lib/store-invoice";
import { loadStorePaymentConfig } from "@/lib/store-payment-config";
import { isValidTurkishIban } from "@/lib/iban";
import { expireStaleManualOrders } from "@/lib/store-manual-orders";
import {
  isManualStoreProvider,
  readBankTransferConfig,
  STORE_PAYMENT_ERROR_CODE,
  type StorePaymentUnavailableReason,
} from "@/lib/store-payment-policy";
import {
  buildOrderPath,
  issueOrderAccessToken,
} from "@/lib/store-order-access";
import { scheduleOrderNotification } from "@/lib/store-order-notifications";
import {
  buildOrderLines,
  withoutVatColumns,
  type OrderProductRow,
} from "@/lib/store-order-rules";
import {
  readProductExtras,
  type StoreProductExtras,
} from "@/lib/store-product-display";
import {
  finalizePaidStock,
  releaseOrderStock,
  releaseStaleOrderStock,
  reserveOrderStock,
} from "@/lib/store-order-stock";
import { isMissingColumnError } from "@/lib/store-schema-compat";
import { loadShippingSettings } from "@/lib/store-shipping-settings";
import { computeShippingCents } from "@/lib/store-shipping-rules";
import { normalizeProductImages, type ProductImage } from "@/lib/product-images";
import {
  computeOrderTotals,
  isCheckoutAllowed,
} from "@/lib/store-checkout-rules";

export type StoreCollection = {
  id: string
  name: string
  slug: string
  sort_order: number
  auto_best_sellers: boolean
  product_ids: string[]
}

export type StoreProduct = {
  id: string;
  project_id: string;
  name: string;
  slug: string;
  description: string | null;
  price_cents: number;
  currency: string;
  stock: number;
  /** Cover first. Legacy URL strings are normalized to `{ url, alt: '' }`. */
  images: ProductImage[];
  category_id: string | null;
  /** False for made-to-order/digital products. Missing on a pre-migration DB. */
  track_stock?: boolean;
  /** Camel-case alias used by renderer catalog entries. */
  trackStock?: boolean;
  created_at?: string
  compare_at_price_cents?: number | null
  category_name?: string | null
  sku?: string | null
} & Partial<StoreProductExtras>;

/** Collections are optional decoration: a missing function or a failed call means "no collections". */
export async function getStoreCollections(slug: string): Promise<StoreCollection[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_store_collections', { p_slug: slug })
    if (error || !Array.isArray(data)) return []
    return data as StoreCollection[]
  } catch {
    return []
  }
}

/**
 * Public catalog read for a PUBLISHED store, via the SECURITY DEFINER RPC.
 * Uses the anon client — safe because the function only returns active
 * products of published projects.
 */
export async function getStoreProducts(slug: string): Promise<StoreProduct[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_store_products", {
    p_slug: slug,
  });
  if (error || !data) return [];
  return (data as StoreProduct[]).map((p) => ({
    ...p,
    images: normalizeProductImages(p.images),
    ...readProductExtras(p as unknown as Record<string, unknown>, p.price_cents),
  }));
}

export async function getStoreProductBySlug(
  storeSlug: string,
  productSlug: string,
): Promise<StoreProduct | null> {
  const products = await getStoreProducts(storeSlug);
  return products.find((p) => p.slug === productSlug) ?? null;
}

/**
 * Public read of a published store's buyer-selectable payment methods. Returns
 * only the enabled provider ids plus non-secret public config (e.g. bank
 * transfer instructions) — never any secret credential. Safe to call from the
 * checkout page. FAILS CLOSED: when the store has no usable config (or the
 * config could not be read) `available` is false and `methods` is empty — it
 * never falls back to the instant-"paid" mock provider (see
 * `lib/store-payment-policy.ts`).
 */
export async function getStorePaymentMethods(storeSlug: string): Promise<{
  available: boolean;
  reason?: StorePaymentUnavailableReason;
  methods: PaymentProviderId[];
  publicConfig: Record<string, unknown>;
  /** Server-verified demo store: the mock card is offered, no real money moves. */
  demo: boolean;
  /** False: the buyer must sign in as a store customer to check out. */
  guestCheckout: boolean;
  /** Cash-on-delivery surcharge in cents (display only; createOrder recomputes). */
  codFeeCents: number;
}> {
  const closed = (reason: StorePaymentUnavailableReason) => ({
    available: false as const,
    reason,
    methods: [] as PaymentProviderId[],
    publicConfig: {},
    demo: false,
    guestCheckout: true,
    codFeeCents: 0,
  });

  const admin = createAdminClient();
  const { data: project, error } = await admin
    .from("projects")
    .select("id")
    .eq("slug", storeSlug)
    .eq("published", true)
    .maybeSingle();
  if (error) {
    console.error("[store-payments] project lookup failed", {
      code: error.code,
      message: error.message,
    });
    return closed("config_unreadable");
  }
  if (!project) return closed("not_configured");

  const resolution = await loadStorePaymentConfig(project.id);
  if (!resolution.ok) return closed(resolution.reason);

  return {
    available: true,
    methods: resolution.methods,
    publicConfig: resolution.publicConfig,
    demo: resolution.demo,
    guestCheckout: resolution.guestCheckout,
    codFeeCents: resolution.codFeeCents,
  };
}

export type CheckoutInput = {
  storeSlug: string;
  idempotencyKey: string;
  customer: {
    name: string;
    lastName?: string;
    email: string;
    phone?: string;
    address?: string;
    district?: string;
    city?: string;
    postalCode?: string;
  };
  items: { productId: string; quantity: number }[];
  /** Buyer-selected payment method. Validated server-side against the owner's
   *  enabled set; ignored (falls back to the store default) if not permitted. */
  paymentMethod?: PaymentProviderId;
  /** Optional invoice details (individual/corporate) captured at checkout. */
  invoice?: {
    type: "individual" | "corporate";
    tckn?: string;
    companyName?: string;
    taxOffice?: string;
    taxNumber?: string;
    address?: string;
  } | null;
};

export type CheckoutResult =
  | {
      ok: true;
      orderId: string;
      totalCents: number;
      currency: string;
      /** Order page path including the signed access token. */
      orderPath: string;
      /** Set for card orders: the buyer must be sent here to pay. */
      paymentUrl?: string;
    }
  | {
      ok: false;
      error: string;
      /** Set for line-level failures so the UI can name the product. */
      productId?: string;
      productName?: string;
      available?: number;
    };

/**
 * Sanitizes checkout invoice input into a stored jsonb shape, keeping only the
 * fields relevant to the chosen type. Returns null when nothing usable is
 * provided so guest orders without invoice details stay clean.
 */
function normalizeCheckoutInvoice(
  raw: CheckoutInput["invoice"],
): Record<string, string> | null {
  const result = sanitizeInvoice(raw, "clamp");
  return result.ok ? result.value : null;
}

/**
 * Creates an order for an anonymous buyer. All money math is recomputed
 * server-side from authoritative DB prices — the client's prices are ignored.
 * Idempotency prevents a retry/double-submit from creating duplicate orders.
 */
export async function createOrder(
  input: CheckoutInput,
): Promise<CheckoutResult> {
  const { storeSlug, customer, items, idempotencyKey } = input;

  if (!customer?.name?.trim() || !customer?.email?.trim()) {
    return { ok: false, error: "missing_customer" };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "empty_cart" };
  }
  if (!idempotencyKey || idempotencyKey.length < 8) {
    return { ok: false, error: "bad_request" };
  }

  const admin = createAdminClient();

  // Resolve the published project for this slug.
  const { data: project } = await admin
    .from("projects")
    .select("id, owner_id, published")
    .eq("slug", storeSlug)
    .eq("published", true)
    .maybeSingle();

  if (!project) return { ok: false, error: "store_not_found" };

  // Idempotency: if this key already produced an order, return it.
  const { data: existing } = await admin
    .from("ecommerce_orders")
    .select("id, total_cents, currency")
    .eq("project_id", project.id)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing) {
    return {
      ok: true,
      orderId: existing.id,
      totalCents: existing.total_cents,
      currency: existing.currency,
      orderPath: buildOrderPath(
        storeSlug,
        existing.id,
        issueOrderAccessToken(existing.id),
      ),
    };
  }

  // Payment gate: resolved BEFORE any order/stock write. A store with no usable
  // payment config, or whose config cannot be read, takes no orders at all.
  const payment = await loadStorePaymentConfig(project.id);
  if (!payment.ok) {
    return { ok: false, error: STORE_PAYMENT_ERROR_CODE[payment.reason] };
  }

  // Attribute the order to the logged-in store customer, if any. With guest
  // checkout turned off the order is refused server side without a session —
  // the checkout page redirect is only a convenience.
  const customerId = await getCurrentCustomerIdForProject(project.id);
  if (!isCheckoutAllowed(payment.guestCheckout, customerId)) {
    return { ok: false, error: "login_required" };
  }

  // Free stock of abandoned online-payment orders in this store (best effort).
  await releaseStaleOrderStock(admin, project.id);

  // Fetch authoritative product data for the requested ids.
  const requestedIds = Array.from(
    new Set(
      items
        .map((i) => i?.productId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  if (requestedIds.length === 0) {
    return { ok: false, error: "invalid_items" };
  }

  const products = await loadOrderProducts(admin, project.id, requestedIds);
  if (!products) return { ok: false, error: "order_failed" };

  const built = buildOrderLines(items, new Map(products.map((p) => [p.id, p])));
  if (!built.ok) {
    return {
      ok: false,
      error: built.error,
      productId: built.productId,
      productName: built.productName,
      available: built.available,
    };
  }

  const { lines: orderItems, subtotalCents: subtotal, currency } = built;

  // Shipping is authoritative server-side: the owner's flat fee, waived above
  // their free-shipping threshold. An unreadable setting must not silently
  // give away shipping, so it refuses the order instead.
  const shippingSettings = await loadShippingSettings(admin, project.id);
  if (!shippingSettings.ok) return { ok: false, error: "order_failed" };
  const shipping = computeShippingCents(subtotal, shippingSettings.settings);

  // The owner's default method (used when the buyer sends nothing or a method
  // that is not permitted) and the authoritative allow-list. The client's
  // selection can never widen it.
  const enabledSet = new Set<PaymentProviderId>(payment.methods);

  // Honor the buyer's choice only if the owner enabled it; else fall back.
  const requested = input.paymentMethod;
  const providerId: PaymentProviderId =
    requested && enabledSet.has(requested)
      ? requested
      : payment.defaultProvider;

  // Authoritative totals: the cash-on-delivery fee comes from the owner's
  // stored setting and only applies when COD is the chosen method.
  const totals = computeOrderTotals({
    subtotalCents: subtotal,
    shippingCents: shipping,
    providerId,
    codFeeCents: payment.codFeeCents,
  });
  const total = totals.totalCents;

  // Only manual methods and the (explicitly allowed) mock provider can take an
  // order. Card providers (e.g. iyzico, which has no per-store credentials yet)
  // must never fall through to a PLATFORM-keyed adapter: the money would land
  // in Gloval's account instead of the store's.
  if (!isManualStoreProvider(providerId) && providerId !== "mock") {
    return { ok: false, error: STORE_PAYMENT_ERROR_CODE.not_configured };
  }

  // A bank-transfer order is only worth taking if the buyer can be told where
  // to pay: refuse when the owner's IBAN is missing or malformed.
  if (providerId === "bank_transfer") {
    const bank = readBankTransferConfig(payment.publicConfig);
    if (!isValidTurkishIban(bank.iban)) {
      return { ok: false, error: STORE_PAYMENT_ERROR_CODE.not_configured };
    }
  }

  // Free stock of abandoned bank-transfer orders past their term (best effort).
  await expireStaleManualOrders(admin, project.id, { releaseOrderStock });

  // Create the order (pending) first. `cod_fee_cents` (migration 036) is
  // skipped when the column does not exist; the fee stays inside total_cents.
  const orderRow = {
    project_id: project.id,
    owner_id: project.owner_id,
    customer_id: customerId,
    status: "pending",
    customer_name: [customer.name.trim(), customer.lastName?.trim()]
      .filter(Boolean)
      .join(" "),
    customer_email: customer.email.trim(),
    customer_phone: customer.phone?.trim() || null,
    shipping_address: {
      address: customer.address?.trim() || "",
      district: customer.district?.trim() || "",
      city: customer.city?.trim() || "",
      postalCode: customer.postalCode?.trim() || "",
    },
    subtotal_cents: subtotal,
    shipping_cents: shipping,
    total_cents: total,
    currency,
    payment_provider: providerId,
    payment_status: "pending",
    idempotency_key: idempotencyKey,
    invoice: normalizeCheckoutInvoice(input.invoice),
  };
  let inserted = await admin
    .from("ecommerce_orders")
    .insert({ ...orderRow, cod_fee_cents: totals.codFeeCents })
    .select("id")
    .single();
  if (isMissingColumnError(inserted.error)) {
    inserted = await admin
      .from("ecommerce_orders")
      .insert(orderRow)
      .select("id")
      .single();
  }
  const { data: order, error: orderError } = inserted;

  if (orderError || !order) {
    // Unique violation => a concurrent request already created it.
    const { data: race } = await admin
      .from("ecommerce_orders")
      .select("id, total_cents, currency")
      .eq("project_id", project.id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (race) {
      return {
        ok: true,
        orderId: race.id,
        totalCents: race.total_cents,
        currency: race.currency,
        orderPath: buildOrderPath(
          storeSlug,
          race.id,
          issueOrderAccessToken(race.id),
        ),
      };
    }
    return { ok: false, error: "order_failed" };
  }

  let { error: itemsError } = await admin
    .from("ecommerce_order_items")
    .insert(
      orderItems.map((oi) => ({
        ...oi,
        project_id: project.id,
        order_id: order.id,
      })),
    );
  // Before scripts/037 the VAT columns do not exist: store the lines without them.
  if (isMissingColumnError(itemsError)) {
    ({ error: itemsError } = await admin.from("ecommerce_order_items").insert(
      orderItems.map((oi) => ({
        ...withoutVatColumns(oi),
        project_id: project.id,
        order_id: order.id,
      })),
    ));
  }

  // An order without its lines would be unfulfillable and could never take
  // stock, so it must not survive.
  if (itemsError) {
    console.error("[store-order] item insert failed", {
      projectId: project.id,
      orderId: order.id,
      code: itemsError.code,
    });
    await voidOrder(admin, order.id, idempotencyKey);
    return { ok: false, error: "order_failed" };
  }

  // Take the stock of every line atomically (all or nothing). Every payment
  // method holds stock from here: online payments are released again on
  // failure/timeout, bank transfers when the owner cancels the order.
  const reserved = await reserveOrderStock(admin, order.id);
  if (!reserved.ok) {
    await voidOrder(admin, order.id, idempotencyKey);
    if (reserved.error === "insufficient_stock") {
      const short = reserved.productId
        ? products.find((p) => p.id === reserved.productId)
        : undefined;
      return {
        ok: false,
        error: "insufficient_stock",
        productId: reserved.productId ?? undefined,
        productName: short?.name,
      };
    }
    return { ok: false, error: "order_failed" };
  }

  const orderPath = buildOrderPath(
    storeSlug,
    order.id,
    issueOrderAccessToken(order.id),
  );

  // Bank transfer has no PSP: the order stays pending until the owner confirms
  // the transfer. It must never reach a provider adapter.
  if (isManualStoreProvider(providerId)) {
    scheduleOrderNotification(order.id);
    return {
      ok: true,
      orderId: order.id,
      totalCents: total,
      currency,
      orderPath,
    };
  }

  // Create the payment intent through the resolved provider.
  const provider = getPaymentProvider(providerId);
  let intent: Awaited<ReturnType<typeof provider.createIntent>>;
  try {
    intent = await provider.createIntent({
      orderId: order.id,
      amountCents: total,
      currency,
      customerEmail: customer.email.trim(),
      returnUrl: orderPath,
      publicConfig: payment.publicConfig,
      secret: null,
    });
  } catch (err) {
    console.error("[store-payments] createIntent failed", {
      projectId: project.id,
      orderId: order.id,
      provider: providerId,
      message: err instanceof Error ? err.message : "unknown",
    });
    await releaseOrderStock(admin, order.id);
    await admin
      .from("ecommerce_orders")
      .update({ status: "failed", payment_status: "failed" })
      .eq("id", order.id);
    return { ok: false, error: "order_failed" };
  }

  // Only the mock provider settles synchronously (and only where explicitly
  // allowed). Its stock is already reserved above; finalizing is a no-op there
  // and only does work on a database without the stock functions.
  if (intent.action === "completed" && intent.status === "paid") {
    await admin
      .from("ecommerce_orders")
      .update({
        status: "paid",
        payment_status: "paid",
        payment_ref: intent.reference,
      })
      .eq("id", order.id);
    await finalizePaidStock(admin, order.id);
  } else {
    await admin
      .from("ecommerce_orders")
      .update({ payment_ref: intent.reference, payment_status: intent.status })
      .eq("id", order.id);
  }

  scheduleOrderNotification(order.id);

  return {
    ok: true,
    orderId: order.id,
    totalCents: total,
    currency,
    orderPath,
  };
}

/**
 * Reads the authoritative product rows. `track_stock` only exists after the
 * order-integrity migration, so the query falls back to the legacy columns
 * until then. Returns null when the catalog cannot be read.
 */
async function loadOrderProducts(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
  ids: string[],
): Promise<OrderProductRow[] | null> {
  const base = "id, name, price_cents, currency, stock, status";
  // vat_rate (scripts/037) and track_stock (scripts/032) arrive separately;
  // try the richest column set first and degrade without failing the order.
  const withVat = await admin
    .from("ecommerce_products")
    .select(`${base}, track_stock, vat_rate`)
    .eq("project_id", projectId)
    .in("id", ids);
  if (!withVat.error)
    return (withVat.data ?? []) as unknown as OrderProductRow[];

  if (!isMissingColumnError(withVat.error)) {
    console.error("[store-order] product read failed", {
      projectId,
      code: withVat.error.code,
    });
    return null;
  }

  const withTracking = await admin
    .from("ecommerce_products")
    .select(`${base}, track_stock`)
    .eq("project_id", projectId)
    .in("id", ids);
  if (!withTracking.error)
    return (withTracking.data ?? []) as unknown as OrderProductRow[];

  if (!isMissingColumnError(withTracking.error)) {
    console.error("[store-order] product read failed", {
      projectId,
      code: withTracking.error.code,
    });
    return null;
  }

  const legacy = await admin
    .from("ecommerce_products")
    .select(base)
    .eq("project_id", projectId)
    .in("id", ids);
  if (legacy.error) {
    console.error("[store-order] product read failed", {
      projectId,
      code: legacy.error.code,
    });
    return null;
  }
  return (legacy.data ?? []) as unknown as OrderProductRow[];
}

/**
 * Discards an order that never became valid. The idempotency key is retired so
 * a retry of the same checkout creates a fresh order instead of resolving to
 * this cancelled one.
 */
async function voidOrder(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
  idempotencyKey: string,
): Promise<void> {
  await admin
    .from("ecommerce_orders")
    .update({
      status: "cancelled",
      payment_status: "failed",
      idempotency_key: `${idempotencyKey}#void-${orderId}`,
    })
    .eq("id", orderId);
}
