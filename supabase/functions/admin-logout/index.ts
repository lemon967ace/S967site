import { bearerToken, corsHeaders, json, serviceClient, sha256 } from "../_shared/admin-auth.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin, "POST") });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405, origin, "POST");
  const token = bearerToken(req);
  if (!token) return json({ error: "UNAUTHORIZED" }, 401, origin, "POST");
  const { error } = await serviceClient().from("admin_sessions").delete().eq("token_hash", await sha256(token));
  return error ? json({ error: "DATABASE_ERROR" }, 500, origin, "POST") : json({ ok: true }, 200, origin, "POST");
});
