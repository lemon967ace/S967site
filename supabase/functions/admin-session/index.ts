import { corsHeaders, json, verifyAdminSession } from "../_shared/admin-auth.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin, "GET") });
  if (req.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405, origin, "GET");
  const auth = await verifyAdminSession(req);
  return auth.ok ? json({ ok: true }, 200, origin, "GET") : json({ error: auth.error }, auth.status, origin, "GET");
});
