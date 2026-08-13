import test from "node:test";
import assert from "node:assert/strict";
import * as engine from "../editor-engine.js";
import { createBuildingController } from "../editor-building-controller.js";
import { createHistory, snapshotRange } from "../editor-history.js";
import { applyRangeOverlapRules, createRangeController, rectangleCells, visibleRangeCells } from "../editor-range.js";
import { parseDocument } from "../editor-document.js";

function setup({ readOnly = false, saved = true } = {}) {
  engine.createNewDocument(); if (readOnly) engine.loadDocument(engine.exportDocument(), { readOnly: true });
  let dirty = !saved; const history = createHistory({ readOnly: () => engine.isReadOnly() }); history.clear({ saved });
  const buildings = createBuildingController({ engine, history, onDirty: value => dirty = value });
  const ranges = createRangeController({ engine, history, buildingController: buildings, onDirty: value => dirty = value }); buildings.setRangeController(ranges);
  return { history, buildings, ranges, dirty: () => dirty };
}
function createRange(subject, { first = [10, 10], second = [12, 12], kind = "allowed", color = "#4E79A7", locked = false } = {}) { subject.ranges.startCreate({ kind, color, locked }); subject.ranges.click(first); subject.ranges.click(second); return subject.ranges.commit(); }

test("Python new documents start with no synthetic base ranges", () => { setup(); assert.deepEqual(engine.getDocument().ranges, []); });

test("isometric rectangle is direction independent", () => { assert.deepEqual(rectangleCells([10, 10], [16, 18]), rectangleCells([16, 18], [10, 10])); });

test("preview is transient and cancel changes neither document, history nor dirty", () => {
  const s = setup(); s.ranges.startCreate({ kind: "allowed", color: "#123456", locked: false }); s.ranges.click([10, 10]); s.ranges.hover([12, 12]);
  assert.equal(s.ranges.getState().previewCells.length, 3); assert.equal(engine.getDocument().ranges.length, 0); assert.equal(s.history.getState().undoCount, 0); assert.equal(s.dirty(), false);
  s.ranges.cancel(); assert.equal(s.ranges.getState().previewCells.length, 0); assert.equal(s.history.getState().undoCount, 0);
});

test("user range create, undo and redo preserve cells", () => {
  const s = setup(); const result = createRange(s); assert.equal(result.accepted.length, 3); assert.equal(s.dirty(), true);
  const id = engine.getDocument().ranges[0].id; s.ranges.undo(); assert.equal(engine.getDocument().ranges.length, 0); assert.equal(s.dirty(), false);
  s.ranges.redo(); assert.equal(engine.getDocument().ranges[0].id, id); assert.equal(engine.getDocument().ranges[0].cells.length, 3);
});

test("overlap rejects the whole range regardless of lock state", () => {
  const locked = { id: "l", kind: "allowed", color: "#111111", locked: true, cells: [[2, 2], [4, 4]] };
  assert.throws(() => applyRangeOverlapRules([locked], { kind: "blocked", color: "#222222", locked: false, cells: [[2, 2], [6, 6]] }), error => error.code === "RANGE_OVERLAP");
  const unlocked = { ...locked, id: "u", locked: false };
  assert.throws(() => applyRangeOverlapRules([unlocked], { kind: "blocked", color: "#222222", locked: false, cells: [[4, 4], [6, 6]] }), error => error.code === "RANGE_OVERLAP");
});

test("lock edit is one command and delete undo/redo restores selection", () => {
  const s = setup(); createRange(s); const id = engine.getDocument().ranges[0].id, count = s.history.getState().undoCount;
  s.ranges.editSelected({ locked: true }); assert.equal(s.history.getState().undoCount, count + 1); s.ranges.undo(); assert.equal(engine.getDocument().ranges[0].locked, false); s.ranges.redo(); assert.equal(engine.getDocument().ranges[0].locked, true);
  s.ranges.editSelected({ locked: false }); s.ranges.deleteSelected(); assert.equal(engine.getDocument().ranges.length, 0); s.ranges.undo(); assert.equal(engine.getDocument().ranges[0].id, id); assert.equal(s.ranges.getState().selectedRangeId, id); s.ranges.redo(); assert.equal(engine.getDocument().ranges.length, 0);
});

test("locked range deletion is blocked", () => { const s = setup(); createRange(s, { locked: true }); assert.throws(() => s.ranges.deleteSelected(), /Locked/); });

test("range snapshots deeply copy cells", () => { const source = { id: "r", kind: "allowed", color: "#123456", locked: false, cells: [[2, 2]] }, snapshot = snapshotRange(source); source.cells[0][0] = 8; assert.deepEqual(snapshot.cells, [[2, 2]]); });

test("new range mutation after undo clears redo", () => { const s = setup(); createRange(s); s.ranges.undo(); createRange(s, { first: [20, 20], second: [22, 22] }); assert.equal(s.history.canRedo(), false); });

test("export and load round trip ranges without adding defaults", () => { const s = setup(); createRange(s, { kind: "blocked", locked: true }); const data = engine.exportDocument(), loaded = parseDocument(data); assert.deepEqual(loaded.ranges.map(snapshotRange), engine.getDocument().ranges.map(snapshotRange)); assert.equal(loaded.ranges.length, 1); });

test("Stage 10 user blocked ranges reject placement without changing occupancy", () => {
  const s = setup(); createRange(s, { first: [20, 20], second: [20, 20], kind: "blocked" });
  s.buildings.selectPalette("type-01", 1); assert.equal(s.buildings.updatePreview(20, 20).valid, false); assert.equal(s.buildings.commitAt(20, 20, { name: "One" }), null); assert.equal(engine.getOccupancy().buildingIdAt(20, 20), null);
  s.buildings.selectPalette("type-01", 2); assert.equal(s.buildings.updatePreview(30, 30).valid, true);
});

test("range undo/redo immediately updates Stage 10 placement rules", () => { const s = setup(); createRange(s, { kind: "blocked" }); s.ranges.undo(); assert.equal(engine.getDocument().ranges.length, 0); assert.equal(engine.canPlaceBuilding({ x: 10, y: 10, width: 1, height: 1 }).canPlace, true); s.ranges.redo(); assert.equal(engine.getDocument().ranges.length, 1); assert.equal(engine.canPlaceBuilding({ x: 10, y: 10, width: 1, height: 1 }).canPlace, false); });

test("visible range culling visits only cells inside viewport bounds", () => { const range = { cells: [[0, 0], [20, 20], [100, 100]] }; assert.deepEqual(visibleRangeCells(range, { minX: 10, maxX: 30, minY: 10, maxY: 30 }), [[20, 20]]); });

test("range and building creation modes are mutually exclusive", () => { const s = setup(); s.buildings.selectPalette("type-01", 1); s.ranges.startCreate({ kind: "allowed", color: "#123456", locked: false }); assert.equal(s.buildings.getState().mode, "select"); s.buildings.selectPalette("type-01", 1); assert.equal(s.ranges.getState().mode, "select"); });

test("read-only blocks every range mutation", () => { const s = setup({ readOnly: true }); assert.throws(() => s.ranges.startCreate({ kind: "allowed", color: "#123456" }), /read-only/); assert.throws(() => engine.commitRange({ kind: "allowed", color: "#123456", locked: false, cells: [[2, 2]] }), /read-only/); });
