import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../../supabase/functions/group-buy-export-email/index.ts", import.meta.url), "utf8",
);
const deployment = await readFile(
  new URL("../../GROUP_BUY_AUTOMATION_DEPLOYMENT.md", import.meta.url), "utf8",
);

test("export function is standalone and legacy admin secret is removed", () => {
  assert.doesNotMatch(source, /\.\.\/_shared\/admin-auth\.ts/);
  assert.equal((source.match(/^import /gm) || []).length, 2);
  assert.doesNotMatch(source, /ADMIN_SECRET|adminSecret|requireAdmin|x-admin-secret/i);
});

test("manual uses strict admin session verification only", () => {
  assert.match(source, /match\(\/\^Bearer \(\[A-Za-z0-9_-\]\+\)\$\//);
  assert.match(source, /crypto\.subtle\.digest\("SHA-256", encoder\.encode\(value\)\)/);
  assert.match(source, /from\("admin_sessions"\)/);
  assert.match(source, /error: "UNAUTHORIZED", status: 401/);
  assert.match(source, /error: "INVALID_SESSION", status: 401/);
  assert.match(source, /error: "SESSION_EXPIRED", status: 401/);
  assert.match(source, /error: "DATABASE_ERROR", status: 500/);
  assert.match(source, /from\("admin_sessions"\)\.delete\(\)\.eq\("token_hash", tokenHash\)/);
  assert.doesNotMatch(source, /map_sessions|raw_token/i);
  assert.match(source, /if \(type === "manual"\)[\s\S]*await verifyAdminSession\(req\)/);
});

test("automatic requires its independent automation secret and fails closed", () => {
  assert.match(source, /Deno\.env\.get\("GROUP_BUY_AUTOMATION_SECRET"\)/);
  assert.match(source, /req\.headers\.get\("x-automation-secret"\)/);
  assert.match(source, /if \(!automationSecret\)[\s\S]*SERVER_CONFIGURATION_ERROR[\s\S]*500/);
  assert.match(source, /receivedAutomationSecret !== automationSecret[\s\S]*UNAUTHORIZED[\s\S]*401/);
});

test("type is validated before either export path and auth precedes side effects", () => {
  const type = source.indexOf("const type =");
  const invalid = source.indexOf('type !== "manual" && type !== "automatic"', type);
  const manualAuth = source.indexOf("await verifyAdminSession(req)", invalid);
  const automationAuth = source.indexOf('req.headers.get("x-automation-secret")', invalid);
  const manualRun = source.indexOf('runExport(\n            eventId,\n            "manual"');
  const dueQuery = source.indexOf('const {\n          data:\n            dueEvents');
  assert.ok(type > 0 && invalid > type && manualAuth > invalid && automationAuth > invalid);
  assert.ok(manualAuth < manualRun);
  assert.ok(automationAuth < dueQuery);
  assert.match(source, /Invalid export type\.[\s\S]*400/);
});

test("manual and automatic credentials cannot substitute for each other", () => {
  const branch = source.match(/if \(type === "manual"\) \{[\s\S]*?\n      \} else \{[\s\S]*?\n      \}/)?.[0] ?? "";
  assert.match(branch, /verifyAdminSession/);
  assert.match(branch, /x-automation-secret/);
  assert.ok(branch.indexOf("verifyAdminSession") < branch.indexOf("else"));
  assert.ok(branch.indexOf("x-automation-secret") > branch.indexOf("else"));
});

test("automatic due-event selection and limit remain", () => {
  assert.match(source, /export_email_sent_at/);
  assert.match(source, /\.is\([\s\S]*"export_email_sent_at"[\s\S]*null/);
  assert.match(source, /\.lte\([\s\S]*"end_at"[\s\S]*dueBefore/);
  assert.match(source, /\.limit\([\s\S]*10/);
  assert.match(source, /Date\.now\(\) -[\s\S]*10 \*[\s\S]*60 \*[\s\S]*1000/);
});

test("manual full resend and automatic recipient retry policies remain", () => {
  assert.match(source, /let recipientsToSend =[\s\S]*recipients/);
  assert.match(source, /type ===[\s\S]*"automatic"[\s\S]*loadSuccessfulRecipientIds/);
  assert.match(source, /recipients\.filter\([\s\S]*!successfulIds\.has/);
  assert.match(source, /type ===[\s\S]*"manual"[\s\S]*runExport\([\s\S]*"manual"/);
});

test("completion marker, XLSX, Resend, and logging contracts remain", () => {
  assert.match(source, /export_email_sent_at:[\s\S]*new\s+Date\s*\(\s*\)[\s\S]*\.toISOString\s*\(\s*\)/);
  assert.match(source, /import \* as XLSX from "npm:xlsx@0\.18\.5"/);
  assert.match(source, /https:\/\/api\.resend\.com\/emails/);
  assert.match(source, /attachments:/);
  assert.match(source, /createExportLog|createRecipientLog/);
  assert.match(source, /partial_failure/);
});

test("CORS separates production browsers while allowing server requests", () => {
  assert.match(source, /"https:\/\/s967\.org"/);
  assert.match(source, /"https:\/\/www\.s967\.org"/);
  assert.match(source, /authorization, content-type, x-automation-secret/);
  assert.match(source, /if \(origin && !ALLOWED_ORIGINS\.has\(origin\)\)/);
  assert.match(source, /"Access-Control-Allow-Methods": "POST, OPTIONS"/);
});

test("deployment guide defines scheduler without embedding a secret", () => {
  assert.match(deployment, /every 10 or 15 minutes/);
  assert.match(deployment, /\{"type":"automatic"\}/);
  assert.match(deployment, /x-automation-secret/);
  assert.match(deployment, /GROUP_BUY_AUTOMATION_SECRET/);
  assert.match(deployment, /retry only remaining recipients/);
  assert.doesNotMatch(deployment, /GROUP_BUY_AUTOMATION_SECRET\s*=\s*[^<\s]/);
});
