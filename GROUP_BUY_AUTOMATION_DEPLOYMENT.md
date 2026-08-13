# Group Buy automatic export scheduler

Production was not changed by this repository update. After deploying `group-buy-export-email`, create a
Supabase Cron job (or equivalent server scheduler) that invokes the function every 10 or 15 minutes.

## Function secret

Create a cryptographically random secret and store it in Supabase Edge Function secrets under the exact
name `GROUP_BUY_AUTOMATION_SECRET`. Do not place its value in this repository, frontend code, SQL checked
into source control, logs, or query parameters. The scheduler must hold the same value securely.

## Request contract

- URL: `https://<project-ref>.supabase.co/functions/v1/group-buy-export-email`
- Method: `POST`
- Body: `{"type":"automatic"}`
- Headers:
  - `Content-Type: application/json`
  - `x-automation-secret: <GROUP_BUY_AUTOMATION_SECRET>`

The request may omit `Origin`; the function allows originless server-to-server calls. Browser requests are
restricted to `https://s967.org` and `https://www.s967.org`.

## Retry behavior

The function itself finds up to 10 events whose end time is at least 10 minutes old and whose
`export_email_sent_at` is null. Automatic retries exclude recipients already recorded as successful and
retry only remaining recipients. Once every currently active recipient has succeeded, the event is marked
with `export_email_sent_at`, so later scheduler ticks no longer select it. This makes a recurring 10- or
15-minute schedule safe and allows the next tick to retry partial failures.
