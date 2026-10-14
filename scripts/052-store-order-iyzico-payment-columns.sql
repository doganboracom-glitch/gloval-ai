-- 052: iyzico Checkout Form için sipariş kolonları.
-- Idempotent. Otomatik UYGULANMAZ; elle çalıştırın.
--
--   payment_nonce       Dönüş (callback) URL'sine gömülen tek kullanımlık değer; ödeme
--                       sonuçlanınca NULL'lanır. iyzico'nun döndürdüğü token ile eşleştirilir.
--   provider_payment_id iyzico'nun onaylanan ödeme için verdiği paymentId (iade/mutabakat).
--
-- Bu kolonlar yoksa kart ödemesi "hazır değil" sayılır (orderColumnsReady = false) ve mağaza,
-- iyzico anahtarları testten geçmiş olsa bile kart seçeneğini sunmaz.

begin;

alter table public.ecommerce_orders
  add column if not exists payment_nonce text,
  add column if not exists provider_payment_id text;

commit;
