import test from "node:test";
import assert from "node:assert/strict";
import * as engine from "../editor-engine.js";
import { parseDocument } from "../editor-document.js";
import { buildRangeCellOwnerIndex, MapDocument } from "../editor-model.js";
import { createHistory } from "../editor-history.js";
import { createBuildingController } from "../editor-building-controller.js";
import { createRangeController } from "../editor-range.js";
import { createRangeEraseController } from "../editor-range-erase.js";
import { buildMinimapData, MINIMAP_BIN_COUNT } from "../editor-minimap.js";
import { convertDocumentToTemplate } from "../../template-editor/template-editor-core.js";

const fixed = (kind = "allowed", cell = [2, 2]) => ({ id: `fixed-${kind}`, kind, color: "#123456", cells: [cell] });
const user = (kind = "allowed", cell = [4, 4]) => ({ id: `user-${kind}`, kind, color: "#654321", locked: false, cells: [cell] });

test("combined fixed and user Range ownership is globally unique", () => {
  const document = new MapDocument({ title: "Map", fixedRanges: [fixed()], ranges: [user()] });
  const owners = buildRangeCellOwnerIndex(document, { throwOnOverlap: true });
  assert.equal(owners.size, 2); assert.equal(owners.get("2,2").layer, "fixed"); assert.equal(owners.get("4,4").layer, "user");
  for (const fixedKind of ["allowed", "blocked"]) for (const userKind of ["allowed", "blocked"]) {
    assert.throws(() => new MapDocument({ title: "Map", fixedRanges: [fixed(fixedKind)], ranges: [user(userKind, [2, 2])] }), /Overlapping range cell/);
  }
});

test("all user kind combinations reject even one overlapping rectangle cell", () => {
  for (const firstKind of ["allowed", "blocked"]) for (const secondKind of ["allowed", "blocked"]) {
    engine.createNewDocument(); engine.commitRange({ kind: firstKind, color: "#111111", cells: [[2, 2]] });
    const before = engine.exportDocument();
    assert.throws(() => engine.commitRange({ kind: secondKind, color: "#222222", cells: [[2, 2], [4, 4]] }), error => error.code === "RANGE_OVERLAP");
    assert.deepEqual(engine.exportDocument(), before);
  }
});

test("failed controller creation preserves document, dirty, history, and preview", () => {
  engine.createNewDocument(); engine.commitRange({ kind: "allowed", color: "#111111", cells: [[2, 2]] });
  const history = createHistory(); history.clear({ saved: true }); let dirty = false;
  const buildings = createBuildingController({ engine, history });
  const ranges = createRangeController({ engine, history, buildingController: buildings, onDirty: value => { dirty = value; } });
  const before = engine.exportDocument(); ranges.startCreate({ kind: "blocked", color: "#222222" }); ranges.click([2, 2]); ranges.click([4, 4]);
  assert.throws(() => ranges.commit(), error => error.code === "RANGE_OVERLAP");
  assert.deepEqual(engine.exportDocument(), before); assert.equal(dirty, false); assert.equal(history.getState().undoCount, 0);
  assert.equal(ranges.getState().mode, "rangeCreate"); assert.deepEqual(ranges.getState().previewCells, [[2, 2], [3, 3], [4, 4]]);
});

test("overlapping isomap load and isomap-to-template conversion fail without replacing the current document", () => {
  engine.createNewDocument({ title: "Keep" }); const keep = engine.exportDocument(), invalid = structuredClone(keep);
  invalid.fixed_ranges = [fixed("allowed", [2, 2])]; invalid.ranges = [user("blocked", [2, 2])];
  assert.throws(() => parseDocument(invalid), /Overlapping range cell/);
  assert.throws(() => engine.loadDocument(invalid), /Overlapping range cell/); assert.deepEqual(engine.exportDocument(), keep);
  assert.throws(() => convertDocumentToTemplate(invalid), /Overlapping range cell/);
});

test("minimap receives only canonical non-overlap data and failed creation leaves cache data unchanged", () => {
  engine.createNewDocument(); engine.commitRange({ kind: "allowed", color: "#111111", cells: [[4, 4]] });
  const raw = engine.exportDocument(); raw.fixed_ranges = [fixed("blocked", [2, 2])]; engine.loadDocument(raw);
  const before = buildMinimapData(engine.getDocument()); assert.equal(before.rangeMarks.length, 2);
  assert.throws(() => engine.commitRange({ kind: "blocked", color: "#333333", cells: [[4, 4], [6, 6]] }), error => error.code === "RANGE_OVERLAP");
  assert.deepEqual(buildMinimapData(engine.getDocument()), before);
});

test("Range erase followed by creation updates minimap while preserving the bin policy", () => {
  engine.createNewDocument(); engine.commitRange({ kind: "allowed", color: "#111111", cells: [[2, 2], [4, 4]] });
  const history = createHistory(), buildings = createBuildingController({ engine, history });
  const ranges = createRangeController({ engine, history, buildingController: buildings });
  const erase = createRangeEraseController({ engine, history, buildingController: buildings, rangeController: ranges });
  erase.start(); erase.begin([4, 4]); erase.commit(); engine.commitRange({ kind: "blocked", color: "#222222", cells: [[4, 4]] });
  const data = buildMinimapData(engine.getDocument()); assert.equal(data.sourceCounts.rangeCells, 2); assert.equal(data.rangeMarks.length, 2);
  const cells = []; for (let y = 0; y < 1024; y += 2) for (let x = 0; x < 512; x += 2) cells.push([x, y]);
  const large = buildMinimapData({ fixedRanges: [], ranges: [{ kind: "allowed", color: "#fff", cells }], fixedBuildings: [], buildings: [] });
  assert.ok(large.rangeMarks.length <= MINIMAP_BIN_COUNT * MINIMAP_BIN_COUNT);
});
