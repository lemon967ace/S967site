import test from "node:test";
import assert from "node:assert/strict";
import {
  MAXIMUM_ZOOM,
  MINIMUM_ZOOM,
  clampZoom,
  createViewportState,
  panViewport,
  resizeViewport,
  sceneToScreen,
  screenToScene,
  visibleGridBounds,
  viewportCenterGrid,
  zoomViewportAt,
} from "../editor-renderer.js";
import { gridToScene } from "../editor-coordinates.js";
import * as engine from "../editor-engine.js";

test("viewport center maps to the screen center", () => {
  const state = createViewportState({ centerX: 100, centerY: 200, zoom: 1, width: 800, height: 600 });
  assert.deepEqual(sceneToScreen(...gridToScene(100, 200), state), [400, 300]);
  assert.deepEqual(viewportCenterGrid(state), [100, 200]);
});

test("resize preserves scene conversions and updates the screen origin", () => {
  const initial = createViewportState({ centerX: 100, centerY: 200, zoom: 2, width: 800, height: 600 });
  const scenePoint = screenToScene(250, 175, initial);
  const resized = resizeViewport(initial, 1200, 900, 2);
  assert.deepEqual(screenToScene(...sceneToScreen(...scenePoint, resized), resized), scenePoint);
  assert.deepEqual(sceneToScreen(initial.sceneCenterX, initial.sceneCenterY, resized), [600, 450]);
  assert.equal(resized.devicePixelRatio, 2);
});

test("zoom clamps to the Python minimum and maximum", () => {
  assert.equal(clampZoom(0), MINIMUM_ZOOM);
  assert.equal(clampZoom(100), MAXIMUM_ZOOM);
  assert.equal(clampZoom(1.5), 1.5);
});

test("cursor-centered zoom keeps the same scene point under the cursor", () => {
  const state = createViewportState({ centerX: 100, centerY: 200, zoom: 1, width: 1000, height: 700 });
  const cursor = [760, 180];
  const sceneBefore = screenToScene(...cursor, state);
  const zoomed = zoomViewportAt(state, 1.15, ...cursor);
  const sceneAfter = screenToScene(...cursor, zoomed);
  assert.ok(Math.abs(sceneAfter[0] - sceneBefore[0]) < 1e-9);
  assert.ok(Math.abs(sceneAfter[1] - sceneBefore[1]) < 1e-9);
});

test("visible bounds are culled and never extend outside the map", () => {
  const middle = createViewportState({ centerX: 100, centerY: 200, zoom: 1, width: 640, height: 480 });
  const bounds = visibleGridBounds(middle);
  assert.ok(bounds.minX > 0 && bounds.maxX < 511);
  assert.ok(bounds.minY > 0 && bounds.maxY < 1023);
  assert.ok(bounds.minX <= 100 && bounds.maxX >= 100);
  assert.ok(bounds.minY <= 200 && bounds.maxY >= 200);
  const corner = createViewportState({ centerX: 0, centerY: 0, zoom: 0.01, width: 2000, height: 1200 });
  assert.deepEqual(visibleGridBounds(corner), { minX: 0, maxX: 511, minY: 0, maxY: 1023 });
});

test("pan delta moves the scene center with Python scrollbar direction", () => {
  const state = createViewportState({ centerX: 100, centerY: 200, zoom: 2, width: 800, height: 600 });
  const panned = panViewport(state, 40, -20);
  assert.equal(panned.sceneCenterX, state.sceneCenterX - 20);
  assert.equal(panned.sceneCenterY, state.sceneCenterY + 10);
});

test("read-only navigation returns local view without mutating the document", () => {
  engine.createNewDocument();
  const data = engine.exportDocument();
  engine.loadDocument(data, { readOnly: true });
  const navigation = engine.setView({ centerX: 100, centerY: 200, zoom: 2 });
  assert.deepEqual(navigation, { centerX: 100, centerY: 200, zoom: 2, persisted: false });
  assert.deepEqual(engine.getView(), { centerX: 0, centerY: 0, zoom: 1 });
  assert.deepEqual(engine.exportDocument().view, data.view);
});

test("editable navigation persists the view for serialization", () => {
  engine.createNewDocument();
  const navigation = engine.setView({ centerX: 100, centerY: 200, zoom: 2 });
  assert.equal(navigation.persisted, true);
  assert.deepEqual(engine.exportDocument().view, { center_x: 100, center_y: 200, zoom: 2 });
});
