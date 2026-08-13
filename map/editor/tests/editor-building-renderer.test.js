import test from "node:test";
import assert from "node:assert/strict";
import {
  BuildingInteractionState,
  buildingPolygon,
  buildingRenderGeometry,
  chooseBuildingLabelLayout,
  cullBuildingGeometries,
  hitTestBuildings,
  isTapSelectionCandidate,
  labelSceneCenter,
  orderBuildingsForDraw,
  preferredFontSizeForZoom,
} from "../editor-building-renderer.js";
import { Building } from "../editor-model.js";
import * as engine from "../editor-engine.js";

const makeBuilding = overrides => new Building({
  id: "a", name: "중앙청사", typeId: "type-01",
  x: 10, y: 10, width: 1, height: 1, ...overrides,
});
const measure = (text, fontSize) => {
  const lines = text.split("\n");
  return { width: Math.max(...lines.map(line => line.length)) * fontSize * 0.6, height: lines.length * fontSize * 1.2 };
};

test("1x1 render geometry is the Python tile diamond", () => {
  assert.deepEqual(buildingPolygon(makeBuilding({ x: 0, y: 0 })), [[-32, 0], [0, -16], [32, 0], [0, 16]]);
});

test("2x2 geometry unions occupied cells without internal grid lines", () => {
  const building = makeBuilding({ x: 48, y: 1020, width: 2, height: 2 });
  assert.equal(building.occupiedCells().length, 4);
  assert.deepEqual(buildingPolygon(building), [[1472, 16304], [1536, 16272], [1600, 16304], [1536, 16336]]);
});

test("draw order preserves Python insertion order and raises selection", () => {
  const a = makeBuilding({ id: "a", x: 10, y: 10 });
  const b = makeBuilding({ id: "b", x: 20, y: 20 });
  const c = makeBuilding({ id: "c", x: 30, y: 30 });
  assert.deepEqual(orderBuildingsForDraw([a, b, c], "b").map(item => item.id), ["a", "c", "b"]);
  assert.deepEqual(orderBuildingsForDraw([a, b, c]).map(item => item.id), ["a", "b", "c"]);
});

test("viewport culling excludes off-screen building bounds", () => {
  const visible = makeBuilding({ id: "visible", x: 10, y: 10 });
  const outside = makeBuilding({ id: "outside", x: 100, y: 100 });
  assert.deepEqual(cullBuildingGeometries([visible, outside], { left: 250, right: 390, top: 100, bottom: 220 }).map(item => item.building.id), ["visible"]);
});

test("pointer hit finds a building and empty space returns null", () => {
  const geometry = buildingRenderGeometry(makeBuilding({ x: 10, y: 10 }));
  assert.equal(hitTestBuildings(320, 160, [geometry])?.id, "a");
  assert.equal(hitTestBuildings(500, 500, [geometry]), null);
});

test("hit testing chooses the topmost drawn building", () => {
  const lower = makeBuilding({ id: "lower", x: 10, y: 10 });
  const upper = makeBuilding({ id: "upper", x: 10, y: 10 });
  const geometries = [buildingRenderGeometry(lower), buildingRenderGeometry(upper)];
  assert.equal(hitTestBuildings(320, 160, geometries)?.id, "upper");
  assert.equal(hitTestBuildings(320, 160, geometries, "lower")?.id, "lower");
});

test("selection and blank-space clear are transient state changes", () => {
  const state = new BuildingInteractionState();
  assert.equal(state.select("a"), true);
  assert.equal(state.selectedBuildingId, "a");
  assert.equal(state.select("a"), false);
  assert.equal(state.clearSelection(), true);
  assert.equal(state.selectedBuildingId, null);
});

test("hover invalidates only when the building changes", () => {
  const state = new BuildingInteractionState();
  assert.equal(state.hover("a"), true);
  assert.equal(state.hover("a"), false);
  assert.equal(state.hover("b"), true);
  assert.equal(state.clearHover(), true);
});

test("pan gestures and cancelled pointers cannot trigger selection", () => {
  assert.equal(isTapSelectionCandidate({ selectionAllowed: false, moved: false }), false);
  assert.equal(isTapSelectionCandidate({ selectionAllowed: true, moved: true }), false);
  assert.equal(isTapSelectionCandidate({ selectionAllowed: true, moved: false }, true), false);
  assert.equal(isTapSelectionCandidate({ selectionAllowed: true, moved: false }), true);
});

test("read-only selection is allowed without changing document data", () => {
  engine.createNewDocument();
  engine.addBuilding(makeBuilding({ id: "readonly" }));
  const data = engine.exportDocument();
  engine.loadDocument(data, { readOnly: true });
  const state = new BuildingInteractionState();
  assert.equal(state.select("readonly"), true);
  assert.equal(state.selectedBuildingId, "readonly");
  assert.deepEqual(engine.exportDocument(), data);
});

test("label center is the combined building bounds center", () => {
  const geometry = buildingRenderGeometry(makeBuilding({ x: 48, y: 1020, width: 2, height: 2 }));
  assert.deepEqual(labelSceneCenter(geometry), [1536, 16304]);
});

test("label policy matches Python detail, name-only, hidden, and font scaling", () => {
  const building = makeBuilding({ x: 14, y: 14 });
  assert.equal(chooseBuildingLabelLayout({ building, bounds: { width: 180, height: 80 }, zoom: 2, measureText: measure }).mode, "detail");
  assert.equal(chooseBuildingLabelLayout({ building, bounds: { width: 80, height: 18 }, zoom: 1, measureText: measure }).mode, "name_only");
  assert.equal(chooseBuildingLabelLayout({ building, bounds: { width: 40, height: 25 }, zoom: 0.2, measureText: measure }).mode, "hidden");
  assert.ok(preferredFontSizeForZoom(4) > preferredFontSizeForZoom(0.5));
});
