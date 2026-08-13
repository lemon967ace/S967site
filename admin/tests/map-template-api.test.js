import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const [migration, admin, list, load, deployment] = await Promise.all([
  read("supabase/migrations/202608130002_map_templates.sql"),
  read("supabase/functions/map-template-admin/index.ts"),
  read("supabase/functions/map-template-list/index.ts"),
  read("supabase/functions/map-template-load/index.ts"),
  read("MAP_TEMPLATE_DEPLOYMENT.md"),
]);

test("migration defines the minimal map_templates schema", () => {
  assert.match(migration, /create table if not exists public\.map_templates/);
  assert.match(migration, /id uuid primary key default gen_random_uuid\(\)/);
  for (const field of ["name_ko", "name_en", "name_ja", "name_ru"]) assert.match(migration, new RegExp(`${field} text not null`));
  assert.match(migration, /template_data jsonb not null/);
  assert.match(migration, /created_at timestamptz not null default now\(\)/);
  assert.match(migration, /updated_at timestamptz not null default now\(\)/);
  assert.doesNotMatch(migration, /unique\s*\([^)]*name_/i);
});

test("migration locks direct browser access behind RLS", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /revoke all on table public\.map_templates from anon, authenticated/);
  assert.match(migration, /grant all on table public\.map_templates to service_role/);
  assert.doesNotMatch(migration, /create policy/i);
});

test("database and server share the 1..100 controlled name contract", () => {
  assert.match(migration, /char_length\(btrim\(name_ko\)\) between 1 and 100/);
  assert.match(migration, /\[\[:cntrl:\]\]/);
  assert.match(admin, /> 100/);
  assert.match(admin, /\\u0000-\\u001f\\u007f/);
  assert.match(admin, /\.trim\(\)/);
});

test("admin function is Dashboard-self-contained", () => {
  assert.match(admin, /npm:@supabase\/supabase-js@2/);
  assert.doesNotMatch(admin, /\.\.\/_shared|editor-template\.js|map_sessions/);
  assert.match(admin, /Deno\.serve/);
});

test("admin authentication matches the common session contract", () => {
  assert.match(admin, /\^Bearer \(\[A-Za-z0-9_-\]\+\)\$/);
  assert.match(admin, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(admin, /from\("admin_sessions"\)/);
  assert.match(admin, /select\("expires_at"\)/);
  assert.match(admin, /delete\(\)\.eq\("token_hash", tokenHash\)/);
  for (const error of ["UNAUTHORIZED", "INVALID_SESSION", "SESSION_EXPIRED", "DATABASE_ERROR"]) assert.match(admin, new RegExp(error));
});

test("admin CORS, no-store, methods, and origin rejection are explicit", () => {
  for (const origin of ["https://s967.org", "https://www.s967.org"]) assert.match(admin, new RegExp(origin.replaceAll(".", "\\.")));
  assert.match(admin, /authorization, content-type/);
  assert.match(admin, /GET, POST, OPTIONS/);
  assert.match(admin, /"Cache-Control": "no-store"/);
  assert.match(admin, /origin && !ALLOWED_ORIGINS\.has\(origin\)/);
});

test("admin GET separates list and detail payload cost", () => {
  assert.match(admin, /searchParams\.get\("id"\)/);
  assert.match(admin, /select\("\*"\)/);
  assert.match(admin, /select\("id,name_ko,name_en,name_ja,name_ru,is_default,created_at,updated_at"\)/);
  assert.match(admin, /order\("created_at", \{ ascending: true \}\)\.order\("id", \{ ascending: true \}\)/);
});

test("admin identifiers distinguish malformed and missing records", () => {
  assert.match(admin, /const UUID = \/\^\[0-9a-f\]/);
  assert.match(admin, /Invalid template ID[\s\S]*400/);
  assert.match(admin, /Template not found[\s\S]*404/);
  assert.match(admin, /maybeSingle\(\)/);
});

test("create requires four names and canonical template data", () => {
  assert.match(admin, /action === "create_template"/);
  for (const field of ["name_ko", "name_en", "name_ja", "name_ru"]) assert.match(admin, new RegExp(`"${field}"`));
  assert.match(admin, /canonicalTemplate\(body\.template_data\)/);
  assert.match(admin, /insert\(\{ \.\.\.templateNames, template_data: templateData \}\)/);
  assert.match(admin, /201/);
});

test("rename updates names and timestamp without template_data", () => {
  const section = admin.slice(admin.indexOf('if (action === "update_template_names")'), admin.indexOf('if (action === "replace_template_file")'));
  assert.match(section, /names\(body\)/);
  assert.match(section, /updated_at: new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(section, /template_data:/);
});

test("replace validates file and preserves names", () => {
  const section = admin.slice(admin.indexOf('if (action === "replace_template_file")'), admin.indexOf('const \{ error \} = await db.from("map_templates").delete'));
  assert.match(section, /canonicalTemplate\(body\.template_data\)/);
  assert.match(section, /template_data: templateData/);
  assert.match(section, /updated_at: new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(section, /name_ko:/);
});

test("delete only removes the template row", () => {
  assert.match(admin, /"delete_template"/);
  assert.match(admin, /from\("map_templates"\)\.delete\(\)\.eq\("id", id\)/);
  assert.match(admin, /deleted_template_id/);
  assert.doesNotMatch(admin, /map_documents|map_sessions/);
});

test("server validator enforces canonical header, map, and collections", () => {
  assert.match(admin, /input\.format !== "pns-map-template"/);
  assert.match(admin, /input\.version !== 1/);
  for (const bound of ["min_x: 0", "max_x: 511", "min_y: 0", "max_y: 1023"]) assert.match(admin, new RegExp(bound));
  for (const key of ["fixed_building_types", "fixed_buildings", "fixed_ranges"]) assert.match(admin, new RegExp(key));
  assert.match(admin, /Object\.keys\(input\.map\)\.length !== 4/);
});

test("server validator enforces fixed type and building parity", () => {
  assert.match(admin, /width === 1 && height === 1/);
  assert.match(admin, /width === 2 && height === 2/);
  assert.match(admin, /Duplicate fixed building type ID/);
  assert.match(admin, /Unknown fixed building type ID/);
  assert.match(admin, /Duplicate fixed building ID/);
  assert.match(admin, /Fixed building collision/);
  assert.match(admin, /Math\.abs\(\(x as number\) % 2\) === Math\.abs\(\(y as number\) % 2\)/);
});

test("server validator normalizes range cells and rejects cross-range overlap", () => {
  assert.match(admin, /kind !== "allowed" && kind !== "blocked"/);
  assert.match(admin, /const own = new Map/);
  assert.match(admin, /own\.set\(`/);
  assert.match(admin, /Range must contain at least one cell/);
  assert.match(admin, /Overlapping fixed range cell/);
  assert.match(admin, /cells: \[\.\.\.own\.values\(\)\]/);
});

test("server validator validates and normalizes view", () => {
  assert.match(admin, /integer\(input\.view\.center_x\)/);
  assert.match(admin, /integer\(input\.view\.center_y\)/);
  assert.match(admin, /zoom < 0\.01 \|\| zoom > 4/);
  assert.match(admin, /view: \{ center_x: centerX, center_y: centerY, zoom \}/);
});

test("canonical reconstruction drops client-only properties", () => {
  assert.match(admin, /return \{ format: "pns-map-template", version: 1/);
  assert.match(admin, /return \{ id, name, color, width, height \}/);
  assert.match(admin, /return \{ id, name, type_id: typeId, x, y \}/);
  assert.match(admin, /return \{ id, kind, color, cells:/);
});

test("admin request size is bounded before database mutation", () => {
  assert.match(admin, /MAX_REQUEST_BYTES = 8 \* 1024 \* 1024/);
  assert.match(admin, /content-length/);
  assert.match(admin, /TextEncoder\(\)\.encode\(raw\)\.byteLength/);
  assert.match(admin, /Request too large[\s\S]*413/);
  assert.ok(admin.indexOf("byteLength > MAX_REQUEST_BYTES") < admin.indexOf('action === "create_template"'));
});

test("public list is unauthenticated, metadata-only, and deterministic", () => {
  assert.doesNotMatch(list, /Authorization|admin_sessions|template_data/);
  assert.match(list, /select\("id,name_ko,name_en,name_ja,name_ru,is_default,updated_at"\)/);
  assert.match(list, /order\("created_at", \{ ascending: true \}\)\.order\("id", \{ ascending: true \}\)/);
  assert.match(list, /templates: data \?\? \[\]/);
});

test("public load is unauthenticated and exposes the documented shape", () => {
  assert.doesNotMatch(load, /Authorization|admin_sessions/);
  assert.match(load, /searchParams\.get\("templateId"\)/);
  assert.match(load, /templateData: data\.template_data/);
  assert.match(load, /updatedAt: data\.updated_at/);
  assert.match(load, /Invalid template ID[\s\S]*400/);
  assert.match(load, /Template not found[\s\S]*404/);
});

test("public functions restrict CORS, methods, and caching", () => {
  for (const source of [list, load]) {
    assert.match(source, /https:\/\/s967\.org/);
    assert.match(source, /https:\/\/www\.s967\.org/);
    assert.match(source, /GET, OPTIONS/);
    assert.match(source, /"Cache-Control": "no-store"/);
    assert.match(source, /origin && !ALLOWED_ORIGINS\.has\(origin\)/);
    assert.match(source, /Method not allowed[\s\S]*405/);
  }
});

test("all Edge Function deployment files are runtime self-contained", () => {
  for (const source of [admin, list, load]) {
    assert.doesNotMatch(source, /from\s+["']\.\.?\//);
    assert.match(source, /npm:@supabase\/supabase-js@2/);
    assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  }
});

test("deployment guide puts migration and existing admin sessions first", () => {
  assert.ok(deployment.indexOf("202608130002_map_templates.sql") < deployment.indexOf("map-template-admin"));
  assert.match(deployment, /admin-login/);
  assert.match(deployment, /admin-session/);
  assert.match(deployment, /admin-logout/);
  assert.match(deployment, /staging/);
  assert.match(deployment, /8 MiB/);
});
