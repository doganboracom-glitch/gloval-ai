const fs = require('fs')
let p1 = fs.readFileSync('.v0-tmp/part1-block0.sql', 'utf8')
const must = (cond, msg) => { if (!cond) throw new Error(msg) }

// 1) currency
const curOld = "check (currency = 'TRY')"
must(p1.includes(curOld), 'currency not found')
p1 = p1.replace(curOld, () => "check (currency ~ '^[A-Z]{3}$')")

// 2) remove usage_events policy
const polOld = "create policy ads_usage_events_select_own on public.ads_usage_events\n  for select to authenticated\n  using (user_id = (select auth.uid()));\n\n"
must(p1.includes(polOld), 'policy not found')
p1 = p1.replace(polOld, '')
const cmOld = "-- ads_free_usage and ads_alerts: no policies, so anon and authenticated see no rows.\n"
must(p1.includes(cmOld), 'comment not found')
p1 = p1.replace(cmOld, "-- ads_usage_events, ads_free_usage and ads_alerts: RLS enabled, no policies,\n-- so anon and authenticated see no rows. Only service_role can access them.\n")

// 3) grant
const grOld = "grant select on table\n  public.ads_brands,\n  public.ads_plans,\n  public.ads_actions,\n  public.ads_recommendations,\n  public.ads_usage_events\nto authenticated;"
must(p1.includes(grOld), 'grant not found')
p1 = p1.replace(grOld, "-- ads_usage_events is intentionally NOT granted: model, token and cost data\n-- must not be visible to users.\ngrant select on table\n  public.ads_brands,\n  public.ads_plans,\n  public.ads_actions,\n  public.ads_recommendations\nto authenticated;")

// 4) wrapper
const lines = p1.split('\n')
must(lines[0] === '-- NOT APPLIED', 'header')
const body = lines.slice(1).join('\n').replace(/\s+$/, '\n')
const wrap = (b, tag) => `-- ${tag}\nbegin;\nset local lock_timeout = '5s';\nset local statement_timeout = '60s';\n\n${b}\ncommit;\n`
fs.writeFileSync('.v0-tmp/ads_core_part1_089.sql', wrap(body, 'ads_core_part1_089'))

// Part 2
let p2 = fs.readFileSync('.v0-tmp/part2-block5.sql', 'utf8')
const pre = "-- Preflight (run manually before applying; expect 0):\n--   select count(*) from public.ai_credit_transactions\n--    where reason like 'ads:%' or reason like 'ads\\_refund:%';\n-- If ai_credit_transactions is large, create the unique index below\n-- with CREATE UNIQUE INDEX CONCURRENTLY outside this transaction instead.\n"
must(p2.includes(pre), 'preflight')
p2 = p2.replace(pre, "-- Preflight (verified before applying; expected 0):\n--   select count(*) from public.ai_credit_transactions\n--    where reason like 'ads:%' or reason like 'ads\\_refund:%';\n")
p2 = p2.replace(/^-- NOT APPLIED\n/, '-- ads_core_part2_090\n')
fs.writeFileSync('.v0-tmp/ads_core_part2_090.sql', p2)
console.log('ok')
