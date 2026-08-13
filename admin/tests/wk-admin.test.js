import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../../supabase/functions/wk-admin/index.ts", import.meta.url), "utf8",
);

test("wk-admin is standalone and legacy secret authentication is absent", () => {
  assert.doesNotMatch(source, /\.\.\/_shared\/admin-auth\.ts/);
  assert.equal((source.match(/^import /gm) || []).length, 1);
  assert.doesNotMatch(source, /ADMIN_SECRET|adminSecret|providedSecret|x-admin-secret/i);
});

test("strict embedded Bearer verifier rejects missing and malformed tokens", () => {
  assert.match(source, /match\(\/\^Bearer \(\[A-Za-z0-9_-\]\+\)\$\//);
  assert.match(source, /error: "UNAUTHORIZED", status: 401/);
  assert.match(source, /async function verifyAdminSession\(req: Request\)/);
});

test("embedded verifier hashes and validates only admin sessions", () => {
  assert.match(source, /crypto\.subtle\.digest\("SHA-256", encoder\.encode\(value\)\)/);
  assert.match(source, /from\("admin_sessions"\)/);
  assert.match(source, /\.select\("expires_at"\)\.eq\("token_hash", tokenHash\)\.maybeSingle\(\)/);
  assert.match(source, /error: "INVALID_SESSION", status: 401/);
  assert.match(source, /error: "SESSION_EXPIRED", status: 401/);
  assert.match(source, /error: "DATABASE_ERROR", status: 500/);
  assert.match(source, /from\("admin_sessions"\)\.delete\(\)\.eq\("token_hash", tokenHash\)/);
  assert.doesNotMatch(source, /map_sessions|raw_token/i);
});

test("OPTIONS and production-origin CORS contracts remain valid", () => {
  assert.match(source, /"https:\/\/s967\.org"/);
  assert.match(source, /"https:\/\/www\.s967\.org"/);
  assert.match(source, /"Access-Control-Allow-Headers": "authorization, content-type"/);
  assert.match(source, /"Access-Control-Allow-Methods": "GET, POST, OPTIONS"/);
  assert.match(source, /req\.method === "OPTIONS"/);
  assert.doesNotMatch(source, /"Access-Control-Allow-Origin": "\*"/);
});

test("verification precedes both GET and POST business logic", () => {
  const auth = source.indexOf("await verifyAdminSession(req)");
  assert.ok(auth > source.indexOf('req.method === "OPTIONS"'));
  assert.ok(auth < source.indexOf('req.method === "GET"'));
  assert.ok(auth < source.indexOf('req.method !== "POST"'));
  assert.match(source, /if \(!admin\.ok\)[\s\S]*admin\.error[\s\S]*admin\.status/);
});

test("service-role client and WK cycle policy remain", () => {
  assert.match(source, /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  assert.match(source, /createClient\([\s\S]*supabaseUrl,[\s\S]*serviceRoleKey/);
  assert.match(source, /"2026-08-15T09:00:00\+09:00"/);
  assert.match(source, /const CYCLE_DAYS =[\s\S]*14/);
  assert.match(source, /function getCurrentCycleNumber\(\)/);
  assert.match(source, /Math\.floor\([\s\S]*elapsed \/ cycleMs/);
});

test("GET retains all six WK queries, filters, limits, and response defaults", () => {
  for (const contract of [
    'from("wk_tiers")', 'from("wk_alliances")', 'from("wk_settings")',
    'from("wk_email_recipients")', 'from("wk_email_exports")',
    'from("wk_applications")', '.limit(20)', '.limit(500)',
    '"cycle_number",', 'currentCycleNumber,', '"auto"',
    'email_auto_send_enabled:', 'current_cycle_number:',
  ]) assert.ok(source.includes(contract), contract);
  assert.match(source, /Promise\.all\(\[/);
});

test("all Tier actions and their ordering contracts remain", () => {
  for (const action of ["delete_tier", "add_tier", "update_tier", "toggle_tier", "reorder_tiers"])
    assert.ok(source.includes(`case "${action}"`), action);
  for (const contract of ["Tier name is required.", "display_order:", "nextOrder", "active: true",
    'admin_note: ""', "admin_note:", "body?.active === true", "i + 1"])
    assert.ok(source.includes(contract), contract);
});

test("all Alliance actions and their ordering contracts remain", () => {
  for (const action of ["delete_alliance", "add_alliance", "update_alliance", "toggle_alliance", "reorder_alliances"])
    assert.ok(source.includes(`case "${action}"`), action);
  assert.match(source, /Alliance name is required\./);
});

test("application mode policy and response remain", () => {
  assert.match(source, /case "update_application_mode"/);
  for (const mode of ['"auto"', '"open"', '"closed"']) assert.ok(source.includes(mode));
  assert.match(source, /application_mode:[\s\S]*mode/);
  assert.match(source, /ok: true,[\s\S]*settings: data/);
});

test("email recipient CRUD and auto-send contracts remain", () => {
  for (const action of ["add_email_recipient", "update_email_recipient", "delete_email_recipient", "update_email_auto_send"])
    assert.ok(source.includes(`case "${action}"`), action);
  for (const contract of ["nickname", "email", "active", "display_order", "body?.enabled === true",
    "email_auto_send_enabled:", "recipient: data"])
    assert.ok(source.includes(contract), contract);
});

test("unknown action and existing business-error response remain", () => {
  assert.match(source, /default:[\s\S]*"Unknown action\."[\s\S]*400/);
  assert.match(source, /error instanceof Error[\s\S]*error\.message[\s\S]*"Internal server error\."/);
});
