# Email outbox: delivery checklist

Branch `v0/email-outbox`. Every item was verified against the code, not assumed.

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | `/api/cron/email-outbox` every 5 minutes, protected by `CRON_SECRET`, domain-reconciliation untouched | Done | `vercel.json` has `*/5 * * * *` for the outbox and the original `0 3 * * *` entry for domain-reconciliation. The route returns 503 without `CRON_SECRET` and 401 without the matching Bearer token. `app/api/cron/domain-reconciliation/route.ts` is not in the diff. |
| 2 | One immediate attempt in `after()` after the event is recorded | Done | `scheduleImmediateAttempt` in `lib/email-outbox.ts` runs `processEventById` inside `after()`, only for a freshly inserted row. Outside a request scope the cron delivers it. |
| 3 | Billing-driven bulk suspension sends no email; user removal does; no second removal email for the same project within 1 hour | Done | Billing suspensions write `projects` directly in `lib/billing-lifecycle.ts` and never call `unpublishProject`. The only caller of `unpublishProject` is the editor (owner action), and it queues only when the site was live. `enqueueProjectUnpublishedEmail` skips when an event for the same project exists in the last `UNPUBLISH_DEDUPE_MS` (60 min). A unit test covers the dedupe. |
| 4 | An enqueue failure never fails publish or unpublish | Done | Both enqueue helpers wrap everything in try/catch and log a short message. The pre-check in `unpublishProject` has its own try/catch. |
| 5 | No first-publish email on republish | Done | `firstPublish = !published && !published_at` in `publishProject`; `published_at` is set on publish and kept on unpublish. The partial unique index on `project_id` for `project_first_published` is a second guard. |
| 6 | Welcome email address and language read from auth at send time, not stored | Done | `deliver()` calls `auth.admin.getUserById`, and reads `email` and `user_metadata.email_locale` there. `email_events` has no address or language column, and `last_error` rejects anything that looks like an address. |
| 7 | Tests send no real email | Done | `lib/email-outbox.test.ts` mocks `@/lib/notify` (`sendTransactionalEmailDetailed` is a `vi.fn`), `@/lib/supabase/admin` and `next/server`. No test calls `fetch`. |

Note on "admin removal": the codebase has no separate admin unpublish path. If one is added, it must call `unpublishProject` so it queues the removal email.
