import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const ALLOWED_ORIGINS = new Set(["https://s967.org", "https://www.s967.org"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://s967.org",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
}

Deno.serve(async req => {
  const origin = req.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(req, { error: "Origin not allowed." }, 403);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "GET") return json(req, { error: "Method not allowed." }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(req, { error: "SERVER_CONFIGURATION_ERROR" }, 500);
  const id = new URL(req.url).searchParams.get("templateId") ?? "";
  if (!UUID.test(id)) return json(req, { error: "Invalid template ID." }, 400);
  try {
    const { data, error } = await db.from("map_templates")
      .select("id,name_ko,name_en,name_ja,name_ru,is_default,template_data,updated_at").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return json(req, { error: "Template not found." }, 404);
    return json(req, { ok: true, template: { id: data.id, name_ko: data.name_ko, name_en: data.name_en,
      name_ja: data.name_ja, name_ru: data.name_ru, isDefault: data.is_default,
      templateData: data.template_data, updatedAt: data.updated_at } });
  } catch (error) {
    console.error("Map template load failed:", error);
    return json(req, { error: "DATABASE_ERROR" }, 500);
  }
});
