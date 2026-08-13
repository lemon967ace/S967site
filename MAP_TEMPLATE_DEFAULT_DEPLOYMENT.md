# Default map template deployment

Apply this stage in the following production order:

1. Run `supabase/migrations/202608130003_map_template_default.sql`.
2. Redeploy the self-contained Dashboard file for `map-template-admin`.
3. Redeploy the self-contained Dashboard file for `map-template-list`.
4. Redeploy the self-contained Dashboard file for `map-template-load`.
5. Publish the updated `/admin/`, `/map/`, and `/map/editor/` site files, including
   `/map/map-new-flow.js`.

Keep **Verify JWT** disabled for the three template functions as documented previously. Test in staging first:
set a default, replace it with another default, clear it, delete a current default, and verify that public list
returns zero or one `is_default: true` row. Then verify that the new-map form preselects that row without user
interaction. Do not register or convert the reference `새 문서.isomap` as part of this deployment.
