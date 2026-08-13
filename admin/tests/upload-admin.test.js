import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../../supabase/functions/upload-admin/index.ts", import.meta.url),
  "utf8",
);
test("upload-admin is standalone and calls its embedded admin-session verifier", () => {
  assert.doesNotMatch(source, /\.\.\/_shared\/admin-auth\.ts/);
  assert.equal((source.match(/^import /gm) || []).length, 1);
  assert.match(source, /async function verifyAdminSession\(req: Request\)/);
  assert.match(source, /await verifyAdminSession\(req\)/);
});

test("missing and malformed Authorization are rejected with 401", () => {
  assert.match(source, /match\(\/\^Bearer \(\[A-Za-z0-9_-\]\+\)\$\//);
  assert.match(source, /if \(!token\) return \{ ok: false, error: "UNAUTHORIZED", status: 401 \}/);
});

test("invalid and expired sessions are rejected with 401 and expiry is cleaned", () => {
  assert.match(source, /error: "INVALID_SESSION", status: 401/);
  assert.match(source, /error: "SESSION_EXPIRED", status: 401/);
  assert.match(source, /from\("admin_sessions"\)\.delete\(\)/);
});

test("verification errors fail closed using the helper status contract", () => {
  assert.match(source, /error: "DATABASE_ERROR", status: 500/);
  assert.match(source, /if \(!admin\.ok\)[\s\S]*admin\.error[\s\S]*admin\.status/);
});

test("only a valid admin session reaches existing GET and POST logic", () => {
  const authIndex = source.indexOf("await verifyAdminSession");
  assert.ok(authIndex > source.indexOf('req.method === "OPTIONS"'));
  assert.ok(authIndex < source.indexOf('req.method === "GET"'));
  assert.ok(authIndex < source.indexOf('req.method !== "POST"'));
  assert.match(source, /from\("admin_sessions"\)/);
  assert.doesNotMatch(source, /map_sessions/);
});

test("embedded verification SHA-256 hashes the token and never stores it", () => {
  assert.match(source, /crypto\.subtle\.digest\("SHA-256", encoder\.encode\(value\)\)/);
  assert.match(source, /\.eq\("token_hash", tokenHash\)/);
  assert.doesNotMatch(source, /raw_token/i);
  assert.doesNotMatch(source, /\.insert\(/);
});

test("x-admin-secret and ADMIN_SECRET can no longer authenticate", () => {
  assert.doesNotMatch(source, /x-admin-secret/i);
  assert.doesNotMatch(source, /ADMIN_SECRET/);
  assert.doesNotMatch(source, /checkAdmin/);
});

test("OPTIONS and both production origins remain supported", () => {
  assert.match(source, /req\.method === "OPTIONS"/);
  assert.match(source, /"https:\/\/s967\.org"/);
  assert.match(source, /"https:\/\/www\.s967\.org"/);
  assert.match(source, /"Access-Control-Allow-Methods": "GET, POST, OPTIONS"/);
});

test("CORS allows Authorization and removes the legacy secret header", () => {
  assert.match(source, /"Access-Control-Allow-Headers": "authorization, content-type"/);
  assert.doesNotMatch(source, /content-type, x-admin-secret/);
});

test("GET upload queries retain their production contracts", () => {
  for (const contract of [
    'from("upload_events")',
    'select("id, reference_code, ip_hash, file_count, storage_paths, created_at")',
    '.order("created_at", { ascending: false }).limit(100)',
    'from("upload_control").select("paused_until").eq("id", 1).single()',
    'from("blocked_upload_ips")',
    "uploads: uploadsResult.data ?? []",
    "control: controlResult.data",
    "blocked: blockedResult.data ?? []",
  ]) assert.ok(source.includes(contract), contract);
});

test("all production POST actions and storage ownership protections remain", () => {
  for (const contract of [
    'action === "delete_image"',
    'currentPaths.includes(storagePath)',
    'from("inquiry-uploads").remove([storagePath])',
    "remainingPaths.length === 0",
    "storage_paths: remainingPaths, file_count: remainingPaths.length",
    'action === "block_ip_7d"',
    "7 * 24 * 60 * 60 * 1000",
    'action === "block_ip_forever"',
    'action === "unblock_ip"',
    'action === "pause_uploads"',
    "hours > 168",
    'action === "resume_uploads"',
  ]) assert.ok(source.includes(contract), contract);
});

test("the production service-role client convention remains unchanged", () => {
  assert.match(source, /SUPABASE_SECRET_KEYS\["default"\]/);
  assert.match(source, /persistSession: false, autoRefreshToken: false/);
});
