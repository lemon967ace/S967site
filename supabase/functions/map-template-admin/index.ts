import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const ALLOWED_ORIGINS = new Set(["https://s967.org", "https://www.s967.org"]);
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAP = { min_x: 0, max_x: 511, min_y: 0, max_y: 1023 };

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://s967.org",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
}
function bearerToken(req: Request) {
  return req.headers.get("Authorization")?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1] ?? null;
}
async function sha256(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}
type AuthResult = { ok: true } | { ok: false; error: string; status: number };
async function verifyAdminSession(req: Request): Promise<AuthResult> {
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
  return { ok: true };
}

class TemplateValidationError extends Error {}
function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function stringValue(value: unknown) {
  if (typeof value !== "string") throw new TemplateValidationError("Template string field is invalid.");
  return value;
}
function integer(value: unknown) {
  if (!Number.isInteger(value)) throw new TemplateValidationError("Template integer field is invalid.");
  return value as number;
}
function finiteNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TemplateValidationError("Template number field is invalid.");
  return value;
}
function nonEmpty(value: unknown, label: string) {
  const result = stringValue(value).trim();
  if (!result) throw new TemplateValidationError(`${label} must be non-empty.`);
  return result;
}
function cellValid(x: unknown, y: unknown) {
  return Number.isInteger(x) && Number.isInteger(y) && (x as number) >= 0 && (x as number) <= 511 &&
    (y as number) >= 0 && (y as number) <= 1023 && Math.abs((x as number) % 2) === Math.abs((y as number) % 2);
}
function occupiedCells(x: number, y: number, width: number) {
  return width === 1 ? [[x, y]] : [[x - 1, y - 1], [x, y - 2], [x + 1, y - 1], [x, y]];
}
function canonicalTemplate(input: unknown) {
  if (!plain(input) || input.format !== "pns-map-template") throw new TemplateValidationError("Unsupported template format.");
  if (input.version !== 1) throw new TemplateValidationError("Unsupported template version.");
  if (!plain(input.map) || Object.keys(input.map).length !== 4 || Object.entries(MAP).some(([k, v]) => input.map[k] !== v)) {
    throw new TemplateValidationError("Template map dimensions do not match.");
  }
  for (const key of ["fixed_building_types", "fixed_buildings", "fixed_ranges"]) {
    if (!Array.isArray(input[key])) throw new TemplateValidationError("Template collections must be arrays.");
  }
  const typeIds = new Set<string>();
  const types = new Map<string, { width: number; height: number }>();
  const fixedBuildingTypes = (input.fixed_building_types as unknown[]).map(raw => {
    if (!plain(raw)) throw new TemplateValidationError("Fixed building type is invalid.");
    const id = nonEmpty(raw.id, "Fixed building type ID");
    const name = nonEmpty(raw.name, "Fixed building type name");
    const color = nonEmpty(raw.color, "Fixed building type color");
    const width = integer(raw.width), height = integer(raw.height);
    if (!((width === 1 && height === 1) || (width === 2 && height === 2))) throw new TemplateValidationError("Fixed building type size must be 1x1 or 2x2.");
    if (typeIds.has(id)) throw new TemplateValidationError(`Duplicate fixed building type ID: ${id}`);
    typeIds.add(id); types.set(id, { width, height });
    return { id, name, color, width, height };
  });
  const buildingIds = new Set<string>(), buildingCells = new Set<string>();
  const fixedBuildings = (input.fixed_buildings as unknown[]).map(raw => {
    if (!plain(raw)) throw new TemplateValidationError("Fixed building is invalid.");
    const id = nonEmpty(raw.id, "Fixed building ID");
    if (buildingIds.has(id)) throw new TemplateValidationError(`Duplicate fixed building ID: ${id}`);
    buildingIds.add(id);
    const name = nonEmpty(raw.name, "Fixed building name"), typeId = nonEmpty(raw.type_id, "Fixed building type ID");
    const type = types.get(typeId);
    if (!type) throw new TemplateValidationError(`Unknown fixed building type ID: ${typeId}`);
    const x = integer(raw.x), y = integer(raw.y);
    for (const [cellX, cellY] of occupiedCells(x, y, type.width)) {
      if (!cellValid(cellX, cellY)) throw new TemplateValidationError("Fixed building is outside the map.");
      const key = `${cellX},${cellY}`;
      if (buildingCells.has(key)) throw new TemplateValidationError(`Fixed building collision: ${key}`);
      buildingCells.add(key);
    }
    return { id, name, type_id: typeId, x, y };
  });
  const rangeIds = new Set<string>(), allRangeCells = new Set<string>();
  const fixedRanges = (input.fixed_ranges as unknown[]).map(raw => {
    if (!plain(raw)) throw new TemplateValidationError("Fixed range is invalid.");
    const id = nonEmpty(raw.id, "Fixed range ID");
    if (rangeIds.has(id)) throw new TemplateValidationError(`Duplicate fixed range ID: ${id}`);
    rangeIds.add(id);
    const kind = nonEmpty(raw.kind, "Fixed range kind"), color = nonEmpty(raw.color, "Fixed range color");
    if (kind !== "allowed" && kind !== "blocked") throw new TemplateValidationError("Range kind must be allowed or blocked.");
    if (!Array.isArray(raw.cells)) throw new TemplateValidationError("Range cells must be an array.");
    const own = new Map<string, [number, number]>();
    for (const cell of raw.cells) {
      if (!Array.isArray(cell) || cell.length !== 2 || !cellValid(cell[0], cell[1])) throw new TemplateValidationError("Range contains an invalid map cell.");
      own.set(`${cell[0]},${cell[1]}`, [cell[0] as number, cell[1] as number]);
    }
    if (!own.size) throw new TemplateValidationError("Range must contain at least one cell.");
    for (const key of own.keys()) {
      if (allRangeCells.has(key)) throw new TemplateValidationError(`Overlapping fixed range cell: ${key}`);
      allRangeCells.add(key);
    }
    return { id, kind, color, cells: [...own.values()] };
  });
  if (!plain(input.view)) throw new TemplateValidationError("Template view is invalid.");
  const centerX = integer(input.view.center_x), centerY = integer(input.view.center_y), zoom = finiteNumber(input.view.zoom);
  if (!cellValid(centerX, centerY) || zoom < 0.01 || zoom > 4) throw new TemplateValidationError("Template view is invalid.");
  return { format: "pns-map-template", version: 1, map: { ...MAP }, fixed_building_types: fixedBuildingTypes,
    fixed_buildings: fixedBuildings, fixed_ranges: fixedRanges, view: { center_x: centerX, center_y: centerY, zoom } };
}
function names(body: Record<string, unknown>) {
  const result: Record<string, string> = {};
  for (const field of ["name_ko", "name_en", "name_ja", "name_ru"]) {
    if (typeof body[field] !== "string") throw new TemplateValidationError(`${field} is required.`);
    const value = (body[field] as string).trim();
    if (!value || [...value].length > 100 || /[\u0000-\u001f\u007f]/u.test(value)) throw new TemplateValidationError(`${field} is invalid.`);
    result[field] = value;
  }
  return result as { name_ko: string; name_en: string; name_ja: string; name_ru: string };
}
async function existing(id: string) {
  const result = await db.from("map_templates").select("id").eq("id", id).maybeSingle();
  if (result.error) throw result.error;
  return Boolean(result.data);
}

Deno.serve(async req => {
  const origin = req.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(req, { error: "Origin not allowed." }, 403);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "GET" && req.method !== "POST") return json(req, { error: "Method not allowed." }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(req, { error: "SERVER_CONFIGURATION_ERROR" }, 500);
  const auth = await verifyAdminSession(req);
  if (!auth.ok) return json(req, { error: auth.error }, auth.status);
  try {
    if (req.method === "GET") {
      const id = new URL(req.url).searchParams.get("id");
      if (id !== null) {
        if (!UUID.test(id)) return json(req, { error: "Invalid template ID." }, 400);
        const { data, error } = await db.from("map_templates").select("*").eq("id", id).maybeSingle();
        if (error) throw error;
        if (!data) return json(req, { error: "Template not found." }, 404);
        return json(req, { ok: true, template: data });
      }
      const { data, error } = await db.from("map_templates").select("id,name_ko,name_en,name_ja,name_ru,is_default,created_at,updated_at").order("created_at", { ascending: true }).order("id", { ascending: true });
      if (error) throw error;
      return json(req, { ok: true, templates: data ?? [] });
    }
    const declared = Number(req.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) return json(req, { error: "Request too large." }, 413);
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) return json(req, { error: "Request too large." }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return json(req, { error: "Invalid JSON." }, 400); }
    if (!plain(body)) return json(req, { error: "Invalid request body." }, 400);
    const action = body.action;
    if (action === "create_template") {
      const templateNames = names(body), templateData = canonicalTemplate(body.template_data);
      const { data, error } = await db.from("map_templates").insert({ ...templateNames, template_data: templateData }).select("id,name_ko,name_en,name_ja,name_ru,is_default,created_at,updated_at").single();
      if (error) throw error;
      return json(req, { ok: true, template: data }, 201);
    }
    if (action === "clear_default_template") {
      const { data, error } = await db.rpc("set_map_template_default", { p_template_id: null });
      if (error) throw error;
      return json(req, { ok: true, default_template_id: null, result: data });
    }
    if (!["update_template_names", "replace_template_file", "delete_template", "set_default_template"].includes(String(action))) return json(req, { error: "Unknown action." }, 400);
    const id = typeof body.id === "string" ? body.id : "";
    if (!UUID.test(id)) return json(req, { error: "Invalid template ID." }, 400);
    if (action === "set_default_template") {
      const { data, error } = await db.rpc("set_map_template_default", { p_template_id: id });
      if (error) throw error;
      if (data !== true) return json(req, { error: "Template not found." }, 404);
      return json(req, { ok: true, default_template_id: id });
    }
    if (!(await existing(id))) return json(req, { error: "Template not found." }, 404);
    if (action === "update_template_names") {
      const { data, error } = await db.from("map_templates").update({ ...names(body), updated_at: new Date().toISOString() }).eq("id", id).select("id,name_ko,name_en,name_ja,name_ru,is_default,created_at,updated_at").single();
      if (error) throw error;
      return json(req, { ok: true, template: data });
    }
    if (action === "replace_template_file") {
      const templateData = canonicalTemplate(body.template_data);
      const { data, error } = await db.from("map_templates").update({ template_data: templateData, updated_at: new Date().toISOString() }).eq("id", id).select("id,name_ko,name_en,name_ja,name_ru,is_default,created_at,updated_at").single();
      if (error) throw error;
      return json(req, { ok: true, template: data });
    }
    const { error } = await db.from("map_templates").delete().eq("id", id);
    if (error) throw error;
    return json(req, { ok: true, deleted_template_id: id });
  } catch (error) {
    if (error instanceof TemplateValidationError) return json(req, { error: error.message }, 400);
    console.error("Map template admin failed:", error);
    return json(req, { error: "DATABASE_ERROR" }, 500);
  }
});
