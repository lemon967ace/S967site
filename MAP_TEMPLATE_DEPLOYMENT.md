# Map template API deployment

The three Edge Function files are self-contained for direct deployment in the Supabase Dashboard. They do
not import repository `_shared` files or browser editor modules.

## Production order

1. Run `supabase/migrations/202608130002_map_templates.sql`, then
   `supabase/migrations/202608130003_map_template_default.sql` in the production SQL Editor.
2. Confirm that the existing administrator session migration and the `admin-login`, `admin-session`, and
   `admin-logout` functions are already deployed and working.
3. Create/deploy `map-template-admin` using its complete `index.ts`.
4. Create/deploy `map-template-list` using its complete `index.ts`.
5. Create/deploy `map-template-load` using its complete `index.ts`.
6. Verify all requests against a staging project or disposable row before using production data. Do not
   deploy the functions before the table migration.

In Dashboard deployment settings, turn **Verify JWT** off for all three functions. The public endpoints are
intentionally unauthenticated, while `map-template-admin` verifies the project's opaque administrator
session itself; that token is not a Supabase Auth JWT.

All functions require `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The admin function receives the token
from `sessionStorage["s967-admin-session-token"]` as `Authorization: Bearer <token>`. Public functions do not
require authentication.

## Smoke requests

Use a valid production origin. Replace the project reference, UUID, and token placeholders.

```bash
curl -H "Origin: https://s967.org" \
  https://PROJECT_REF.supabase.co/functions/v1/map-template-list

curl -H "Origin: https://s967.org" \
  "https://PROJECT_REF.supabase.co/functions/v1/map-template-load?templateId=TEMPLATE_UUID"

curl -H "Origin: https://s967.org" \
  -H "Authorization: Bearer ADMIN_SESSION_TOKEN" \
  https://PROJECT_REF.supabase.co/functions/v1/map-template-admin
```

For create/replace smoke tests, use a canonical object produced by `serializeTemplate()` as
`template_data`; do not invent a reduced example and apply it directly to production. All responses use
`Cache-Control: no-store`. The admin POST request and its `template_data` are limited to 8 MiB, which fits a
full practical fixed-range map while preventing unbounded JSON parsing.

Do not apply this change directly to production without first validating migration, authentication, list,
detail, create, rename, replace, and delete behavior in staging.
