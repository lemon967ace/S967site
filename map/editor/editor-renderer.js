import { MAP_MIN_X, MAP_MAX_X, MAP_MIN_Y, MAP_MAX_Y } from "./editor-model.js";
import {
  DEFAULT_TILE_HEIGHT,
  DEFAULT_TILE_WIDTH,
  diamondVertices,
  gridLineSceneEndpoints,
  gridToScene,
  nearestValidGridCoordinate,
  sceneToGrid,
  sceneToGridContinuous,
  visibleGridBoundaryRanges,
} from "./editor-coordinates.js";
import { visibleRangeCells } from "./editor-range.js";
import {
  BuildingInteractionState,
  buildingRenderGeometry,
  chooseBuildingLabelLayout,
  cullBuildingGeometryCache,
  hitTestBuildings,
  isTapSelectionCandidate,
  labelSceneCenter,
  orderBuildingsForDraw,
} from "./editor-building-renderer.js";

export const MINIMUM_ZOOM = 0.01;
export const MAXIMUM_ZOOM = 4;
export const ZOOM_STEP = 1.15;
export const RENDERER_LAYER_ORDER = Object.freeze(["grid", "fixedRanges", "userRanges", "fixedBuildings", "userBuildings", "interaction", "labels", "previews"]);

export function clampZoom(value) {
  return Math.max(MINIMUM_ZOOM, Math.min(MAXIMUM_ZOOM, value));
}

export function createViewportState({ centerX, centerY, zoom, width = 0, height = 0, devicePixelRatio = 1 }) {
  const [sceneCenterX, sceneCenterY] = gridToScene(...nearestValidGridCoordinate(centerX, centerY));
  return { sceneCenterX, sceneCenterY, zoom: clampZoom(zoom), width, height, devicePixelRatio };
}

export function sceneToScreen(sceneX, sceneY, state) {
  return [
    (sceneX - state.sceneCenterX) * state.zoom + state.width / 2,
    (sceneY - state.sceneCenterY) * state.zoom + state.height / 2,
  ];
}

export function screenToScene(screenX, screenY, state) {
  return [
    state.sceneCenterX + (screenX - state.width / 2) / state.zoom,
    state.sceneCenterY + (screenY - state.height / 2) / state.zoom,
  ];
}

export function resizeViewport(state, width, height, devicePixelRatio = 1) {
  return { ...state, width, height, devicePixelRatio };
}

export function zoomViewportAt(state, requestedZoom, screenX, screenY) {
  const zoom = clampZoom(requestedZoom);
  const [anchorX, anchorY] = screenToScene(screenX, screenY, state);
  return {
    ...state,
    zoom,
    sceneCenterX: anchorX - (screenX - state.width / 2) / zoom,
    sceneCenterY: anchorY - (screenY - state.height / 2) / zoom,
  };
}

export function panViewport(state, deltaScreenX, deltaScreenY) {
  return {
    ...state,
    sceneCenterX: state.sceneCenterX - deltaScreenX / state.zoom,
    sceneCenterY: state.sceneCenterY - deltaScreenY / state.zoom,
  };
}

export function visibleSceneRectangle(state) {
  const [left, top] = screenToScene(0, 0, state);
  const [right, bottom] = screenToScene(state.width, state.height, state);
  return { left, top, right, bottom };
}

export function visibleGridBounds(state, margin = 2) {
  const rect = visibleSceneRectangle(state);
  const corners = [
    sceneToGridContinuous(rect.left, rect.top),
    sceneToGridContinuous(rect.right, rect.top),
    sceneToGridContinuous(rect.left, rect.bottom),
    sceneToGridContinuous(rect.right, rect.bottom),
  ];
  return {
    minX: Math.max(MAP_MIN_X, Math.floor(Math.min(...corners.map(point => point[0]))) - margin),
    maxX: Math.min(MAP_MAX_X, Math.ceil(Math.max(...corners.map(point => point[0]))) + margin),
    minY: Math.max(MAP_MIN_Y, Math.floor(Math.min(...corners.map(point => point[1]))) - margin),
    maxY: Math.min(MAP_MAX_Y, Math.ceil(Math.max(...corners.map(point => point[1]))) + margin),
  };
}

export function viewportCenterGrid(state) {
  const [x, y] = sceneToGridContinuous(state.sceneCenterX, state.sceneCenterY);
  return nearestValidGridCoordinate(x, y);
}

export function createMapRenderer({ host, engine, controller = null, rangeController = null, bulkDeleteController = null, rangeEraseController = null, buildingFilter = null, editableFixed = false, requestBuildingName = () => null, confirmBulkDelete = () => true, notifyBulkDeleteEmpty = () => {}, confirmRangeErase = () => true, notifyRangeEraseEmpty = () => {}, editorHost = globalThis.S967EditorHost, onSelectionChange = () => {}, onRangeSelectionChange = () => {}, onRangeStateChange = () => {}, onBulkDeleteStateChange = () => {}, onRangeEraseStateChange = () => {}, onViewportChange = () => {}, onDocumentChange = () => {} }) {
  if (!(host instanceof HTMLElement)) throw new TypeError("A map canvas host is required.");
  const documentView = engine.getView();
  let state = createViewportState(documentView);
  let frame = 0, destroyed = false, panning = null, clickCandidate = null, rangeDrawing = null, bulkDrawing = null, eraseDrawing = null, spacePressed = false;
  const interaction = new BuildingInteractionState();
  let mapDocument, buildingTypes, fixedBuildingTypes, buildingGeometries;
  function refreshDocument() {
    mapDocument = engine.getDocument();
    buildingTypes = new Map(mapDocument.buildingTypes.map(type => [type.id, type]));
    fixedBuildingTypes = new Map(mapDocument.fixedBuildingTypes.map(type => [type.id, type]));
    buildingGeometries = [...mapDocument.fixedBuildings, ...mapDocument.buildings].map(buildingRenderGeometry);
    onDocumentChange(mapDocument);
  }
  refreshDocument();

  const canvas = document.createElement("canvas");
  canvas.className = "pns-map-canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "PNS map viewport");
  Object.assign(canvas.style, { width: "100%", height: "100%", display: "block", cursor: "default" });
  host.append(canvas);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas 2D is unavailable.");

  function invalidate() {
    if (destroyed || frame) return;
    frame = requestAnimationFrame(() => { frame = 0; draw(); });
  }

  function draw() {
    const dpr = state.devicePixelRatio;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const explicitTheme = document.documentElement.dataset.theme;
    const dark = explicitTheme === "dark" || (!explicitTheme && matchMedia("(prefers-color-scheme: dark)").matches);
    context.fillStyle = dark ? "#111318" : "#f7f7f7";
    context.fillRect(0, 0, state.width, state.height);
    context.strokeStyle = dark ? "rgba(255,255,255,0.20)" : "#c8c8c8";
    context.lineWidth = 1;
    context.beginPath();
    const ranges = visibleGridBoundaryRanges(visibleSceneRectangle(state));
    for (const boundary of ranges.xBoundaries) addGridLine("x", boundary);
    for (const boundary of ranges.yBoundaries) addGridLine("y", boundary);
    context.stroke();
    drawFixedRanges();
    drawRanges();
    drawBuildings();
    drawPreview();
    drawBulkDeletePreview();
    drawRangeErasePreview();
  }

  function drawRanges() {
    const bounds = visibleGridBounds(state, 1), selectedId = rangeController?.getState().selectedRangeId;
    for (const range of mapDocument.ranges) for (const cell of visibleRangeCells(range, bounds)) {
      traceCell(cell); context.fillStyle = withAlpha(range.color, 0.29); context.fill(); context.strokeStyle = range.color; context.lineWidth = Math.max(1, (range.locked ? 2.4 : 1.2) * state.zoom); context.stroke();
      if (range.kind === "blocked") { const vertices = diamondVertices(...cell), a = sceneToScreen(...vertices[3], state), b = sceneToScreen(...vertices[1], state); context.beginPath(); context.moveTo(...a); context.lineTo(...b); context.stroke(); }
      if (range.id === selectedId) { traceCell(cell); context.strokeStyle = "#7C3AED"; context.lineWidth = Math.max(2, 2.2 * state.zoom); context.stroke(); }
    }
    const preview = rangeController?.getState().previewCells ?? [];
    for (const cell of preview) { traceCell(cell); context.fillStyle = "rgba(124,58,237,.22)"; context.fill(); context.strokeStyle = "#7C3AED"; context.lineWidth = 2; context.stroke(); }
  }

  function drawFixedRanges() {
    const bounds = visibleGridBounds(state, 1), selectedId = editableFixed ? rangeController?.getState().selectedRangeId : null;
    for (const range of mapDocument.fixedRanges) for (const cell of visibleRangeCells(range, bounds)) {
      traceCell(cell); context.fillStyle = withAlpha(range.color, range.kind === "blocked" ? 0.42 : 0.22); context.fill();
      context.save(); context.setLineDash([Math.max(3, 5 * state.zoom), Math.max(2, 3 * state.zoom)]); context.strokeStyle = range.kind === "blocked" ? "#b91c1c" : range.color; context.lineWidth = Math.max(1.5, 2.4 * state.zoom); context.stroke(); context.restore();
      if (range.kind === "blocked") { const vertices = diamondVertices(...cell), a = sceneToScreen(...vertices[3], state), b = sceneToScreen(...vertices[1], state); context.beginPath(); context.moveTo(...a); context.lineTo(...b); context.strokeStyle = "#b91c1c"; context.lineWidth = Math.max(1.5, 2 * state.zoom); context.stroke(); }
      if (range.id === selectedId) { traceCell(cell); context.strokeStyle = "#7C3AED"; context.lineWidth = Math.max(2, 2.2 * state.zoom); context.stroke(); }
    }
  }

  function traceCell(cell) { context.beginPath(); diamondVertices(...cell).forEach((point, index) => { const screen = sceneToScreen(...point, state); index ? context.lineTo(...screen) : context.moveTo(...screen); }); context.closePath(); }

  function drawPreview() {
    const preview = controller?.getState().preview;
    if (!preview) return;
    const geometry = buildingRenderGeometry({ id: "preview", name: "", affiliation: "", locked: false, ...preview });
    const type = (editableFixed ? fixedBuildingTypes : buildingTypes).get(preview.typeId);
    context.save(); context.globalAlpha = preview.valid ? 0.55 : 0.72;
    fillAndStrokeGeometry(geometry, preview.valid ? (type?.color ?? "#4E79A7") : "#e53935", preview.valid ? "#ffffff" : "#8b0000", Math.max(1.5, 3 * state.zoom));
    context.restore();
  }

  function drawBulkDeletePreview() {
    const bulkState = bulkDeleteController?.getState();
    if (!bulkState?.previewCells.length) return;
    for (const cell of bulkState.previewCells) {
      traceCell(cell); context.fillStyle = "rgba(220,60,60,.22)"; context.fill();
      context.strokeStyle = "rgb(255,100,100)"; context.lineWidth = Math.max(1.5, 2 * state.zoom); context.stroke();
    }
  }

  function drawRangeErasePreview() {
    const eraseState = rangeEraseController?.getState();
    if (!eraseState?.previewCells.length) return;
    for (const cell of eraseState.previewCells) {
      traceCell(cell); context.fillStyle = "rgba(220,60,60,.22)"; context.fill();
      context.strokeStyle = "rgb(255,100,100)"; context.lineWidth = Math.max(1.5, 2 * state.zoom); context.stroke();
    }
  }

  function addGridLine(axis, boundary) {
    const [start, end] = gridLineSceneEndpoints(axis, boundary);
    const [x1, y1] = sceneToScreen(...start, state), [x2, y2] = sceneToScreen(...end, state);
    context.moveTo(x1, y1); context.lineTo(x2, y2);
  }

  function visibleBuildingGeometries() {
    return cullBuildingGeometryCache(buildingGeometries, visibleSceneRectangle(state));
  }

  function drawBuildings() {
    const visible = visibleBuildingGeometries();
    const byId = new Map(visible.map(item => [item.building.id, item]));
    const fixedOrdered = orderBuildingsForDraw(visible.filter(item => item.building.fixed).map(item => item.building), interaction.selectedBuildingId);
    const userOrdered = orderBuildingsForDraw(visible.filter(item => !item.building.fixed).map(item => item.building), interaction.selectedBuildingId);
    const ordered = [...fixedOrdered, ...userOrdered];
    for (const building of ordered) { const appearance = building.fixed ? { visible: true, bodyAlpha: 1 } : (buildingFilter?.appearance(building, interaction.selectedBuildingId) ?? { visible: true, bodyAlpha: 1 }); if (appearance.visible) { context.save(); context.globalAlpha = appearance.bodyAlpha; drawBuildingBody(byId.get(building.id), building.fixed ? fixedBuildingTypes.get(building.typeId) : buildingTypes.get(building.typeId), building.fixed); context.restore(); } }
    for (const building of ordered) {
      const geometry = byId.get(building.id);
      if (building.id === interaction.hoveredBuildingId && building.id !== interaction.selectedBuildingId) strokeGeometry(geometry, "rgba(80, 175, 255, 0.95)", Math.max(1.5, 2 * state.zoom));
      if (building.id === interaction.selectedBuildingId) strokeGeometry(geometry, "#FFD54F", Math.max(2, 5 * state.zoom));
    }
    for (const building of ordered) { const appearance = building.fixed ? { visible: true, labelAlpha: 1 } : (buildingFilter?.appearance(building, interaction.selectedBuildingId) ?? { visible: true, labelAlpha: 1 }); if (appearance.visible) { context.save(); context.globalAlpha = appearance.labelAlpha; drawBuildingLabel(byId.get(building.id)); context.restore(); } }
  }

  function drawBuildingBody(geometry, buildingType, fixed = false) {
    if (!geometry || !buildingType) return;
    fillAndStrokeGeometry(geometry, "rgba(0,0,0,0.31)", "transparent", 0, 1.5, 2);
    fillAndStrokeGeometry(geometry, buildingType.color, "#202020", Math.max(0.5, 3.5 * state.zoom));
    if (fixed) { context.save(); context.setLineDash([Math.max(3, 5 * state.zoom), Math.max(2, 3 * state.zoom)]); strokeGeometry(geometry, "rgba(255,255,255,.9)", Math.max(1.5, 2 * state.zoom)); context.restore(); }
    strokeGeometry(geometry, "rgba(255,255,255,0.59)", Math.max(0.5, state.zoom));
  }

  function fillAndStrokeGeometry(geometry, fill, stroke, lineWidth, offsetSceneX = 0, offsetSceneY = 0) {
    traceGeometry(geometry, offsetSceneX, offsetSceneY);
    context.fillStyle = fill; context.fill();
    if (stroke !== "transparent" && lineWidth > 0) { context.strokeStyle = stroke; context.lineWidth = lineWidth; context.lineJoin = "round"; context.stroke(); }
  }

  function strokeGeometry(geometry, stroke, lineWidth) {
    traceGeometry(geometry); context.strokeStyle = stroke; context.lineWidth = lineWidth; context.lineJoin = "round"; context.stroke();
  }

  function traceGeometry(geometry, offsetSceneX = 0, offsetSceneY = 0) {
    context.beginPath();
    geometry.polygon.forEach(([sceneX, sceneY], index) => {
      const [x, y] = sceneToScreen(sceneX + offsetSceneX, sceneY + offsetSceneY, state);
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.closePath();
  }

  function drawBuildingLabel(geometry) {
    const layout = chooseBuildingLabelLayout({ building: geometry.building, bounds: geometry.bounds, zoom: state.zoom, measureText: measureCanvasText });
    if (layout.mode === "hidden") return;
    const [x, y] = sceneToScreen(...labelSceneCenter(geometry), state);
    const lines = layout.text.split("\n"), lineHeight = layout.fontPixelSize * 1.2;
    context.save(); context.font = `700 ${layout.fontPixelSize}px sans-serif`; context.textAlign = "center"; context.textBaseline = "middle";
    context.fillStyle = "#ffffff"; context.shadowColor = "rgba(0,0,0,0.82)"; context.shadowBlur = 2; context.shadowOffsetX = 0.8; context.shadowOffsetY = 0.8;
    lines.forEach((line, index) => context.fillText(line, x, y + (index - (lines.length - 1) / 2) * lineHeight)); context.restore();
  }

  function measureCanvasText(text, fontSize) {
    context.save(); context.font = `700 ${fontSize}px sans-serif`;
    const lines = text.split("\n"), width = Math.max(...lines.map(line => context.measureText(line).width));
    context.restore(); return { width, height: lines.length * fontSize * 1.2 };
  }

  function resize() {
    const rect = host.getBoundingClientRect();
    const dpr = Math.max(1, globalThis.devicePixelRatio || 1);
    state = resizeViewport(state, rect.width, rect.height, dpr);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    onViewportChange({ ...state });
    invalidate();
  }

  function syncNavigation() {
    const [centerX, centerY] = viewportCenterGrid(state);
    const result = engine.setView({ centerX, centerY, zoom: state.zoom });
    editorHost?.setZoom?.(state.zoom);
    if (result.persisted) editorHost?.markDirty?.();
    onViewportChange({ ...state });
    invalidate();
  }

  function updateCursor(event) {
    const rect = canvas.getBoundingClientRect();
    const [sceneX, sceneY] = screenToScene(event.clientX - rect.left, event.clientY - rect.top, state);
    const cell = sceneToGrid(sceneX, sceneY);
    if (cell) { editorHost?.setCursor?.(...cell); controller?.updatePreview(...cell); rangeController?.hover(cell); } else editorHost?.clearCursor?.();
    if (!panning && event.pointerType !== "touch") updateHoverAt(sceneX, sceneY);
  }

  function updateHoverAt(sceneX, sceneY) {
    const building = hitTestBuildings(sceneX, sceneY, filterHitGeometries(visibleBuildingGeometries()), interaction.selectedBuildingId);
    if (interaction.hover(building?.id)) invalidate();
    canvas.title = building ? buildingTooltip(building) : "";
  }

  function selectAt(event) {
    const rect = canvas.getBoundingClientRect();
    const [sceneX, sceneY] = screenToScene(event.clientX - rect.left, event.clientY - rect.top, state);
    const cell = sceneToGrid(sceneX, sceneY);
    const mode = controller?.getState().mode ?? "select";
    if (mode !== "select" && cell) {
      const name = mode === "place" ? requestBuildingName() : "";
      if (mode === "place" && name === null) return;
      let changed;
      try { changed = controller.commitAt(...cell, { name }); } catch (error) { globalThis.alert?.(error.message); return; }
      if (changed) { refreshDocument(); interaction.select(changed.id); onSelectionChange(changed); invalidate(); }
      return;
    }
    if (rangeController?.getState().mode === "rangeCreate" && cell) { rangeController.click(cell); onRangeStateChange(rangeController.getState()); invalidate(); return; }
    const building = hitTestBuildings(sceneX, sceneY, filterHitGeometries(visibleBuildingGeometries()), interaction.selectedBuildingId);
    controller?.selectBuilding(building && (!building.fixed || editableFixed) ? building.id : null);
    if (!building && cell && rangeController) { const selectedRange = rangeController.selectAtCell(cell); onRangeSelectionChange(selectedRange); }
    else if (building && rangeController) { rangeController.selectAtCell([-1, -1]); onRangeSelectionChange(null); }
    if (interaction.select(building?.id)) { onSelectionChange(building ?? null); invalidate(); }
  }

  function filterHitGeometries(items) { return buildingFilter ? items.filter(item => item.building.fixed || buildingFilter.appearance(item.building, interaction.selectedBuildingId).hitTest) : items; }

  function onWheel(event) {
    if (!event.deltaY) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const requested = event.deltaY < 0 ? state.zoom * ZOOM_STEP : state.zoom / ZOOM_STEP;
    state = zoomViewportAt(state, requested, event.clientX - rect.left, event.clientY - rect.top);
    syncNavigation(); updateCursor(event);
  }

  function onPointerDown(event) {
    const touch = event.pointerType === "touch";
    const mousePan = event.button === 1 || (event.button === 0 && spacePressed);
    if (!touch && !mousePan && event.button === 0 && bulkDeleteController?.getState().mode === "bulkDelete") {
      const cell = eventCell(event); if (cell) { bulkDeleteController.begin(cell); bulkDrawing = event.pointerId; onBulkDeleteStateChange(bulkDeleteController.getState()); canvas.setPointerCapture(event.pointerId); event.preventDefault(); invalidate(); } return;
    }
    if (!touch && !mousePan && event.button === 0 && rangeEraseController?.getState().mode === "rangeErase") {
      const cell = eventCell(event); if (cell) { rangeEraseController.begin(cell); eraseDrawing = event.pointerId; onRangeEraseStateChange(rangeEraseController.getState()); canvas.setPointerCapture(event.pointerId); event.preventDefault(); invalidate(); } return;
    }
    if (!touch && !mousePan && event.button === 0 && rangeController?.getState().mode === "rangeCreate") {
      const cell = eventCell(event); if (cell) { rangeController.click(cell); rangeDrawing = event.pointerId; onRangeStateChange(rangeController.getState()); canvas.setPointerCapture(event.pointerId); event.preventDefault(); return; }
    }
    if (event.button === 0 || touch) clickCandidate = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, selectionAllowed: touch || !spacePressed };
    if (!touch && !mousePan) { canvas.focus({ preventScroll: true }); canvas.setPointerCapture(event.pointerId); return; }
    event.preventDefault(); canvas.focus({ preventScroll: true }); canvas.setPointerCapture(event.pointerId);
    panning = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.style.cursor = "grabbing";
  }

  function onPointerMove(event) {
    if (bulkDrawing === event.pointerId) { const cell = eventCell(event); if (cell) bulkDeleteController.update(cell); onBulkDeleteStateChange(bulkDeleteController.getState()); invalidate(); return; }
    if (eraseDrawing === event.pointerId) { const cell = eventCell(event); if (cell) rangeEraseController.update(cell); onRangeEraseStateChange(rangeEraseController.getState()); invalidate(); return; }
    if (rangeDrawing === event.pointerId) { const cell = eventCell(event); if (cell) rangeController.hover(cell); invalidate(); return; }
    if (clickCandidate?.pointerId === event.pointerId && Math.hypot(event.clientX - clickCandidate.x, event.clientY - clickCandidate.y) >= 6) clickCandidate.moved = true;
    if (panning?.pointerId === event.pointerId) {
      state = panViewport(state, event.clientX - panning.x, event.clientY - panning.y);
      panning.x = event.clientX; panning.y = event.clientY;
      syncNavigation();
    }
    updateCursor(event);
  }

  function endPan(event) {
    if (bulkDrawing === event.pointerId) {
      const cell = eventCell(event); if (cell) bulkDeleteController.update(cell);
      const summary = bulkDeleteController.summary(); bulkDrawing = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (!summary.deletable.length) { notifyBulkDeleteEmpty(summary.locked.length); bulkDeleteController.cancel(); }
      else if (confirmBulkDelete({ deleteCount: summary.deletable.length, lockedCount: summary.locked.length })) { bulkDeleteController.commit(); refreshDocument(); controller?.normalizeSelection(); interaction.select(controller?.getState().selectedBuildingId ?? null); onSelectionChange(controller?.getSelectedBuilding() ?? null); }
      else bulkDeleteController.cancel();
      onBulkDeleteStateChange(bulkDeleteController.getState()); invalidate(); return;
    }
    if (eraseDrawing === event.pointerId) {
      const cell = eventCell(event); if (cell) rangeEraseController.update(cell);
      const summary = rangeEraseController.summary(); eraseDrawing = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (!summary.removedCount) { notifyRangeEraseEmpty(summary.lockedCount); rangeEraseController.cancel(); }
      else if (confirmRangeErase({ cellCount: summary.removedCount, lockedCount: summary.lockedCount })) { rangeEraseController.commit(); refreshDocument(); rangeController?.normalizeSelection(); onRangeSelectionChange(rangeController?.getSelectedRange() ?? null); }
      else rangeEraseController.cancel();
      onRangeEraseStateChange(rangeEraseController.getState()); invalidate(); return;
    }
    if (rangeDrawing === event.pointerId) { const cell = eventCell(event); if (cell) rangeController.click(cell); rangeDrawing = null; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); onRangeStateChange(rangeController.getState()); invalidate(); return; }
    const wasPanning = panning?.pointerId === event.pointerId;
    const candidate = clickCandidate?.pointerId === event.pointerId ? clickCandidate : null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (wasPanning) panning = null;
    clickCandidate = null; canvas.style.cursor = spacePressed ? "grab" : "default";
    if (isTapSelectionCandidate(candidate)) selectAt(event);
    updateCursor(event);
  }

  function cancelPointer(event) {
    if (bulkDrawing === event.pointerId) { bulkDrawing = null; bulkDeleteController?.cancel(); onBulkDeleteStateChange(bulkDeleteController?.getState()); }
    if (eraseDrawing === event.pointerId) { eraseDrawing = null; rangeEraseController?.cancel(); onRangeEraseStateChange(rangeEraseController?.getState()); }
    if (rangeDrawing === event.pointerId) { rangeDrawing = null; rangeController?.cancel(); onRangeStateChange(rangeController?.getState()); }
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (panning?.pointerId === event.pointerId) panning = null;
    if (clickCandidate?.pointerId === event.pointerId) clickCandidate = null;
    canvas.style.cursor = spacePressed ? "grab" : "default";
  }

  function eventCell(event) { const rect = canvas.getBoundingClientRect(), scene = screenToScene(event.clientX - rect.left, event.clientY - rect.top, state); return sceneToGrid(...scene); }

  function onKeyDown(event) {
    if (isFormControl(event.target)) return;
    if (event.code === "Space") { spacePressed = true; canvas.style.cursor = panning ? "grabbing" : "grab"; event.preventDefault(); }
    if (event.key === "Escape") { controller?.cancelMode(); rangeController?.cancel(); bulkDeleteController?.cancel(); rangeEraseController?.cancel(); onBulkDeleteStateChange(bulkDeleteController?.getState()); onRangeEraseStateChange(rangeEraseController?.getState()); invalidate(); }
    if (event.key === "Delete" && controller) { try { const removed = controller.deleteSelected(); if (removed) { refreshDocument(); interaction.clearSelection(); onSelectionChange(null); invalidate(); } else if (rangeController?.deleteSelected()) { refreshDocument(); onRangeSelectionChange(null); invalidate(); } } catch {} }
  }
  function onKeyUp(event) { if (event.code === "Space") { spacePressed = false; if (!panning) canvas.style.cursor = "default"; } }
  function onBlur() { spacePressed = false; panning = null; clickCandidate = null; canvas.style.cursor = "default"; }
  function onContextMenu(event) { if (panning) event.preventDefault(); }

  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", endPan);
  canvas.addEventListener("pointercancel", cancelPointer);
  canvas.addEventListener("pointerleave", event => { if (!panning) { editorHost?.clearCursor?.(); if (interaction.clearHover()) invalidate(); canvas.title = ""; } });
  canvas.addEventListener("auxclick", event => { if (event.button === 1) event.preventDefault(); });
  canvas.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);
  const themeObserver = new MutationObserver(invalidate); themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
  const media = matchMedia("(prefers-color-scheme: dark)"); media.addEventListener?.("change", invalidate);
  resize(); editorHost?.setZoom?.(state.zoom);

  return {
    canvas,
    getState: () => ({ ...state }),
    centerAtGrid(x, y) { const [sceneCenterX, sceneCenterY] = gridToScene(...nearestValidGridCoordinate(x, y)); state = { ...state, sceneCenterX, sceneCenterY }; syncNavigation(); return { ...state }; },
    getSelectedBuildingId: () => interaction.selectedBuildingId,
    getHoveredBuildingId: () => interaction.hoveredBuildingId,
    getSelectedBuilding: () => [...engine.getDocument().fixedBuildings, ...engine.getDocument().buildings].find(building => building.id === interaction.selectedBuildingId) ?? null,
    selectBuilding(id) { refreshDocument(); const building = [...mapDocument.fixedBuildings, ...mapDocument.buildings].find(item => item.id === id) ?? null; controller?.selectBuilding(building && (!building.fixed || editableFixed) ? building.id : null); if (interaction.select(building?.id)) { onSelectionChange(building); invalidate(); } return building; },
    clearSelection() { if (interaction.clearSelection()) { onSelectionChange(null); invalidate(); } },
    refresh() { refreshDocument(); controller?.normalizeSelection(); rangeController?.normalizeSelection(); const requestedId = controller?.getState().selectedBuildingId ?? interaction.selectedBuildingId; const candidates = editableFixed ? [...mapDocument.fixedBuildings, ...mapDocument.buildings] : mapDocument.buildings; const selected = candidates.find(item => item.id === requestedId) ?? null; interaction.select(selected?.id); onSelectionChange(selected); onRangeSelectionChange(rangeController?.getSelectedRange() ?? null); invalidate(); },
    invalidate,
    destroy() {
      destroyed = true; if (frame) cancelAnimationFrame(frame);
      resizeObserver.disconnect(); themeObserver.disconnect(); media.removeEventListener?.("change", invalidate);
      window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); window.removeEventListener("blur", onBlur);
      canvas.remove(); editorHost?.clearCursor?.();
    },
  };
}

function buildingTooltip(building) {
  return `${building.name}\n${building.width}×${building.height} · (${building.x}, ${building.y})${building.affiliation ? ` · ${building.affiliation}` : ""}`;
}

function isFormControl(target) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, button, [contenteditable='true']"));
}

function withAlpha(hex, alpha) { const value = hex.replace("#", ""); const full = value.length === 3 ? [...value].map(char => char + char).join("") : value; return `rgba(${parseInt(full.slice(0,2),16)},${parseInt(full.slice(2,4),16)},${parseInt(full.slice(4,6),16)},${alpha})`; }
