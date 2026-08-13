import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as engine from "../editor-engine.js";
import { AUTOSAVE_DEBOUNCE_MS, createAutosaveController, createRecoverySnapshot, recoveryKey, validateRecoverySnapshot } from "../editor-autosave.js";

const documentData = () => { engine.createNewDocument({ title: "Recovery" }); return engine.exportDocument(); };
const base = overrides => ({ accountId: "account-a", sourceKind: "saved", mapId: "map-a", documentData: documentData(), mutationRevision: 3, tabId: "tab-a", autosavedAt: "2026-08-13T10:00:00.000Z", ...overrides });

test("snapshot stores canonical document and minimal recovery metadata", () => {
  const snapshot = createRecoverySnapshot(base());
  assert.equal(snapshot.key, "account-a:saved:map-a"); assert.equal(snapshot.documentData.format, "isometric-map-editor");
  for (const key of ["sessionToken", "serviceRoleKey", "adminToken", "hover", "selection", "preview", "filter", "renderer", "occupancy", "history", "sharedSecret"]) assert.equal(key in snapshot, false);
});

test("keys isolate accounts, saved maps, and unsaved runtime IDs", () => {
  assert.notEqual(recoveryKey("a", "saved", "map-1"), recoveryKey("b", "saved", "map-1"));
  assert.notEqual(recoveryKey("a", "saved", "map-1"), recoveryKey("a", "saved", "map-2"));
  assert.notEqual(recoveryKey("a", "new", null, "draft-1"), recoveryKey("a", "imported", null, "draft-2"));
});

test("canonical validation rejects corrupted and overlapping recovery", () => {
  assert.throws(() => validateRecoverySnapshot({}));
  const invalid = base(); invalid.documentData.fixed_ranges = [{ id: "f", kind: "allowed", color: "#fff", cells: [[2, 2]] }]; invalid.documentData.ranges = [{ id: "u", kind: "blocked", color: "#000", cells: [[2, 2]] }];
  assert.throws(() => createRecoverySnapshot(invalid), /Overlapping range cell/);
});

function memoryStorage() { const values = new Map(); return { values, async get(k) { return values.get(k) ?? null; }, async put(v) { values.set(v.key, v); return v; }, async delete(k) { values.delete(k); }, async cleanup() {} }; }

test("mutations debounce to one latest-only write with revision and tab metadata", async () => {
  const storage = memoryStorage(), timers = [];
  const controller = createAutosaveController({ storage, getContext: () => base({ mutationRevision: undefined }), setTimeoutImpl: fn => { timers.push(fn); return fn; }, clearTimeoutImpl: fn => { const i = timers.indexOf(fn); if (i >= 0) timers.splice(i, 1); } });
  controller.schedule(4); controller.schedule(5); assert.equal(timers.length, 1); await timers[0]();
  const saved = [...storage.values.values()][0]; assert.equal(saved.mutationRevision, 5); assert.equal(saved.tabId, "tab-a"); assert.equal(AUTOSAVE_DEBOUNCE_MS, 3000);
});

test("shared/read-only does not write and storage failure is non-fatal", async () => {
  let errors = 0, puts = 0;
  const storage = { async get() { return null; }, async put() { puts++; throw new Error("quota"); }, async cleanup() {} };
  const shared = createAutosaveController({ storage, getContext: () => ({ ...base(), readOnly: true }), onError: () => errors++ }); shared.schedule(1); await shared.flush(); assert.equal(puts, 0);
  const editable = createAutosaveController({ storage, getContext: () => ({ ...base(), readOnly: false }), onError: () => errors++ }); editable.schedule(2); assert.equal(await editable.flush(), null); assert.equal(errors, 1);
});

test("an older multi-tab snapshot cannot overwrite a newer one", async () => {
  const storage = memoryStorage(), newer = createRecoverySnapshot(base({ mutationRevision: 9, autosavedAt: "2026-08-13T11:00:00.000Z", tabId: "new" })); await storage.put(newer);
  const controller = createAutosaveController({ storage, getContext: () => base({ mutationRevision: undefined, tabId: "old", autosavedAt: "2026-08-13T10:00:00.000Z" }) }); controller.schedule(4); await controller.flush();
  assert.equal((await storage.get(newer.key)).tabId, "new");
});

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
test("editor integrates mutation autosave, recovery confirmation, Save cleanup, import, and shared exclusion", () => {
  assert.match(html, /scheduleAutosave\(\)/); assert.match(html, /RANGE_OVERLAP_TEXT/); assert.match(html, /window\.confirm\(`\$\{labels\.found\}/);
  assert.match(html, /outcome\.clean[\s\S]*recoveryStorage\.delete/); assert.match(html, /recoverySourceKind = "imported"/); assert.match(html, /prepareSharedMap\(\)[\s\S]*autosaveReady = false/);
  assert.match(html, /PNSMapEngine\.loadDocument\(snapshot\.documentData\)/); assert.match(html, /history\?\.clear\(\{ saved: false \}\)/); assert.match(html, /mapRenderer\?\.refresh\(\)/);
});

test("runtime-only interactions do not directly schedule autosave", () => {
  for (const marker of ["minimapToggle.addEventListener", "selectToolButton.addEventListener", "openMapFileButton.addEventListener"]) {
    const line = html.split("\n").find(value => value.includes(marker)); assert.doesNotMatch(line, /scheduleAutosave/);
  }
});

test("autosave does not change isomap schema, central view, or Range invariant", () => {
  const snapshot = createRecoverySnapshot(base({ sourceKind: "new", mapId: null, recoveryDocumentId: "draft" }));
  assert.deepEqual(snapshot.documentData.view, { center_x: 255, center_y: 511, zoom: 1 });
  assert.equal("recoveryDocumentId" in snapshot.documentData, false); assert.equal("currentMapId" in snapshot.documentData, false);
});
