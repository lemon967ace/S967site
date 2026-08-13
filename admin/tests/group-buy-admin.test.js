import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../../supabase/functions/group-buy-admin/index.ts", import.meta.url), "utf8",
);

test("group-buy-admin is standalone and removes legacy authentication", () => {
  assert.doesNotMatch(source, /\.\.\/_shared\/admin-auth\.ts/);
  assert.equal((source.match(/^import /gm) || []).length, 1);
  assert.doesNotMatch(source, /ADMIN_SECRET|adminSecret|requireAdmin|received|x-admin-secret/i);
});

test("embedded verifier strictly parses and hashes admin Bearer sessions", () => {
  assert.match(source, /match\(\/\^Bearer \(\[A-Za-z0-9_-\]\+\)\$\//);
  assert.match(source, /crypto\.subtle\.digest\("SHA-256", encoder\.encode\(value\)\)/);
  assert.match(source, /from\("admin_sessions"\)/);
  assert.match(source, /error: "UNAUTHORIZED", status: 401/);
  assert.match(source, /error: "INVALID_SESSION", status: 401/);
  assert.match(source, /error: "SESSION_EXPIRED", status: 401/);
  assert.match(source, /error: "DATABASE_ERROR", status: 500/);
  assert.match(source, /from\("admin_sessions"\)\.delete\(\)\.eq\("token_hash", tokenHash\)/);
  assert.doesNotMatch(source, /map_sessions|raw_token/i);
});

test("OPTIONS, origin, and authentication precede configuration and business logic", () => {
  const auth = source.indexOf("await verifyAdminSession(req)");
  assert.ok(auth > source.indexOf('req.method ===\n      "OPTIONS"'));
  assert.ok(auth > source.indexOf("!ALLOWED_ORIGINS.has(origin)"));
  assert.ok(auth < source.indexOf("!supabaseUrl"));
  assert.ok(auth < source.indexOf('req.method ===\n      "GET"'));
  assert.ok(auth < source.indexOf('req.method !==\n      "POST"'));
});

test("production CORS and service-role contracts remain", () => {
  assert.match(source, /"https:\/\/s967\.org"/);
  assert.match(source, /"https:\/\/www\.s967\.org"/);
  assert.match(source, /"Access-Control-Allow-Headers": "authorization, content-type"/);
  assert.match(source, /"Access-Control-Allow-Methods": "GET, POST, OPTIONS"/);
  assert.match(source, /Origin not allowed\.[\s\S]*403/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source, /Server configuration error\.[\s\S]*500/);
});

test("loadAdminData retains all five overview queries and response fields", () => {
  assert.match(source, /async function loadAdminData\(\)/);
  assert.match(source, /Promise\.all\(\[/);
  for (const table of ["group_buy_events", "group_buy_alliances", "group_buy_email_recipients",
    "group_buy_export_logs", "group_buy_export_recipient_logs"])
    assert.ok(source.includes(`"${table}"`), table);
  for (const field of ["events:", "alliances:", "email_recipients:", "export_logs:", "export_recipient_logs:"])
    assert.ok(source.includes(field), field);
});

test("event detail, event_id validation, and not-found contracts remain", () => {
  assert.match(source, /async function loadEventDetail\(/);
  for (const table of ["group_buy_events", "group_buy_items", "group_buy_applications",
    "group_buy_export_logs", "group_buy_export_recipient_logs"])
    assert.ok(source.includes(`"${table}"`), table);
  assert.match(source, /searchParams\.get\([\s\S]*"event_id"/);
  assert.match(source, /Invalid event\.[\s\S]*400/);
  assert.match(source, /Event not found\.[\s\S]*404/);
});

test("event overlap and CRUD contracts remain", () => {
  assert.match(source, /async function hasEventOverlap\(/);
  assert.match(source, /\.lt\([\s\S]*"start_at"[\s\S]*endAt/);
  assert.match(source, /\.gt\([\s\S]*"end_at"[\s\S]*startAt/);
  assert.match(source, /excludeId !==[\s\S]*null[\s\S]*\.neq\(/);
  for (const action of ["create_event", "update_event", "delete_event"])
    assert.ok(source.includes(`action ===\n        "${action}"`), action);
  assert.match(source, /EVENT_PERIOD_OVERLAP[\s\S]*conflicts:[\s\S]*overlaps[\s\S]*409/);
  assert.match(source, /delete_group_buy_event_cascade[\s\S]*p_event_id/);
});

test("alliance and item CRUD contracts remain including ITEM_IN_USE", () => {
  for (const action of ["create_alliance", "update_alliance", "delete_alliance",
    "create_item", "update_item", "delete_item"])
    assert.ok(source.includes(`"${action}"`), action);
  assert.match(source, /group_buy_application_items[\s\S]*count:[\s\S]*"exact"[\s\S]*head:[\s\S]*true/);
  assert.match(source, /ITEM_IN_USE[\s\S]*409/);
});

test("email recipient CRUD and application deletion remain", () => {
  for (const action of ["create_email_recipient", "update_email_recipient",
    "delete_email_recipient", "delete_application"])
    assert.ok(source.includes(`"${action}"`), action);
  assert.match(source, /Nickname and email are required\.[\s\S]*400/);
  assert.match(source, /from\([\s\S]*"group_buy_applications"[\s\S]*\.delete\(\)/);
});

test("utility, methods, unknown action, and error contracts remain", () => {
  for (const fn of ["positiveInteger", "nonNegativeInteger", "cleanText", "isValidDate"])
    assert.ok(source.includes(`function ${fn}(`), fn);
  assert.match(source, /Method not allowed\.[\s\S]*405/);
  assert.match(source, /Unknown action\.[\s\S]*400/);
  assert.match(source, /error instanceof[\s\S]*Error[\s\S]*error\.message/);
});
