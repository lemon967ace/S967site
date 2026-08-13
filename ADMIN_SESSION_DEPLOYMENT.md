# Administrator session deployment

The repository originally contained only `admin/index.html`; the deployed source for its seven existing
administrator Edge Functions was not present. Do not deploy the browser change until those functions are
updated at their actual source location.

## Required order

1. Run `supabase/migrations/202608130001_admin_sessions.sql`.
2. Deploy `admin-login`, `admin-session`, and `admin-logout` with JWT verification disabled. Set
   `ADMIN_PASSWORD` as a Supabase Edge Function secret. `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` remain server-only secrets.
3. In each existing function below, import `verifyAdminSession` from `_shared/admin-auth.ts`, call it before
   any read or mutation, and return its error/status when `ok` is false. Remove all `x-admin-secret` and
   direct `ADMIN_PASSWORD` checks. Preserve each function's existing business logic and response contract.
4. Deploy all seven protected functions, then publish the static site.

Protected existing functions:

- `upload-admin`
- `staff-admin`
- `wk-admin`
- `wk-export-email`
- `inquiry-admin`
- `group-buy-admin`
- `group-buy-export-email`

Guard to add immediately after CORS/method handling and service-client creation:

```ts
const admin = await verifyAdminSession(req, supabase);
if (!admin.ok) return jsonResponse({ error: admin.error }, admin.status);
```

All CORS responses must use the exact `https://s967.org` origin and allow `Authorization`. The new login
endpoint does not itself impose an application-level rate limit because the previous function source and
its brute-force controls were absent. Configure a gateway/platform rate limit before exposing it publicly;
the password comparison is constant-work, but that does not replace throttling.
