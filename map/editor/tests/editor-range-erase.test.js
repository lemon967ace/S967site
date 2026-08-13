import test from "node:test";
import assert from "node:assert/strict";
import * as engine from "../editor-engine.js";
import { createHistory } from "../editor-history.js";
import { createBuildingController } from "../editor-building-controller.js";
import { createRangeController } from "../editor-range.js";
import { createRangeEraseController, subtractRangeCells } from "../editor-range-erase.js";

function addRange({ kind = "allowed", color = "#123456", locked = false, cells }) { return engine.commitRange({ kind, color, locked, cells }).range; }
function setup({ readOnly = false, saved = true } = {}) {
  engine.createNewDocument(); let dirty = !saved, dirtyCalls = 0, buildingCancels = 0, bulkCancels = 0;
  const history = createHistory({ readOnly: () => engine.isReadOnly() }); history.clear({ saved });
  const buildingController = createBuildingController({ engine, history });
  const originalCancel = buildingController.cancelMode; buildingController.cancelMode = () => { buildingCancels++; originalCancel(); };
  const rangeController = createRangeController({ engine, history, buildingController });
  const erase = createRangeEraseController({ engine, history, buildingController, rangeController, bulkDeleteController: { cancel() { bulkCancels++; } }, onDirty: value => { dirty = value; dirtyCalls++; } });
  buildingController.addAreaPeer(erase); rangeController.addAreaPeer(erase);
  if (readOnly) engine.loadDocument(engine.exportDocument(), { readOnly: true });
  return { erase, history, rangeController, buildingController, dirty: () => dirty, dirtyCalls: () => dirtyCalls, buildingCancels: () => buildingCancels, bulkCancels: () => bulkCancels };
}

test("Python erase applies to every intersecting unlocked Range regardless of kind", () => {
  const ranges = [
    { id: "a", kind: "allowed", color: "#111111", locked: false, cells: [[0, 0], [1, 1]] },
    { id: "b", kind: "blocked", color: "#222222", locked: false, cells: [[2, 2], [3, 3]] },
  ];
  const result = subtractRangeCells(ranges, [[1, 1], [2, 2]]);
  assert.equal(result.removedCount, 2); assert.deepEqual(result.ranges.map(item => item.cells), [[[0, 0]], [[3, 3]]]);
});

test("locked Range is wholly preserved and counted once", () => {
  const locked = { id: "l", kind: "allowed", color: "#111111", locked: true, cells: [[0, 0], [1, 1]] };
  const result = subtractRangeCells([locked], [[0, 0]]);
  assert.equal(result.removedCount, 0); assert.equal(result.lockedCount, 1); assert.deepEqual(result.ranges[0], locked);
});

test("empty unlocked Range is removed while disconnected cells retain one ID", () => {
  const ranges = [
    { id: "empty", kind: "allowed", color: "#111111", locked: false, cells: [[0, 0]] },
    { id: "split", kind: "blocked", color: "#222222", locked: false, cells: [[2, 2], [3, 3], [4, 4]] },
  ];
  const result = subtractRangeCells(ranges, [[0, 0], [3, 3]]);
  assert.deepEqual(result.ranges.map(item => item.id), ["split"]); assert.deepEqual(result.ranges[0].cells, [[2, 2], [4, 4]]);
});

test("erase preview is transient, reverse drag equivalent, and uses Range rectangle geometry", () => {
  const s = setup(); addRange({ cells: [[19, 19], [20, 20], [21, 21]] }); const before = engine.exportDocument();
  s.erase.start(); s.erase.begin([19, 19]); s.erase.update([21, 21]); const forward = s.erase.getState().previewCells;
  s.erase.cancel(); s.erase.start(); s.erase.begin([21, 21]); s.erase.update([19, 19]);
  assert.deepEqual(s.erase.getState().previewCells, forward); assert.deepEqual(engine.exportDocument(), before); assert.equal(s.history.getState().undoCount, 0); assert.equal(s.dirtyCalls(), 0);
});

test("starting erase cancels bulk, building, and Range creation modes", () => {
  const s = setup(); s.erase.start(); assert.equal(s.bulkCancels(), 1); assert.equal(s.buildingCancels(), 1); assert.equal(s.rangeController.getState().mode, "select");
});

test("Range create and building placement programmatically cancel erase mode", () => {
  const s = setup(); s.erase.start(); s.rangeController.startCreate({ kind: "allowed", color: "#123456", locked: false }); assert.equal(s.erase.getState().mode, "select");
  s.rangeController.cancel(); s.erase.start(); s.buildingController.selectPalette("type-01", 1); assert.equal(s.erase.getState().mode, "select");
});

test("erase commit is one history command and preserves ID, kind, color, and lock", () => {
  const s = setup(), range = addRange({ kind: "blocked", color: "#abcdef", cells: [[19, 19], [20, 20], [21, 21]] });
  s.erase.start(); s.erase.begin([20, 20]); const result = s.erase.commit(); const after = engine.getDocument().ranges[0];
  assert.equal(result.removedCount, 1); assert.equal(s.history.getState().undoCount, 1); assert.deepEqual([after.id, after.kind, after.color, after.locked], [range.id, "blocked", "#abcdef", false]); assert.deepEqual(after.cells, [[19, 19], [21, 21]]);
});

test("one undo restores all affected Ranges and one redo reapplies deletion", () => {
  const s = setup(); const a = addRange({ cells: [[19, 19], [20, 20]] }); const b = addRange({ kind: "blocked", color: "#654321", cells: [[21, 21], [22, 22]] }); const before = engine.exportDocument().ranges;
  s.erase.start(); s.erase.begin([20, 20]); s.erase.update([22, 22]); s.erase.commit(); const after = engine.exportDocument().ranges;
  s.history.undo(); assert.deepEqual(engine.exportDocument().ranges, before); s.history.redo(); assert.deepEqual(engine.exportDocument().ranges, after); assert.deepEqual(before.map(item => item.id), [a.id, b.id]);
});

test("whole-Range erase clears stale selection and undo does not invent selection", () => {
  const s = setup(), range = addRange({ cells: [[20, 20]] }); s.rangeController.selectAtCell([20, 20]); assert.equal(s.rangeController.getState().selectedRangeId, range.id);
  s.erase.start(); s.erase.begin([20, 20]); s.erase.commit(); assert.equal(s.rangeController.getState().selectedRangeId, null);
  s.history.undo(); assert.equal(s.rangeController.getState().selectedRangeId, null); s.history.redo(); assert.equal(s.rangeController.getState().selectedRangeId, null);
});

test("erase dirty/save-point follows history state", () => {
  const s = setup(); addRange({ cells: [[20, 20]] }); s.erase.start(); s.erase.begin([20, 20]); s.erase.commit(); assert.equal(s.dirty(), true); assert.equal(s.history.isAtSavedState(), false);
  s.history.undo(); assert.equal(s.history.isAtSavedState(), true); s.history.redo(); assert.equal(s.history.isAtSavedState(), false);
});

test("empty erase makes no mutation, history, or dirty change", () => {
  const s = setup(); addRange({ cells: [[20, 20]] }); const before = engine.exportDocument(); s.erase.start(); s.erase.begin([22, 22]); const result = s.erase.commit();
  assert.equal(result.removedCount, 0); assert.deepEqual(engine.exportDocument(), before); assert.equal(s.history.getState().undoCount, 0); assert.equal(s.dirtyCalls(), 0);
});

test("read-only blocks erase start and commit paths", () => {
  const s = setup({ readOnly: true }); assert.throws(() => s.erase.start(), /read-only/); assert.throws(() => s.erase.commit(), /read-only/);
});

test("Escape-equivalent cancel clears preview without mutation", () => {
  const s = setup(); addRange({ cells: [[20, 20]] }); const before = engine.exportDocument(); s.erase.start(); s.erase.begin([20, 20]); s.erase.cancel();
  assert.deepEqual(s.erase.getState(), { mode: "select", firstCell: null, previewCells: [] }); assert.deepEqual(engine.exportDocument(), before);
});

test("partial erase export and load round trip retains the exact result", () => {
  const s = setup(); addRange({ cells: [[19, 19], [20, 20], [21, 21]] }); s.erase.start(); s.erase.begin([20, 20]); s.erase.commit(); const exported = engine.exportDocument();
  engine.loadDocument(exported); assert.deepEqual(engine.exportDocument(), exported);
});

test("building data and filtering fields are independent of Range erase", () => {
  const s = setup(); const beforeBuildings = engine.exportDocument().buildings; addRange({ cells: [[20, 20]] }); s.erase.start(); s.erase.begin([20, 20]); s.erase.commit(); assert.deepEqual(engine.exportDocument().buildings, beforeBuildings);
});
