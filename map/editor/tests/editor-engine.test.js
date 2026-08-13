import test from "node:test";
import assert from "node:assert/strict";
import { Building, BuildingType, MapDocument } from "../editor-model.js";
import { diamondVertices, gridToScene, pointIsInsideDiamond, sceneToGrid } from "../editor-coordinates.js";
import { OccupancyManager, calculateOccupiedCells } from "../editor-occupancy.js";
import { DocumentError, parseDocument, serializeDocument } from "../editor-document.js";
import * as engine from "../editor-engine.js";

const types = () => Array.from({ length: 7 }, (_, i) => new BuildingType({ id: `type-${String(i + 1).padStart(2, "0")}`, name: `종류 ${i + 1}`, color: "#123456" }));

test("model defaults and new document match the Python format", () => {
  const document = engine.createNewDocument();
  assert.equal(document.buildingTypes.length, 7);
  assert.deepEqual(document.buildingTypes.map(item => item.id), ["type-01", "type-02", "type-03", "type-04", "type-05", "type-06", "type-07"]);
  assert.deepEqual(engine.exportDocument().map, { min_x: 0, max_x: 511, min_y: 0, max_y: 1023 });
});

test("coordinate conversion, round trip, and diamond hit test", () => {
  for (const cell of [[0, 0], [1, 1], [0, 2], [511, 1], [0, 1022], [511, 1023], [100, 200]]) assert.deepEqual(sceneToGrid(...gridToScene(...cell)), cell);
  assert.deepEqual(gridToScene(15, 15).map((v, i) => v - gridToScene(14, 14)[i]), [32, 16]);
  assert.deepEqual(diamondVertices(0, 0), [[0, -16], [32, 0], [0, 16], [-32, 0]]);
  assert.equal(pointIsInsideDiamond(32, 0, 0, 0), true);
  assert.equal(pointIsInsideDiamond(32.01, 0, 0, 0), false);
  assert.throws(() => gridToScene(15, 14));
});

test("occupancy detects collisions and updates add, move, and delete", () => {
  assert.deepEqual(calculateOccupiedCells(48, 1020, 2, 2), [[47, 1019], [48, 1018], [49, 1019], [48, 1020]]);
  const large = new Building({ id: "large", name: "large", typeId: "type-01", x: 20, y: 20, width: 2, height: 2 });
  const manager = new OccupancyManager([large]);
  assert.deepEqual(manager.checkPosition({ x: 22, y: 20, width: 2, height: 2 }).conflictingCells, [[21, 19]]);
  manager.moveBuilding("large", 24, 24);
  assert.equal(manager.buildingIdAt(20, 20), null);
  assert.equal(manager.buildingIdAt(24, 24), "large");
  manager.removeBuilding("large");
  assert.equal(manager.buildingIdAt(24, 24), null);
});

test("engine adds, moves, deletes, and enforces read-only mode", () => {
  engine.createNewDocument();
  engine.addBuilding({ id: "a", name: "A", typeId: "type-01", x: 14, y: 14, width: 1, height: 1 });
  assert.equal(engine.canPlaceBuilding({ x: 14, y: 14, width: 1, height: 1 }).canPlace, false);
  engine.moveBuilding("a", 16, 16);
  assert.equal(engine.getOccupancy().buildingIdAt(16, 16), "a");
  engine.deleteBuilding("a");
  assert.equal(engine.getDocument().buildings.length, 0);
  engine.loadDocument(engine.exportDocument(), { readOnly: true });
  assert.equal(engine.isReadOnly(), true);
  assert.throws(() => engine.addBuilding({ name: "B", typeId: "type-01", x: 2, y: 2, width: 1, height: 1 }));
});

test("document serialization round trips without aliasing", () => {
  const source = new MapDocument({ title: "한글 지도", buildingTypes: types(), buildings: [new Building({ id: "건물-id", name: "한글 중앙 청사", typeId: "type-01", x: 14, y: 14, width: 1, height: 1 })], view: { centerX: 100, centerY: 200, zoom: 1.75 } });
  const data = serializeDocument(source), loaded = parseDocument(data), dataAgain = serializeDocument(loaded);
  assert.deepEqual(dataAgain, data);
  data.building_types[0].name = "mutated";
  assert.notEqual(loaded.buildingTypes[0].name, "mutated");
});

test("invalid documents are rejected", () => {
  const data = serializeDocument(new MapDocument({ title: "검사 지도", buildingTypes: types(), view: { centerX: 0, centerY: 0, zoom: 1 } }));
  assert.throws(() => parseDocument({ ...data, version: 2 }), DocumentError);
  assert.throws(() => parseDocument({ ...data, building_types: data.building_types.slice(0, 1) }), DocumentError);
  assert.throws(() => parseDocument({ ...data, view: { ...data.view, zoom: 20 } }), DocumentError);
  const overlapping = structuredClone(data);
  overlapping.buildings = [
    { id: "a", name: "A", type_id: "type-01", x: 14, y: 14, width: 1, height: 1 },
    { id: "b", name: "B", type_id: "type-01", x: 14, y: 14, width: 1, height: 1 },
  ];
  assert.throws(() => parseDocument(overlapping), DocumentError);
});
