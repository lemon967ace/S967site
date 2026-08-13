import test from "node:test";
import assert from "node:assert/strict";
import { createMapSaveManager, MapSaveError } from "../editor-save.js";

const UUID = "123e4567-e89b-42d3-a456-426614174000";
function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }
function setup({ mapId = null, revision = 1, readOnly = false, fetchImpl } = {}) {
  const runtime = { mapId, revision, readOnly, document: { version: 1, buildings: [] }, metadata: null, sessionExpired: false, states: [] };
  const requests = [];
  const fetcher = fetchImpl ?? (async (_url, options) => { requests.push(JSON.parse(options.body)); return response({ ok: true, created: !runtime.mapId, map: { id: runtime.mapId ?? UUID, name: "Map", documentData: runtime.document, createdAt: "c", updatedAt: "u" } }, runtime.mapId ? 200 : 201); });
  const manager = createMapSaveManager({ url: "https://example.test/map-save", fetchImpl: fetcher, getToken: () => "session-token", getMapId: () => runtime.mapId, setMapId: id => runtime.mapId = id, getName: () => "Map", exportDocument: () => structuredClone(runtime.document), getRevision: () => runtime.revision, isReadOnly: () => runtime.readOnly, onStateChange: state => runtime.states.push(state), onMetadata: value => runtime.metadata = value, onSessionExpired: () => runtime.sessionExpired = true });
  return { runtime, requests, manager };
}

test("new save sends null mapId, adopts UUID, then updates the same UUID", async () => {
  const s = setup(); const first = await s.manager.save();
  assert.equal(s.requests[0].mapId, null); assert.equal(first.requestMapId, null); assert.equal(s.runtime.mapId, UUID);
  s.runtime.revision++; await s.manager.save(); assert.equal(s.requests[1].mapId, UUID);
});

test("existing save uses its current map ID and official export data", async () => {
  const s = setup({ mapId: UUID }); s.runtime.document.buildings.push({ id: "a" }); await s.manager.save();
  assert.equal(s.requests[0].mapId, UUID); assert.deepEqual(s.requests[0].documentData, s.runtime.document);
  assert.equal("selection" in s.requests[0].documentData, false);
});

test("successful save is clean and records server metadata", async () => {
  const s = setup(); const result = await s.manager.save();
  assert.equal(result.clean, true); assert.deepEqual(s.runtime.metadata, { id: UUID, name: "Map", createdAt: "c", updatedAt: "u", created: true });
  assert.equal(s.manager.getState().saving, false);
});

test("mutation during save keeps dirty but still adopts a new UUID", async () => {
  let release; const pending = new Promise(resolve => release = resolve); const s = setup({ fetchImpl: async () => pending });
  const saving = s.manager.save(); s.runtime.revision++;
  release(response({ ok: true, created: true, map: { id: UUID, name: "Map", documentData: {}, createdAt: "c", updatedAt: "u" } }, 201));
  const result = await saving; assert.equal(result.clean, false); assert.equal(s.runtime.mapId, UUID);
});

test("a concurrent save is skipped and only one request is sent", async () => {
  let release, calls = 0; const s = setup({ fetchImpl: async () => { calls++; return new Promise(resolve => release = resolve); } });
  const first = s.manager.save(); assert.deepEqual(await s.manager.save(), { skipped: true, reason: "ALREADY_SAVING" }); assert.equal(calls, 1);
  release(response({ ok: true, map: { id: UUID, name: "Map" } }, 201)); await first; assert.equal(s.manager.getState().saving, false);
});

test("server and network failures preserve document and map ID", async () => {
  for (const fetchImpl of [async () => response({ error: "MAP_LIMIT_REACHED" }, 409), async () => { throw new Error("offline"); }]) {
    const s = setup({ mapId: UUID, fetchImpl }), before = structuredClone(s.runtime.document);
    await assert.rejects(s.manager.save(), MapSaveError); assert.equal(s.runtime.mapId, UUID); assert.deepEqual(s.runtime.document, before); assert.equal(s.manager.getState().saving, false);
  }
});

test("session errors trigger existing expiration policy", async () => {
  const s = setup({ fetchImpl: async () => response({ error: "SESSION_EXPIRED" }, 401) });
  await assert.rejects(s.manager.save(), error => error.code === "SESSION_EXPIRED"); assert.equal(s.runtime.sessionExpired, true);
});

test("read-only rejects save without making a request", async () => {
  let calls = 0; const s = setup({ readOnly: true, fetchImpl: async () => { calls++; } });
  await assert.rejects(s.manager.save(), error => error.code === "READ_ONLY"); assert.equal(calls, 0);
});
