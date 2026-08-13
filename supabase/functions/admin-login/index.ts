import { ADMIN_SESSION_HOURS, corsHeaders, json, passwordMatches, secureToken, serviceClient, sha256 } from "../_shared/admin-auth.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin, "POST") });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405, origin, "POST");
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.password !== "string" || !(await passwordMatches(body.password))) {
      return json({ error: "INVALID_CREDENTIALS" }, 401, origin, "POST");
    }
    const db = serviceClient();
    await db.from("admin_sessions").delete().lte("expires_at", new Date().toISOString());
    const sessionToken = secureToken();
    const tokenHash = await sha256(sessionToken);
    const expiresAt = new Date(Date.now() + ADMIN_SESSION_HOURS * 60 * 60 * 1000).toISOString();
    const { error } = await db.from("admin_sessions").insert({ token_hash: tokenHash, expires_at: expiresAt });
    if (error) return json({ error: "DATABASE_ERROR" }, 500, origin, "POST");
    return json({ ok: true, sessionToken, expiresAt }, 200, origin, "POST");
  } catch (error) {
    console.error("admin-login", error);
    return json({ error: "INTERNAL_SERVER_ERROR" }, 500, origin, "POST");
  }
});
