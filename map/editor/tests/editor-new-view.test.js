import test from "node:test";
import assert from "node:assert/strict";
import * as engine from "../editor-engine.js";
import { createHistory } from "../editor-history.js";
import { createViewportState } from "../editor-renderer.js";
import { createMinimapProjection, projectViewport } from "../editor-minimap.js";
import { gridToScene } from "../editor-coordinates.js";

function template(centerX, centerY, zoom = 2) {
  return { format: "pns-map-template", version: 1, map: { min_x: 0, max_x: 511, min_y: 0, max_y: 1023 }, fixed_building_types: [], fixed_buildings: [], fixed_ranges: [], view: { center_x: centerX, center_y: centerY, zoom } };
}

test("empty and every template-backed new map start at the map-bounds center", () => {
  const expected = engine.initialMapView();
  assert.deepEqual(engine.createNewDocument().view, expected);
  assert.deepEqual(engine.createNewDocument({ template: template(20, 20, 2) }).view, expected);
  assert.deepEqual(engine.createNewDocument({ template: template(400, 800, .5) }).view, expected);
  assert.deepEqual(expected, { centerX: 255, centerY: 511, zoom: 1 });
});

test("initial center is calculated from supplied map bounds instead of fixed dimensions", () => {
  assert.deepEqual(engine.initialMapView({ minX: 100, maxX: 200, minY: 300, maxY: 500 }), { centerX: 150, centerY: 400, zoom: 1 });
});

test("saved, imported, and shared/read-only documents restore their persisted view", () => {
  const source = engine.createNewDocument(); const raw = engine.exportDocument(); raw.view = { center_x: 40, center_y: 60, zoom: 1.75 };
  assert.deepEqual(engine.loadDocument(raw).view, { centerX: 40, centerY: 60, zoom: 1.75 });
  assert.deepEqual(engine.loadDocument(structuredClone(raw)).view, { centerX: 40, centerY: 60, zoom: 1.75 });
  assert.deepEqual(engine.loadDocument(structuredClone(raw), { readOnly: true }).view, { centerX: 40, centerY: 60, zoom: 1.75 });
  assert.equal(engine.isReadOnly(), true); assert.ok(source);
});

test("new-map minimap viewport is synchronized with the centered engine view", () => {
  const view = engine.createNewDocument().view;
  const state = createViewportState({ centerX: view.centerX, centerY: view.centerY, zoom: view.zoom, width: 800, height: 500 });
  const polygon = projectViewport(state, createMinimapProjection(230, 160));
  const center = polygon.reduce((sum, point) => [sum[0] + point[0] / polygon.length, sum[1] + point[1] / polygon.length], [0, 0]);
  const projectedCenter = createMinimapProjection(230, 160).sceneToMini(...gridToScene(view.centerX, view.centerY));
  assert.ok(Math.abs(center[0] - projectedCenter[0]) < 1e-9); assert.ok(Math.abs(center[1] - projectedCenter[1]) < 1e-9);
});

test("initial centering creates no history command and does not dirty a saved history", () => {
  engine.createNewDocument({ template: template(20, 20) }); const history = createHistory(); history.clear({ saved: true });
  assert.equal(history.getState().undoCount, 0); assert.equal(history.isAtSavedState(), true);
});

test("template view remains in the format even though new user maps ignore it", () => {
  const source = template(20, 20, 2), document = engine.createNewDocument({ template: source });
  assert.deepEqual(source.view, { center_x: 20, center_y: 20, zoom: 2 }); assert.notDeepEqual(document.view, { centerX: 20, centerY: 20, zoom: 2 });
});
