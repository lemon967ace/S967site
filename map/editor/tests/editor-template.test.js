import test from "node:test";
import assert from "node:assert/strict";
import * as engine from "../editor-engine.js";
import { parseDocument, serializeDocument, DocumentError } from "../editor-document.js";
import { parseTemplate, serializeTemplate, applyTemplateToNewDocument, TemplateError } from "../editor-template.js";
import { evaluatePlacementCells } from "../editor-placement-rules.js";
import { RENDERER_LAYER_ORDER } from "../editor-renderer.js";
import { buildingRenderGeometry } from "../editor-building-renderer.js";
import { createHistory } from "../editor-history.js";
import { createBuildingController } from "../editor-building-controller.js";
import { createRangeController } from "../editor-range.js";
import { createBulkDeleteController } from "../editor-bulk-delete.js";
import { createRangeEraseController } from "../editor-range-erase.js";

const template = (overrides = {}) => ({
  format: "pns-map-template", version: 1,
  map: { min_x: 0, max_x: 511, min_y: 0, max_y: 1023 },
  fixed_building_types: [{ id: "fixed-type-1", name: "Station", color: "#334455", width: 1, height: 1 }],
  fixed_buildings: [{ id: "fixed-1", name: "Fixed station", type_id: "fixed-type-1", x: 20, y: 20 }],
  fixed_ranges: [
    { id: "fixed-allowed", kind: "allowed", color: "#22aa55", cells: [[20, 20], [21, 21], [22, 22], [23, 23], [24, 24], [25, 25], [26, 26]] },
    { id: "fixed-blocked", kind: "blocked", color: "#aa2233", cells: [[30, 30]] },
  ],
  view: { center_x: 20, center_y: 20, zoom: 1 }, ...overrides,
});

test("isomap and isotemplate formats are strictly separated", () => {
  engine.createNewDocument(); const isomap = engine.exportDocument(), isotemplate = template();
  assert.throws(() => parseDocument(isotemplate), DocumentError); assert.throws(() => parseTemplate(isomap), TemplateError);
  assert.notEqual(isomap.format, isotemplate.format);
});

test("template validates version, duplicate fixed type/building IDs, and type references", () => {
  assert.throws(() => parseTemplate({ ...template(), version: 2 }), TemplateError);
  assert.throws(() => parseTemplate({ ...template(), fixed_building_types: [...template().fixed_building_types, { ...template().fixed_building_types[0] }] }), TemplateError);
  assert.throws(() => parseTemplate({ ...template(), fixed_buildings: [...template().fixed_buildings, { ...template().fixed_buildings[0] }] }), TemplateError);
  assert.throws(() => parseTemplate({ ...template(), fixed_buildings: [{ ...template().fixed_buildings[0], type_id: "missing" }] }), TemplateError);
});

test("template rejects invalid coordinates, fixed collisions, invalid ranges, and overlaps", () => {
  assert.throws(() => parseTemplate({ ...template(), fixed_buildings: [{ ...template().fixed_buildings[0], x: 999 }] }), TemplateError);
  assert.throws(() => parseTemplate({ ...template(), fixed_buildings: [template().fixed_buildings[0], { ...template().fixed_buildings[0], id: "fixed-2" }] }), TemplateError);
  assert.throws(() => parseTemplate({ ...template(), fixed_ranges: [{ id: "bad", kind: "other", color: "#fff", cells: [[0, 0]] }] }), TemplateError);
  assert.throws(() => parseTemplate({ ...template(), fixed_ranges: [{ id: "a", kind: "allowed", color: "#fff", cells: [[0, 0]] }, { id: "b", kind: "blocked", color: "#000", cells: [[0, 0]] }] }), TemplateError);
});

test("empty template is valid", () => {
  const empty = parseTemplate(template({ fixed_building_types: [], fixed_buildings: [], fixed_ranges: [] }));
  assert.deepEqual([empty.fixedBuildingTypes, empty.fixedBuildings, empty.fixedRanges], [[], [], []]);
});

test("empty and template documents keep seven user types and separate empty user collections", () => {
  const empty = engine.createNewDocument(); assert.deepEqual([empty.fixedBuildingTypes, empty.fixedBuildings, empty.fixedRanges], [[], [], []]);
  const fromTemplate = engine.createNewDocument({ template: template() });
  assert.equal(fromTemplate.buildingTypes.length, 7); assert.deepEqual(fromTemplate.buildings, []); assert.deepEqual(fromTemplate.ranges, []);
  assert.equal(fromTemplate.fixedBuildingTypes.length, 1); assert.equal(fromTemplate.fixedBuildings.length, 1); assert.equal(fromTemplate.fixedRanges.length, 2);
});

test("template application is a deep independent snapshot", () => {
  const source = template(), document = applyTemplateToNewDocument(source); source.fixed_buildings[0].name = "Changed"; source.fixed_ranges[0].cells.length = 0;
  assert.equal(document.fixedBuildings[0].name, "Fixed station"); assert.ok(document.fixedRanges[0].cells.length > 0);
  assert.doesNotThrow(() => serializeDocument(document));
});

test("old isomap migrates missing fixed arrays to empty and new isomap round trips fixed data", () => {
  engine.createNewDocument(); const old = engine.exportDocument(); delete old.fixed_building_types; delete old.fixed_buildings; delete old.fixed_ranges;
  const migrated = parseDocument(old); assert.deepEqual([migrated.fixedBuildingTypes, migrated.fixedBuildings, migrated.fixedRanges], [[], [], []]);
  const fixedData = serializeDocument(applyTemplateToNewDocument(template())); assert.deepEqual(serializeDocument(parseDocument(fixedData)), fixedData);
});

test("template serialization is canonical and independent", () => {
  const parsed = parseTemplate(template()), data = serializeTemplate(parsed), again = serializeTemplate(parseTemplate(data)); assert.deepEqual(again, data);
  data.fixed_buildings[0].name = "Mutated"; assert.equal(parsed.fixedBuildings[0].name, "Fixed station");
});

test("fixed building renders through existing geometry and occupies collision index", () => {
  const doc = engine.createNewDocument({ template: template() }); const geometry = buildingRenderGeometry(doc.fixedBuildings[0]); assert.equal(geometry.building.fixed, true);
  assert.equal(engine.getOccupancy().buildingIdAt(20, 20), "fixed-1"); assert.equal(engine.canPlaceBuilding({ x: 20, y: 20, width: 1, height: 1 }).canPlace, false);
});

test("fixed building cannot move, edit, delete, or enter user bulk deletion", () => {
  engine.createNewDocument({ template: template() });
  assert.throws(() => engine.moveBuilding("fixed-1", 22, 22), /Fixed/); assert.throws(() => engine.editBuilding("fixed-1", { name: "X" }), /Fixed/); assert.throws(() => engine.deleteBuilding("fixed-1"), /Fixed/);
  const history = createHistory(), buildingController = createBuildingController({ engine, history }), rangeController = createRangeController({ engine, history, buildingController });
  const bulk = createBulkDeleteController({ engine, history, buildingController, rangeController }); bulk.start(); bulk.begin([20, 20]); assert.deepEqual([...bulk.getState().targetIds], []);
});

test("Range erase only mutates user ranges and never fixedRanges", () => {
  engine.createNewDocument({ template: template() }); engine.commitRange({ kind: "blocked", color: "#000000", cells: [[28, 28]] });
  const history = createHistory(), buildings = createBuildingController({ engine, history }), ranges = createRangeController({ engine, history, buildingController: buildings });
  const erase = createRangeEraseController({ engine, history, buildingController: buildings, rangeController: ranges }); const fixedBefore = engine.exportDocument().fixed_ranges;
  erase.start(); erase.begin([20, 20]); erase.update([28, 28]); erase.commit(); assert.deepEqual(engine.exportDocument().fixed_ranges, fixedBefore); assert.deepEqual(engine.getDocument().ranges, []);
});

test("fixed Range cannot enter user edit or delete APIs", () => {
  engine.createNewDocument({ template: template() }); assert.throws(() => engine.editRange("fixed-allowed", { locked: false }), /Unknown/); assert.throws(() => engine.deleteRange("fixed-allowed"), /Unknown/);
});

test("fixed and user Range overlap is rejected before placement", () => {
  engine.createNewDocument({ template: template() });
  assert.throws(() => engine.commitRange({ kind: "allowed", color: "#ffffff", cells: [[30, 30]] }), error => error.code === "RANGE_OVERLAP");
  assert.equal(engine.getDocument().ranges.length, 0);
  assert.equal(engine.canPlaceBuilding({ x: 30, y: 30, width: 1, height: 1 }).canPlace, false);
});

test("non-overlapping fixed allowed scope retains Stage 10 placement semantics", () => {
  engine.createNewDocument({ template: template({ fixed_buildings: [] }) });
  assert.equal(engine.canPlaceBuilding({ x: 22, y: 22, width: 1, height: 1 }).canPlace, true);
  assert.equal(engine.canPlaceBuilding({ x: 40, y: 40, width: 1, height: 1 }).canPlace, false);
});

test("user allowed policy activates only when an allowed Range exists", () => {
  engine.createNewDocument(); assert.equal(engine.canPlaceBuilding({ x: 40, y: 40, width: 1, height: 1 }).canPlace, true);
  engine.commitRange({ kind: "allowed", color: "#fff", cells: [[20, 20]] }); assert.equal(engine.canPlaceBuilding({ x: 20, y: 20, width: 1, height: 1 }).canPlace, true); assert.equal(engine.canPlaceBuilding({ x: 22, y: 22, width: 1, height: 1 }).canPlace, false);
});

test("2x2 placement evaluates every occupied cell", () => {
  engine.createNewDocument(); engine.commitRange({ kind: "allowed", color: "#fff", cells: [[19, 19], [20, 18], [21, 19], [20, 20]] }); assert.equal(engine.canPlaceBuilding({ x: 20, y: 20, width: 2, height: 2 }).canPlace, true);
  engine.createNewDocument(); engine.commitRange({ kind: "blocked", color: "#000", cells: [[21, 19]] }); assert.equal(engine.canPlaceBuilding({ x: 20, y: 20, width: 2, height: 2 }).canPlace, false);
});

test("placement evaluator reports blocked cells without scanning the full map", () => {
  const result = evaluatePlacementCells([[0, 0], [2, 2]], { fixedRanges: [{ kind: "blocked", cells: [[2, 2]] }], ranges: [] }); assert.equal(result.allowed, false); assert.deepEqual(result.blockedCells, [[2, 2]]);
});

test("fixed data survives user Undo/Redo and shared read-only load", () => {
  const initial = engine.createNewDocument({ template: template() }); const fixed = engine.exportDocument().fixed_buildings;
  const history = createHistory(), controller = createBuildingController({ engine, history }); controller.selectPalette("type-01", 1); controller.commitAt(22, 22, { name: "User" }); controller.undo(); controller.redo(); assert.deepEqual(engine.exportDocument().fixed_buildings, fixed);
  engine.loadDocument(engine.exportDocument(), { readOnly: true }); assert.equal(engine.getDocument().fixedBuildings.length, initial.fixedBuildings.length); assert.throws(() => engine.deleteBuilding("fixed-1"));
});

test("renderer layer order keeps fixed and user layers distinct", () => {
  assert.deepEqual(RENDERER_LAYER_ORDER, ["grid", "fixedRanges", "userRanges", "fixedBuildings", "userBuildings", "interaction", "labels", "previews"]);
});
