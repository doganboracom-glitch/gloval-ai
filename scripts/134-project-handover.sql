-- scripts/134-project-handover.sql
-- *** NOT APPLIED to any database. Review/PR only. ***
-- Site devri: hands ONE generated site (projects row) from one user's account to another.
-- Used when we prepare a site for a business and the business says "this site is mine".
--
-- Same pattern as scripts/086-domain-ownership-handover.sql:
--   * one function call = one transaction, service_role only (no anon/authenticated EXECUTE),
--   * append-only audit table (trigger blocks UPDATE/DELETE/TRUNCATE), no FKs so deleted users or
--     deleted projects never erase history,
--   * idempotency key + per-site advisory lock + FOR UPDATE on the projects row,
--   * a JSON snapshot of what moved.
--
-- MOVED with the site (owner_id / user_id rewritten for rows of THIS project only):
--   projects.owner_id, ecommerce_products, ecommerce_orders, ecommerce_categories,
--   ecommerce_product_variants, ecommerce_payment_settings, project_entitlements.
-- NOT moved (user history stays with the previous owner): support tickets, ads_brands,
--   ai_image_previews, email_events, store_ai_attempts, billing_*, user_addon_entitlements,
--   draft_site_reminders (never touched).
-- The previous owner's billing_subscriptions.suspended_project_ids loses this project id.
--
-- projects.client_token DECISION: it is only a create-time idempotency key, unique per
--   (owner_id, client_token). It never authorises editing (every edit checks owner_id), so the old
--   owner's browser keeps no edit right after the move. It is therefore kept as is and rotated ONLY
--   when the target already owns a project with the same token (so the unique index cannot fail).
--   The column is optional (scripts/088); this file works whether or not it exists.
--
-- Idempotent. Rollback: 134-project-handover.rollback.sql

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- 1) Audit table ------------------------------------------------------------------------
create table if not exists public.project_handover_events (
  id              uuid primary key default gen_random_uuid(),
  handover_id     uuid not null,
  event           text not null check (event in ('handover')),
  idempotency_key text not null,
  project_id      uuid not null,
  project_name    text,
  project_type    text,
  from_user_id    uuid not null,
  to_user_id      uuid not null,
  actor_email     text not null,
  reason          text not null,
  snapshot        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create unique index if not exists project_handover_events_one_handover
  on public.project_handover_events (handover_id) where event = 'handover';
create unique index if not exists project_handover_events_idem
  on public.project_handover_events (idempotency_key);
create index if not exists project_handover_events_project_idx
  on public.project_handover_events (project_id, created_at desc);
create index if not exists project_handover_events_created_idx
  on public.project_handover_events (created_at desc);

alter table public.project_handover_events enable row level security;   -- no policies
revoke all on public.project_handover_events from public, anon, authenticated;
grant select on public.project_handover_events to service_role;

create or replace function public.phe_block_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'project_handover_events is append-only' using errcode = '42501';
end $$;

drop trigger if exists phe_no_update_delete on public.project_handover_events;
create trigger phe_no_update_delete before update or delete on public.project_handover_events
  for each row execute function public.phe_block_mutation();
drop trigger if exists phe_no_truncate on public.project_handover_events;
create trigger phe_no_truncate before truncate on public.project_handover_events
  for each statement execute function public.phe_block_mutation();

-- 2) Internal helper: a user's plan, site allowance and current site usage ------------------
--    Mirrors lib/pricing-config.ts (SITE_LIMITS / ECOMMERCE_SITE_LIMITS / toPlanCode),
--    lib/add-ons.ts (site add-on capacity) and lib/site-limit-override.ts.
--    Usage counts PUBLISHED sites, like the publish quota check in lib/projects.ts.
create or replace function public._ph_target_limits(p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_code        text;
  v_plan        text := 'free';
  v_base        int;
  v_ecom_base   int;
  v_override    int;
  v_addon_corp  int := 0;
  v_addon_ecom  int := 0;
  v_published   int;
  v_ecom_pub    int;
  v_total       int;
begin
  select lower(btrim(bp.code)) into v_code
    from public.billing_subscriptions bs
    join public.billing_plans bp on bp.id = bs.plan_id
   where bs.user_id = p_user_id
     and bs.status in ('trialing', 'active', 'past_due')
     and bp.product_category is distinct from 'addon'
   order by bs.current_period_end desc nulls last
   limit 1;

  if v_code is not null then
    v_plan := case
      when v_code in ('ecommerce', 'ecommerce_yearly')                          then 'ecommerce'
      when v_code in ('pro', 'pro_yearly', 'corporate_pro')                     then 'pro'
      when v_code in ('starter', 'starter_yearly', 'corporate_starter')         then 'starter'
      when v_code = 'free'                                                      then 'free'
      when v_code like '%ecommerce%' or v_code like '%eticaret%'                then 'ecommerce'
      when v_code like '%pro%'                                                  then 'pro'
      when v_code like '%starter%'                                              then 'starter'
      else 'free' end;
  end if;

  v_base      := case v_plan when 'ecommerce' then 4 when 'pro' then 3 else 1 end;
  v_ecom_base := case v_plan when 'ecommerce' then 1 else 0 end;

  select site_limit into v_override
    from public.user_limit_overrides
   where user_id = p_user_id and site_limit is not null
     and (expires_at is null or expires_at > now());
  if v_override is not null then v_base := v_override; end if;

  -- Site add-ons only count on Pro / E-Ticaret; ecommerce add-ons only on E-Ticaret.
  if v_plan in ('pro', 'ecommerce') then
    select
      coalesce(sum(case when ue.addon_code in ('extra_corporate_site_1', 'extra_corporate_site_1_yearly') then 1 else 0 end), 0),
      coalesce(sum(case when ue.addon_code in ('extra_ecommerce_site_1', 'extra_ecommerce_site_1_yearly')
                         and v_plan = 'ecommerce' then 1 else 0 end), 0)
      into v_addon_corp, v_addon_ecom
      from public.user_addon_entitlements ue
      join public.billing_subscriptions bs on bs.id = ue.subscription_id
     where ue.user_id = p_user_id
       and ue.status = 'active'
       and ue.addon_code in ('extra_corporate_site_1', 'extra_corporate_site_1_yearly',
                             'extra_ecommerce_site_1', 'extra_ecommerce_site_1_yearly')
       and bs.status in ('trialing', 'active', 'past_due')
       and (ue.starts_at is null or ue.starts_at <= now())
       and case
             when ue.addon_code like '%\_yearly' then
               case when ue.expires_at is null then false
                    else least(ue.expires_at, coalesce(bs.current_period_end, ue.expires_at)) > now() end
             else coalesce(bs.current_period_end, ue.expires_at) > now()
           end;
  end if;

  select count(*) filter (where published),
         count(*) filter (where published and project_type = 'ecommerce')
    into v_published, v_ecom_pub
    from public.projects where owner_id = p_user_id;

  v_total := v_base + v_addon_corp + v_addon_ecom;

  return jsonb_build_object(
    'plan_code',                v_plan,
    'site_limit',               v_total,
    'ecommerce_site_limit',     v_ecom_base + v_addon_ecom,
    'published_count',          v_published,
    'ecommerce_published_count', v_ecom_pub);
end $$;

-- 3) HANDOVER ---------------------------------------------------------------------------
create or replace function public.admin_handover_project(
  p_project_id            uuid,
  p_expected_from_user_id uuid,
  p_to_user_id            uuid,
  p_actor_email           text,
  p_reason                text,
  p_idempotency_key       text,
  p_force_quota           boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_proj        public.projects%rowtype;
  v_prev        public.project_handover_events%rowtype;
  v_u           auth.users%rowtype;
  v_id          uuid := gen_random_uuid();
  v_limits      jsonb;
  v_over        boolean := false;
  v_foreign_dom int;
  v_token       text;
  v_token_new   boolean := false;
  v_has_token   boolean;
  v_n           int;
  v_counts      jsonb := '{}'::jsonb;
  v_codes       jsonb;
  v_result      jsonb;
begin
  if coalesce(btrim(p_idempotency_key), '') = '' or length(p_idempotency_key) > 80
     or coalesce(btrim(p_actor_email), '') = ''
     or length(coalesce(btrim(p_reason), '')) < 10
     or p_project_id is null or p_to_user_id is null or p_expected_from_user_id is null then
    return jsonb_build_object('ok', false, 'state', 'bad_request');
  end if;

  -- Serialises concurrent calls for the same site.
  perform pg_advisory_xact_lock(hashtextextended('project_handover:' || p_project_id::text, 0));

  -- Idempotency: same key + same parameters returns the recorded result untouched.
  select * into v_prev from public.project_handover_events where idempotency_key = p_idempotency_key;
  if found then
    if v_prev.project_id = p_project_id and v_prev.to_user_id = p_to_user_id then
      return v_prev.snapshot || jsonb_build_object('ok', true, 'state', 'already_done', 'replayed', true);
    end if;
    return jsonb_build_object('ok', false, 'state', 'idempotency_key_reuse');
  end if;

  select * into v_proj from public.projects where id = p_project_id for update;
  if not found or v_proj.status = 'deleted' or v_proj.owner_id is null then
    return jsonb_build_object('ok', false, 'state', 'not_found');
  end if;

  if v_proj.owner_id = p_to_user_id then
    return jsonb_build_object('ok', false, 'state', 'same_owner');
  end if;
  if v_proj.owner_id <> p_expected_from_user_id then
    return jsonb_build_object('ok', false, 'state', 'owner_changed');
  end if;

  -- Target: auth user exists, not deleted, not banned, and has a profile.
  select * into v_u from auth.users where id = p_to_user_id;
  if not found or v_u.deleted_at is not null
     or (v_u.banned_until is not null and v_u.banned_until > now())
     or not exists (select 1 from public.profiles where id = p_to_user_id) then
    return jsonb_build_object('ok', false, 'state', 'target_invalid');
  end if;

  -- A custom domain attached to this site belongs to someone else: hand the domain over first.
  select count(*) into v_foreign_dom from public.custom_domains
   where website_project_id = p_project_id and user_id <> p_to_user_id;
  if v_foreign_dom > 0 then
    return jsonb_build_object('ok', false, 'state', 'domain_attached', 'domain_count', v_foreign_dom,
      'message', 'Önce alan adı devrini veya ayırmayı yapın.');
  end if;

  -- Quota: only a PUBLISHED site occupies an allowance (same rule as publishing).
  v_limits := public._ph_target_limits(p_to_user_id);
  if v_proj.published then
    v_over := (v_limits ->> 'published_count')::int + 1 > (v_limits ->> 'site_limit')::int
      or (v_proj.project_type = 'ecommerce'
          and (v_limits ->> 'ecommerce_published_count')::int + 1 > (v_limits ->> 'ecommerce_site_limit')::int);
  end if;
  if v_over and not coalesce(p_force_quota, false) then
    return jsonb_build_object('ok', false, 'state', 'quota_exceeded', 'target', v_limits);
  end if;

  -- client_token: rotate only when the target already owns the same token.
  select exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'projects' and column_name = 'client_token')
    into v_has_token;
  if v_has_token then
    execute 'select client_token from public.projects where id = $1' into v_token using p_project_id;
    if v_token is not null then
      execute 'select count(*) from public.projects where owner_id = $1 and client_token = $2 and id <> $3'
        into v_n using p_to_user_id, v_token, p_project_id;
      if v_n > 0 then
        execute 'update public.projects set client_token = $1 where id = $2'
          using replace(gen_random_uuid()::text, '-', ''), p_project_id;
        v_token_new := true;
      end if;
    end if;
  end if;

  -- Move the site and everything keyed to it.
  update public.projects set owner_id = p_to_user_id where id = p_project_id;

  update public.ecommerce_products set owner_id = p_to_user_id where project_id = p_project_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('ecommerce_products', v_n);
  update public.ecommerce_orders set owner_id = p_to_user_id where project_id = p_project_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('ecommerce_orders', v_n);
  update public.ecommerce_categories set owner_id = p_to_user_id where project_id = p_project_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('ecommerce_categories', v_n);
  update public.ecommerce_product_variants set owner_id = p_to_user_id where project_id = p_project_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('ecommerce_product_variants', v_n);
  update public.ecommerce_payment_settings set owner_id = p_to_user_id where project_id = p_project_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('ecommerce_payment_settings', v_n);

  select coalesce(jsonb_agg(code order by code), '[]'::jsonb) into v_codes
    from public.project_entitlements where project_id = p_project_id;
  update public.project_entitlements set user_id = p_to_user_id where project_id = p_project_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('project_entitlements', v_n);

  -- The previous owner's suspension list must not keep pointing at a site they no longer own.
  -- suspended_project_ids is JSONB: an array of uuid strings (lib/billing-lifecycle.ts writes string[]).
  update public.billing_subscriptions
     set suspended_project_ids = coalesce(
           (select jsonb_agg(e) from jsonb_array_elements(suspended_project_ids) e
             where (e #>> '{}') <> p_project_id::text), '[]'::jsonb)
   where user_id = p_expected_from_user_id
     and jsonb_typeof(suspended_project_ids) = 'array'
     and exists (select 1 from jsonb_array_elements(suspended_project_ids) e
                  where (e #>> '{}') = p_project_id::text);
  get diagnostics v_n = row_count;

  v_result := jsonb_build_object(
    'handover_id',         v_id,
    'project_id',          v_proj.id,
    'from_user_id',        p_expected_from_user_id,
    'to_user_id',          p_to_user_id,
    'project', jsonb_build_object(
      'name', v_proj.name, 'type', v_proj.project_type, 'published', v_proj.published, 'slug', v_proj.slug),
    'moved',               v_counts,
    'entitlement_codes',   v_codes,
    'target', v_limits,
    'quota_exceeded',      v_over,
    'force_quota',         coalesce(p_force_quota, false),
    'client_token_rotated', v_token_new,
    'suspended_ids_cleaned', v_n);

  insert into public.project_handover_events
    (id, handover_id, event, idempotency_key, project_id, project_name, project_type,
     from_user_id, to_user_id, actor_email, reason, snapshot)
  values
    (v_id, v_id, 'handover', p_idempotency_key, v_proj.id, v_proj.name, v_proj.project_type,
     p_expected_from_user_id, p_to_user_id, btrim(p_actor_email), btrim(p_reason), v_result);

  return v_result || jsonb_build_object('ok', true, 'state', 'ok', 'replayed', false);
end $$;

-- 4) READ-ONLY PREVIEW ------------------------------------------------------------------
create or replace function public.admin_project_handover_preview(
  p_project_id uuid,
  p_to_email   text
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_proj      public.projects%rowtype;
  v_from      auth.users%rowtype;
  v_to        auth.users%rowtype;
  v_email     text := lower(btrim(coalesce(p_to_email, '')));
  v_target    jsonb := jsonb_build_object('found', false);
  v_limits    jsonb;
  v_blockers  jsonb := '[]'::jsonb;
  v_warnings  jsonb := '[]'::jsonb;
  v_active    boolean;
  v_has_prof  boolean;
  v_domains   jsonb;
  v_foreign   int;
  v_ents      jsonb;
  v_products  int := 0;
  v_orders    int := 0;
  v_would_exceed boolean := false;
begin
  select * into v_proj from public.projects where id = p_project_id;
  if not found or v_proj.status = 'deleted' then
    return jsonb_build_object('found', false, 'blockers', jsonb_build_array('not_found'), 'warnings', '[]'::jsonb);
  end if;

  select * into v_from from auth.users where id = v_proj.owner_id;

  select coalesce(jsonb_agg(jsonb_build_object('domain', domain, 'owner_id', user_id, 'status', status)), '[]'::jsonb)
    into v_domains
    from public.custom_domains where website_project_id = p_project_id;

  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'status', status) order by code), '[]'::jsonb)
    into v_ents from public.project_entitlements where project_id = p_project_id;

  select count(*) into v_products from public.ecommerce_products where project_id = p_project_id;
  select count(*) into v_orders   from public.ecommerce_orders   where project_id = p_project_id;

  if v_email <> '' then
    select * into v_to from auth.users
     where lower(btrim(coalesce(email, ''))) = v_email and deleted_at is null
     order by created_at limit 1;
    if found then
      v_has_prof := exists (select 1 from public.profiles where id = v_to.id);
      v_active := v_to.deleted_at is null
                  and not (v_to.banned_until is not null and v_to.banned_until > now())
                  and v_has_prof;
      v_limits := public._ph_target_limits(v_to.id);
      v_target := jsonb_build_object(
        'found', true, 'id', v_to.id, 'email', v_to.email,
        'confirmed', v_to.email_confirmed_at is not null,
        'active', v_active, 'has_profile', v_has_prof) || v_limits;
    end if;
  end if;

  -- Blockers (mirror admin_handover_project).
  if (v_target ->> 'found')::boolean is not true then
    v_blockers := v_blockers || to_jsonb('target_invalid'::text);
  else
    if v_to.id = v_proj.owner_id then
      v_blockers := v_blockers || to_jsonb('same_owner'::text);
    end if;
    if (v_target ->> 'active')::boolean is not true then
      v_blockers := v_blockers || to_jsonb('target_invalid'::text);
    end if;
    select count(*) into v_foreign from public.custom_domains
     where website_project_id = p_project_id and user_id <> v_to.id;
    if v_foreign > 0 then
      v_blockers := v_blockers || to_jsonb('domain_attached'::text);
    end if;

    -- Warnings.
    if v_to.email_confirmed_at is null then
      v_warnings := v_warnings || to_jsonb('target_unconfirmed'::text);
    end if;
    if v_proj.published then
      v_warnings := v_warnings || to_jsonb('published'::text);
      v_would_exceed := (v_limits ->> 'published_count')::int + 1 > (v_limits ->> 'site_limit')::int
        or (v_proj.project_type = 'ecommerce'
            and (v_limits ->> 'ecommerce_published_count')::int + 1 > (v_limits ->> 'ecommerce_site_limit')::int);
      if v_would_exceed then
        v_warnings := v_warnings || to_jsonb('quota_exceeded'::text);
      end if;
    elsif (v_limits ->> 'published_count')::int >= (v_limits ->> 'site_limit')::int then
      v_warnings := v_warnings || to_jsonb('target_site_full'::text);
    end if;
    if v_proj.project_type = 'ecommerce' and (v_limits ->> 'ecommerce_site_limit')::int < 1 then
      v_warnings := v_warnings || to_jsonb('ecommerce_plan_missing'::text);
    end if;
  end if;

  return jsonb_build_object(
    'found', true,
    'project', jsonb_build_object(
      'id', v_proj.id, 'name', v_proj.name, 'type', v_proj.project_type,
      'published', v_proj.published, 'slug', v_proj.slug),
    'from', jsonb_build_object('id', v_proj.owner_id, 'email', v_from.email),
    'target', v_target,
    'counts', jsonb_build_object('products', v_products, 'orders', v_orders),
    'domains', v_domains,
    'entitlements', v_ents,
    'quota_would_exceed', v_would_exceed,
    'warnings', v_warnings,
    'blockers', v_blockers);
end $$;

-- 5) Grants: service_role only ----------------------------------------------------------
revoke all on function public.admin_handover_project(uuid,uuid,uuid,text,text,text,boolean)
  from public, anon, authenticated;
revoke all on function public.admin_project_handover_preview(uuid,text)
  from public, anon, authenticated;
revoke all on function public._ph_target_limits(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.phe_block_mutation()
  from public, anon, authenticated;

grant execute on function public.admin_handover_project(uuid,uuid,uuid,text,text,text,boolean) to service_role;
grant execute on function public.admin_project_handover_preview(uuid,text) to service_role;

commit;
