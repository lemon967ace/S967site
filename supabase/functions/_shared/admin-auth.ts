import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export const ADMIN_SESSION_HOURS = 8;
export const ADMIN_ORIGIN = "https://s967.org";
const encoder = new TextEncoder();

export function corsHeaders(origin: string | null, methods: string) {
  return {
    ...(origin === ADMIN_ORIGIN ? { "Access-Control-Allow-Origin": ADMIN_ORIGIN } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": `${methods}, OPTIONS`,
    Vary: "Origin",
  };
}

export function json(body: unknown, status: number, origin: string | null, methods: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin, methods), "Content-Type": "application/json; charset=utf-8" },
  });
}

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SERVER_CONFIGURATION_ERROR");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function secureToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function passwordMatches(candidate: string): Promise<boolean> {
  const expected = Deno.env.get("ADMIN_PASSWORD");
  if (!expected || !candidate) return false;
  const [left, right] = await Promise.all([sha256(candidate), sha256(expected)]);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export function bearerToken(req: Request): string | null {
  const match = req.headers.get("Authorization")?.match(/^Bearer ([A-Za-z0-9_-]+)$/);
  return match?.[1] || null;
}

export type AdminVerification = { ok: true; tokenHash: string } | { ok: false; error: string; status: number };

export async function verifyAdminSession(req: Request, db = serviceClient()): Promise<AdminVerification> {
  const token = bearerToken(req);
  if (!token) return { ok: false, error: "UNAUTHORIZED", status: 401 };
  const tokenHash = await sha256(token);
  const { data, error } = await db.from("admin_sessions").select("expires_at").eq("token_hash", tokenHash).maybeSingle();
  if (error) return { ok: false, error: "DATABASE_ERROR", status: 500 };
  if (!data) return { ok: false, error: "INVALID_SESSION", status: 401 };
  const expiresAt = new Date(data.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await db.from("admin_sessions").delete().eq("token_hash", tokenHash);
    return { ok: false, error: "SESSION_EXPIRED", status: 401 };
  }
  return { ok: true, tokenHash };
}
