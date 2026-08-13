import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import * as engine from "../editor-engine.js";
import { Building } from "../editor-model.js";
import { createHistory } from "../editor-history.js";
import { createBuildingController } from "../editor-building-controller.js";
import { areaBuildingTargets, createBulkDeleteController } from "../editor-bulk-delete.js";

function setup({ readOnly = false, saved = true } = {}) {
  engine.createNewDocument();
  const add = (id, x, y, { size = 1, locked = false } = {}) => engine.addBuilding(new Building({ id, name: id, typeId: "type-01", x, y, width: size, height: size, locked }));
  if (readOnly) engine.loadDocument(engine.exportDocument(), { readOnly: true });
  let dirty = !saved, dirtyCalls = 0, buildingCancels = 0, rangeCancels = 0;
  const history = createHistory({ readOnly: () => engine.isReadOnly() }); history.clear({ saved });
  const buildingController = createBuildingController({ engine, history, onDirty: value => { dirty = value; dirtyCalls++; } });
  const bulk = createBulkDeleteController({ engine, history, buildingController: { cancelMode() { buildingCancels++; }, normalizeSelection: buildingController.normalizeSelection }, rangeController: { cancel() { rangeCancels++; } }, onDirty: value => { dirty = value; dirtyCalls++; } });
  return { add, bulk, history, buildingController, dirty: () => dirty, dirtyCalls: () => dirtyCalls, buildingCancels: () => buildingCancels, rangeCancels: () => rangeCancels };
}

test("Python area selection uses any occupied-cell intersection and excludes locked buildings from deletion", () => {
  const s = setup(), large = s.add("large", 20, 20, { size: 2 }), locked = s.add("locked", 22, 22, { locked: true });
  const result = areaBuildingTargets(engine.getDocument().buildings, [[19, 19], [22, 22]]);
  assert.deepEqual(result.targets.map(item => item.id), [large.id, locked.id]);
  assert.deepEqual(result.deletable.map(item => item.id), [large.id]);
  assert.deepEqual(result.locked.map(item => item.id), [locked.id]);
});

test("area preview is transient and uses the Python isometric rectangle", () => {
  const s = setup(); s.add("a", 20, 20); const before = engine.exportDocument(); const undo = s.history.getState().undoCount;
  s.bulk.start(); s.bulk.begin([19, 19]); s.bulk.update([21, 21]);
  assert.deepEqual(engine.exportDocument(), before); assert.equal(s.history.getState().undoCount, undo); assert.equal(s.dirtyCalls(), 0);
  assert.deepEqual(s.bulk.getState().previewCells, [[19, 19], [20, 20], [21, 21]]);
  assert.deepEqual([...s.bulk.getState().targetIds], ["a"]);
});

test("starting bulk area mode cancels building and Range operations", () => {
  const s = setup(); s.bulk.start(); assert.equal(s.buildingCancels(), 1); assert.equal(s.rangeCancels(), 1);
});

test("bulk delete is one history command and one dirty notification", () => {
  const s = setup(); s.add("a", 20, 20); s.add("b", 22, 22);
  s.bulk.start(); s.bulk.begin([20, 20]); s.bulk.update([22, 22]); const result = s.bulk.commit();
  assert.deepEqual(result.deleted.map(item => item.id), ["a", "b"]); assert.equal(s.history.getState().undoCount, 1); assert.equal(s.dirtyCalls(), 1); assert.equal(s.dirty(), true);
});

test("one undo restores every ID and occupancy; one redo removes the same set", () => {
  const s = setup(); s.add("a", 20, 20); s.add("b", 22, 22, { size: 2 });
  s.bulk.start(); s.bulk.begin([19, 19]); s.bulk.update([22, 22]); s.bulk.commit();
  s.history.undo(); assert.deepEqual(engine.getDocument().buildings.map(item => item.id), ["a", "b"]); assert.equal(engine.getOccupancy().buildingIdAt(20, 20), "a"); assert.equal(engine.getOccupancy().buildingIdAt(21, 21), "b");
  s.history.redo(); assert.deepEqual(engine.getDocument().buildings, []); assert.equal(engine.getOccupancy().buildingIdAt(20, 20), null); assert.equal(engine.getOccupancy().buildingIdAt(21, 21), null);
});

test("mixed locked targets delete only unlocked and preserve locked occupancy", () => {
  const s = setup(); s.add("open", 20, 20); s.add("locked", 22, 22, { locked: true });
  s.bulk.start(); s.bulk.begin([20, 20]); s.bulk.update([22, 22]); const result = s.bulk.commit();
  assert.equal(result.lockedCount, 1); assert.deepEqual(engine.getDocument().buildings.map(item => item.id), ["locked"]); assert.equal(engine.getOccupancy().buildingIdAt(22, 22), "locked");
});

test("no deletable target creates no history or dirty state", () => {
  const s = setup(); s.add("locked", 20, 20, { locked: true }); s.bulk.start(); s.bulk.begin([20, 20]);
  const result = s.bulk.commit(); assert.deepEqual(result.deleted, []); assert.equal(result.lockedCount, 1); assert.equal(s.history.getState().undoCount, 0); assert.equal(s.dirtyCalls(), 0);
});

test("bulk deletion normalizes a stale single selection and Python undo does not restore it", () => {
  const s = setup(); s.add("a", 20, 20); s.buildingController.selectBuilding("a"); s.bulk.start(); s.bulk.begin([20, 20]); s.bulk.commit();
  assert.equal(s.buildingController.normalizeSelection(), null); s.history.undo(); assert.equal(s.buildingController.getState().selectedBuildingId, null); s.history.redo(); assert.equal(s.buildingController.getState().selectedBuildingId, null);
});

test("saved state becomes dirty, undo returns clean, redo becomes dirty", () => {
  const s = setup(); s.add("a", 20, 20); s.bulk.start(); s.bulk.begin([20, 20]); s.bulk.commit(); assert.equal(s.history.isAtSavedState(), false);
  s.history.undo(); assert.equal(s.history.isAtSavedState(), true); s.history.redo(); assert.equal(s.history.isAtSavedState(), false);
});

test("new mutation after bulk undo clears redo", () => {
  const s = setup(); s.add("a", 20, 20); s.bulk.start(); s.bulk.begin([20, 20]); s.bulk.commit(); s.history.undo();
  s.buildingController.selectPalette("type-01", 1); s.buildingController.commitAt(24, 24, { name: "new" }); assert.equal(s.history.canRedo(), false);
});

test("read-only blocks starting and committing bulk deletion", () => {
  const s = setup({ readOnly: true }); assert.throws(() => s.bulk.start(), /read-only/); assert.throws(() => s.bulk.commit(), /read-only/);
});

test("cancel clears transient area state", () => {
  const s = setup(); s.bulk.start(); s.bulk.begin([20, 20]); s.bulk.cancel(); assert.deepEqual(s.bulk.getState(), { mode: "select", firstCell: null, previewCells: [], targetIds: new Set() });
});

test("1000-building target lookup remains linear", () => {
  const buildings = Array.from({ length: 1000 }, (_, index) => new Building({ id: String(index), name: "B", typeId: "type-01", x: (index % 250) * 2, y: Math.floor(index / 250) * 2, width: 1, height: 1 }));
  const start = performance.now(); const result = areaBuildingTargets(buildings, [[200, 4]]);
  assert.equal(result.targets.length, 1); assert.ok(performance.now() - start < 1000);
});
