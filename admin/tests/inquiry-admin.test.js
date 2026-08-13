import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../../supabase/functions/inquiry-admin/index.ts", import.meta.url), "utf8",
);

test("inquiry-admin is standalone and removes legacy authentication", () => {
  assert.doesNotMatch(source, /\.\.\/_shared\/admin-auth\.ts/);
  assert.equal((source.match(/^import /gm) || []).length, 1);
  assert.doesNotMatch(source, /ADMIN_SECRET|adminSecret|providedSecret|x-admin-secret/i);
});

test("embedded verifier strictly parses Bearer sessions", () => {
  assert.match(source, /match\(\/\^Bearer \(\[A-Za-z0-9_-\]\+\)\$\//);
  assert.match(source, /error: "UNAUTHORIZED", status: 401/);
  assert.match(source, /async function verifyAdminSession\(req: Request\)/);
});

test("admin session hashing, lookup, expiry cleanup, and fail-closed errors remain", () => {
  assert.match(source, /crypto\.subtle\.digest\("SHA-256", encoder\.encode\(value\)\)/);
  assert.match(source, /from\("admin_sessions"\)/);
  assert.match(source, /\.select\("expires_at"\)\.eq\("token_hash", tokenHash\)\.maybeSingle\(\)/);
  assert.match(source, /error: "INVALID_SESSION", status: 401/);
  assert.match(source, /error: "SESSION_EXPIRED", status: 401/);
  assert.match(source, /error: "DATABASE_ERROR", status: 500/);
  assert.match(source, /from\("admin_sessions"\)\.delete\(\)\.eq\("token_hash", tokenHash\)/);
  assert.doesNotMatch(source, /map_sessions|raw_token/i);
});

test("OPTIONS and origin precede auth, which precedes GET and POST", () => {
  const auth = source.indexOf("await verifyAdminSession(req)");
  assert.ok(auth > source.indexOf('req.method ===\n      "OPTIONS"'));
  assert.ok(auth > source.indexOf("!ALLOWED_ORIGINS.has(origin)"));
  assert.ok(auth < source.indexOf('req.method ===\n        "GET"'));
  assert.ok(auth < source.indexOf('req.method !==\n        "POST"'));
  assert.match(source, /if \(!admin\.ok\)[\s\S]*admin\.error[\s\S]*admin\.status/);
});

test("production CORS and method contracts remain", () => {
  assert.match(source, /"https:\/\/s967\.org"/);
  assert.match(source, /"https:\/\/www\.s967\.org"/);
  assert.match(source, /"Access-Control-Allow-Headers": "authorization, content-type"/);
  assert.match(source, /"Access-Control-Allow-Methods": "GET, POST, OPTIONS"/);
  assert.match(source, /Origin not allowed\.[\s\S]*403/);
  assert.match(source, /Method not allowed\.[\s\S]*405/);
  assert.doesNotMatch(source, /Access-Control-Allow-Origin": "\*"/);
});

test("service-role client structure remains", () => {
  assert.match(source, /Deno\.env\.get\([\s\S]*"SUPABASE_URL"/);
  assert.match(source, /Deno\.env\.get\([\s\S]*"SUPABASE_SERVICE_ROLE_KEY"/);
  assert.match(source, /createClient\([\s\S]*supabaseUrl,[\s\S]*serviceRoleKey/);
});

test("GET retains recipients/settings parallel queries and defaults", () => {
  assert.match(source, /Promise\.all\(\[/);
  assert.match(source, /from\([\s\S]*"inquiry_email_recipients"[\s\S]*select\("\*"\)[\s\S]*"display_order"[\s\S]*ascending:[\s\S]*true/);
  assert.match(source, /from\([\s\S]*"inquiry_settings"[\s\S]*"id,inquiry_open,updated_at"[\s\S]*\.eq\([\s\S]*"id"[\s\S]*1[\s\S]*\.maybeSingle\(\)/);
  assert.match(source, /\.inquiry_open \?\?[\s\S]*true/);
  assert.match(source, /\.updated_at \?\?[\s\S]*null/);
  assert.match(source, /email_recipients:[\s\S]*recipientsResult[\s\S]*\.data \?\?[\s\S]*\[\]/);
});

test("update_inquiry_open retains boolean validation and upsert contract", () => {
  assert.match(source, /case "update_inquiry_open"/);
  assert.match(source, /typeof body[\s\S]*\.inquiry_open !==[\s\S]*"boolean"/);
  assert.match(source, /inquiry_open must be boolean\.[\s\S]*400/);
  assert.match(source, /from\([\s\S]*"inquiry_settings"[\s\S]*\.upsert\([\s\S]*id: 1[\s\S]*inquiry_open:[\s\S]*inquiryOpen[\s\S]*onConflict:[\s\S]*"id"/);
  assert.match(source, /"id,inquiry_open,updated_at"[\s\S]*\.single\(\)/);
});

test("add recipient retains validation and increasing display order", () => {
  assert.match(source, /case "add_inquiry_email_recipient"/);
  assert.match(source, /Email is required\.[\s\S]*400/);
  assert.match(source, /select\([\s\S]*"display_order"[\s\S]*ascending:[\s\S]*false[\s\S]*\.limit\(1\)/);
  assert.match(source, /const nextOrder =[\s\S]*display_order \?\?[\s\S]*0[\s\S]*\+ 1/);
  assert.match(source, /active:[\s\S]*true[\s\S]*display_order:[\s\S]*nextOrder/);
  assert.match(source, /recipient:[\s\S]*data/);
});

test("update and delete recipient contracts remain", () => {
  assert.match(source, /case "update_inquiry_email_recipient"[\s\S]*Number\.isInteger[\s\S]*Invalid email recipient\./);
  assert.match(source, /body\?\.active ===[\s\S]*true/);
  assert.match(source, /updated_at:[\s\S]*new Date\(\)[\s\S]*\.toISOString\(\)/);
  assert.match(source, /case "delete_inquiry_email_recipient"[\s\S]*\.delete\(\)[\s\S]*\.eq\([\s\S]*"id"/);
});

test("unknown action and error-message contracts remain", () => {
  assert.match(source, /default:[\s\S]*Unknown action\.[\s\S]*400/);
  assert.match(source, /error instanceof[\s\S]*Error[\s\S]*error\.message[\s\S]*Internal server error\./);
});
