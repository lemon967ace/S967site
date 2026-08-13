import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../../supabase/functions/wk-export-email/index.ts", import.meta.url), "utf8",
);

test("wk-export-email is standalone and removes legacy admin secret auth", () => {
  assert.doesNotMatch(source, /\.\.\/_shared\/admin-auth\.ts/);
  assert.equal((source.match(/^import /gm) || []).length, 2);
  assert.doesNotMatch(source, /ADMIN_SECRET|adminSecret|providedSecret|x-admin-secret/i);
});

test("manual authentication uses strict embedded admin-session verification", () => {
  assert.match(source, /match\(\/\^Bearer \(\[A-Za-z0-9_-\]\+\)\$\//);
  assert.match(source, /error: "UNAUTHORIZED", status: 401/);
  assert.match(source, /error: "INVALID_SESSION", status: 401/);
  assert.match(source, /error: "SESSION_EXPIRED", status: 401/);
  assert.match(source, /error: "DATABASE_ERROR", status: 500/);
  assert.match(source, /crypto\.subtle\.digest\("SHA-256", encoder\.encode\(value\)\)/);
  assert.match(source, /from\("admin_sessions"\)/);
  assert.match(source, /from\("admin_sessions"\)\.delete\(\)\.eq\("token_hash", tokenHash\)/);
  assert.doesNotMatch(source, /map_sessions|raw_token/i);
});

test("missing and invalid type remain manual and authenticate before side effects", () => {
  assert.match(source, /const type =[\s\S]*body\?\.type ===[\s\S]*"automatic"[\s\S]*\? "automatic"[\s\S]*: "manual"/);
  const manual = source.indexOf('type === "manual"');
  const verify = source.indexOf("await verifyAdminSession(req)", manual);
  assert.ok(verify > manual);
  for (const effect of ['"wk_settings"', '"wk_email_recipients"',
    '"wk_applications"', 'XLSX.write(', 'await fetch('])
    assert.ok(verify < source.indexOf(effect), effect);
});

test("automatic does not require an admin session", () => {
  const type = source.indexOf("const type =");
  const manual = source.indexOf('type === "manual"', type);
  const automatic = source.indexOf('type === "automatic"', manual + 1);
  assert.ok(manual > type && automatic > manual);
  assert.ok(source.indexOf("await verifyAdminSession(req)", manual) < automatic);
});

test("automatic skip and recipient deduplication policies remain", () => {
  for (const reason of ["auto_send_disabled", "application_mode_not_auto", "too_early", "already_sent"])
    assert.ok(source.includes(`"${reason}"`), reason);
  for (const contract of ['from(\n        "wk_email_export_recipients"', '"export_type",\n        "automatic"',
    '"period_start",\n        periodStart', '"success",\n        true', "successfulIds", "recipients.filter"])
    assert.ok(source.includes(contract), contract);
});

test("period and automatic timing contracts remain", () => {
  assert.match(source, /"2026-08-15T09:00:00\+09:00"/);
  assert.match(source, /const CYCLE_DAYS =[\s\S]*14/);
  assert.match(source, /const OPEN_DAYS =[\s\S]*5/);
  assert.match(source, /function getCurrentPeriod\(\)/);
  assert.match(source, /period\.end \+[\s\S]*10 \* 60 \* 1000/);
});

test("recipient and current-cycle application queries remain", () => {
  assert.match(source, /from\([\s\S]*"wk_email_recipients"[\s\S]*\.eq\([\s\S]*"active"[\s\S]*true[\s\S]*\.order\([\s\S]*"display_order"/);
  assert.match(source, /from\([\s\S]*"wk_applications"[\s\S]*\.eq\([\s\S]*"cycle_number"[\s\S]*cycleNumber[\s\S]*"created_at"[\s\S]*ascending:[\s\S]*true/);
  assert.match(source, /No active email recipients\.[\s\S]*400/);
});

test("XLSX workbook, filename, and worksheet contracts remain", () => {
  assert.match(source, /import \* as XLSX from "npm:xlsx@0\.18\.5"/);
  for (const contract of ["json_to_sheet", "aoa_to_sheet", '"!cols"', "book_new",
    '"WK Applications"', "XLSX.write", 'bookType:\n              "xlsx"', '"S967_WK_Cycle_"', '".xlsx"'])
    assert.ok(source.includes(contract), contract);
});

test("Resend attachment and per-recipient logging remain", () => {
  assert.match(source, /https:\/\/api\.resend\.com\/emails/);
  assert.match(source, /attachments:[\s\S]*filename,[\s\S]*content:[\s\S]*excelBase64/);
  assert.match(source, /async function recordExport\(/);
  assert.match(source, /from\([\s\S]*"wk_email_exports"/);
  assert.match(source, /async function recordRecipientExport\(/);
  assert.match(source, /from\([\s\S]*"wk_email_export_recipients"/);
});

test("partial failure and success response contracts remain", () => {
  assert.match(source, /if \(!success\)[\s\S]*ok: false[\s\S]*sent:[\s\S]*failed:[\s\S]*errors:[\s\S]*500/);
  for (const field of ["ok: true", "type,", "filename,", "application_count:", "recipient_count:", "resend_email_ids:"])
    assert.ok(source.includes(field), field);
});

test("CORS supports production browsers and originless server calls", () => {
  assert.match(source, /"https:\/\/s967\.org"/);
  assert.match(source, /"https:\/\/www\.s967\.org"/);
  assert.match(source, /authorization, x-client-info, apikey, content-type/);
  assert.doesNotMatch(source, /Access-Control-Allow-Origin": "\*"/);
  assert.match(source, /if \(origin && !ALLOWED_ORIGINS\.has\(origin\)\)/);
  assert.match(source, /"Access-Control-Allow-Methods": "POST, OPTIONS"/);
  assert.match(source, /req\.method === "OPTIONS"/);
});

test("Supabase and Resend server secret contracts remain", () => {
  for (const secret of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "RESEND_FROM_EMAIL"])
    assert.ok(source.includes(`"${secret}"`), secret);
});
