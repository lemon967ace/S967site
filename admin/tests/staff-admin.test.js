import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../../supabase/functions/staff-admin/index.ts", import.meta.url),
  "utf8",
);

test("staff-admin is a standalone Dashboard function", () => {
  assert.doesNotMatch(source, /\.\.\/_shared\/admin-auth\.ts/);
  assert.equal((source.match(/^import /gm) || []).length, 1);
  assert.match(source, /async function verifyAdminSession\(req: Request\)/);
});

test("legacy owner secret authentication is completely removed", () => {
  assert.doesNotMatch(source, /ADMIN_SECRET|isOwner|x-admin-secret/i);
});

test("strict Bearer parsing and missing Authorization return 401", () => {
  assert.match(source, /match\(\/\^Bearer \(\[A-Za-z0-9_-\]\+\)\$\//);
  assert.match(source, /error: "UNAUTHORIZED", status: 401/);
});

test("admin session verification hashes tokens and handles invalid, expired, and DB errors", () => {
  assert.match(source, /crypto\.subtle\.digest\("SHA-256", encoder\.encode\(value\)\)/);
  assert.match(source, /from\("admin_sessions"\)/);
  assert.match(source, /\.select\("expires_at"\)\.eq\("token_hash", tokenHash\)\.maybeSingle\(\)/);
  assert.match(source, /error: "INVALID_SESSION", status: 401/);
  assert.match(source, /error: "SESSION_EXPIRED", status: 401/);
  assert.match(source, /error: "DATABASE_ERROR", status: 500/);
  assert.match(source, /from\("admin_sessions"\)\.delete\(\)\.eq\("token_hash", tokenHash\)/);
  assert.doesNotMatch(source, /map_sessions|raw_token/i);
});

test("verification runs after OPTIONS and origin but before GET and POST", () => {
  const auth = source.indexOf("await verifyAdminSession(req)");
  assert.ok(auth > source.indexOf('req.method === "OPTIONS"'));
  assert.ok(auth > source.indexOf("!ALLOWED_ORIGINS.has(origin)"));
  assert.ok(auth < source.indexOf('req.method === "GET"'));
  assert.ok(auth < source.indexOf('req.method !== "POST"'));
  assert.match(source, /if \(!admin\.ok\)[\s\S]*admin\.error[\s\S]*admin\.status/);
});

test("CORS preserves OPTIONS, methods, origins, and allows Authorization", () => {
  assert.match(source, /"https:\/\/s967\.org"/);
  assert.match(source, /"https:\/\/www\.s967\.org"/);
  assert.match(source, /"Access-Control-Allow-Headers": "authorization, content-type"/);
  assert.match(source, /"Access-Control-Allow-Methods": "GET, POST, OPTIONS"/);
  assert.match(source, /req\.method === "OPTIONS"/);
});

test("production service-role client structure remains", () => {
  assert.match(source, /SUPABASE_SECRET_KEYS\["default"\]/);
  assert.match(source, /persistSession: false, autoRefreshToken: false/);
});

test("Staff ID, normalization, and password policies remain", () => {
  assert.match(source, /const STAFF_AUTH_DOMAIN = "s967\.org"/);
  assert.match(source, /value\.length >= 1 && value\.length <= 50/);
  assert.match(source, /\^\[A-Za-z0-9\._-\]\+\$/);
  assert.match(source, /staffId\.trim\(\)\.toLowerCase\(\) \+ "@" \+ STAFF_AUTH_DOMAIN/);
  assert.match(source, /password\.length >= 6 && password\.length <= 128/);
});

test("GET Staff list and staff_id alias contracts remain", () => {
  for (const contract of [
    'from("staff_accounts")',
    'select("user_id, display_name, role, is_active, created_at, updated_at")',
    '.eq("role", "staff")',
    '.order("created_at", { ascending: true })',
    "staff_id: row.display_name",
    "success: true, accounts",
  ]) assert.ok(source.includes(contract), contract);
  assert.doesNotMatch(source, /select\([^)]*email/);
});

test("create_staff retains duplicate checks, Auth metadata, DB insert, and rollback", () => {
  for (const contract of [
    'action === "create_staff"',
    '.ilike("display_name", normalizedStaffId)',
    '.eq("role", "staff").limit(1).maybeSingle()',
    'error: "Staff ID already exists." }, 409',
    "supabase.auth.admin.createUser",
    "email_confirm: true",
    'app_metadata: { role: "staff", staff_id: staffId }',
    'display_name: staffId',
    'role: "staff"',
    "await supabase.auth.admin.deleteUser(userId)",
    "success: true, userId, staffId",
  ]) assert.ok(source.includes(contract), contract);
});

test("role=staff lookup protects owner accounts from every mutation", () => {
  const guard = source.indexOf('.select("user_id, display_name, role, is_active")');
  assert.ok(guard > 0);
  assert.ok(source.indexOf('.eq("role", "staff")', guard) > guard);
  assert.ok(guard < source.indexOf('action === "disable_staff"'));
  assert.ok(guard < source.indexOf('action === "enable_staff"'));
  assert.ok(guard < source.indexOf('action === "reset_password"'));
  assert.ok(guard < source.indexOf('action === "delete_staff"'));
  assert.match(source, /error: "Staff account not found\." \}, 404/);
});

test("disable and enable Staff contracts remain", () => {
  assert.match(source, /action === "disable_staff"[\s\S]*ban_duration: "876000h"[\s\S]*is_active: false/);
  assert.match(source, /action === "enable_staff"[\s\S]*ban_duration: "none"[\s\S]*is_active: true/);
});

test("password reset updates Auth and revokes every Staff session", () => {
  assert.match(source, /action === "reset_password"[\s\S]*password: newPassword/);
  assert.match(source, /rpc\("revoke_all_sessions_for_user", \{[\s\S]*target_user_id: userId/);
});

test("delete_staff retains Auth deletion and unknown action contract", () => {
  assert.match(source, /action === "delete_staff"[\s\S]*supabase\.auth\.admin\.deleteUser\(userId\)/);
  assert.match(source, /error: "Unknown action\." \}, 400/);
});
