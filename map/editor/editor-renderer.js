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

export function createMapRenderer({ host, engine, controller = null, rangeController = null, bulkDeleteController = null, rangeEraseController = null, buildingFilter = null, editableFixed = false, requestBuildingName = () => null, requestBuildingAffiliation = () => null, resolveBuildingName = () => null, notifyInvalidPlacement = () => {}, notifyRangePresetError = error => globalThis.alert?.(error?.message ?? String(error)), confirmBulkDelete = () => true, notifyBulkDeleteEmpty = () => {}, confirmRangeErase = () => true, notifyRangeEraseEmpty = () => {}, editorHost = globalThis.S967EditorHost, devicePixelRatioOverride = null, onSelectionChange = () => {}, onRangeSelectionChange = () => {}, onRangeStateChange = () => {}, onBulkDeleteStateChange = () => {}, onRangeEraseStateChange = () => {}, onViewportChange = () => {}, onDocumentChange = () => {} }) {
  if (!(host instanceof HTMLElement)) throw new TypeError("A map canvas host is required.");
  const documentView = engine.getView();
  let state = createViewportState(documentView);
  let frame = 0, destroyed = false, panning = null, clickCandidate = null, rangeDrawing = null, bulkDrawing = null, eraseDrawing = null, spacePressed = false;
  let highlightedBuildingIds = new Set();
  let duplicateHighlightedBuildingIds = new Set();
  let exportingImage = false;

  let imageExportSelection = null;
  let imageExportDrawing = null;

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
  canvas.style.touchAction = "none";
  canvas.className = "pns-map-canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "PNS map viewport");
  Object.assign(canvas.style, { width: "100%", height: "100%", display: "block", cursor: "default" });
  host.append(canvas);
  let context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas 2D is unavailable.");

  function invalidate() {
    if (destroyed || frame) return;
    frame = requestAnimationFrame(() => { frame = 0; draw(); });
  }

  function normalizedGridSelection(
    startCell,
    endCell
  ) {
    if (
      !startCell ||
      !endCell
    ) {
      return null;
    }

    return {
      minX:
        Math.min(
          startCell[0],
          endCell[0]
        ),
      maxX:
        Math.max(
          startCell[0],
          endCell[0]
        ),
      minY:
        Math.min(
          startCell[1],
          endCell[1]
        ),
      maxY:
        Math.max(
          startCell[1],
          endCell[1]
        ),
    };
  }

  function gridSelectionSceneBounds(
    selection
  ) {
    if (!selection) {
      return null;
    }

    /*
      Use the real diamond geometry of the four extreme cells.
      The resulting axis-aligned scene rectangle is guaranteed to
      contain the complete selected map range.
    */
    const cornerCells = [
      [
        selection.minX,
        selection.minY,
      ],
      [
        selection.maxX,
        selection.minY,
      ],
      [
        selection.maxX,
        selection.maxY,
      ],
      [
        selection.minX,
        selection.maxY,
      ],
    ];

    const vertices =
      cornerCells.flatMap(
        cell =>
          diamondVertices(
            ...cell
          )
      );

    return {
      left:
        Math.min(
          ...vertices.map(
            point =>
              point[0]
          )
        ),
      right:
        Math.max(
          ...vertices.map(
            point =>
              point[0]
          )
        ),
      top:
        Math.min(
          ...vertices.map(
            point =>
              point[1]
          )
        ),
      bottom:
        Math.max(
          ...vertices.map(
            point =>
              point[1]
          )
        ),
    };
  }

  function convexHull(
    points
  ) {
    const unique =
      [
        ...new Map(
          points.map(
            point => [
              `${point[0]},${point[1]}`,
              point,
            ]
          )
        ).values(),
      ];

    if (
      unique.length <= 2
    ) {
      return unique;
    }

    const sorted =
      unique.sort(
        (a, b) =>
          a[0] - b[0] ||
          a[1] - b[1]
      );

    const cross =
      (o, a, b) =>
        (
          a[0] - o[0]
        ) *
          (
            b[1] - o[1]
          ) -
        (
          a[1] - o[1]
        ) *
          (
            b[0] - o[0]
          );

    const lower = [];

    for (
      const point
      of sorted
    ) {
      while (
        lower.length >= 2 &&
        cross(
          lower[
            lower.length - 2
          ],
          lower[
            lower.length - 1
          ],
          point
        ) <= 0
      ) {
        lower.pop();
      }

      lower.push(
        point
      );
    }

    const upper = [];

    for (
      let index =
        sorted.length - 1;
      index >= 0;
      index -= 1
    ) {
      const point =
        sorted[index];

      while (
        upper.length >= 2 &&
        cross(
          upper[
            upper.length - 2
          ],
          upper[
            upper.length - 1
          ],
          point
        ) <= 0
      ) {
        upper.pop();
      }

      upper.push(
        point
      );
    }

    lower.pop();
    upper.pop();

    return [
      ...lower,
      ...upper,
    ];
  }

  function gridSelectionSceneHull(
    selection
  ) {
    if (!selection) {
      return [];
    }

    const cornerCells = [
      [
        selection.minX,
        selection.minY,
      ],
      [
        selection.maxX,
        selection.minY,
      ],
      [
        selection.maxX,
        selection.maxY,
      ],
      [
        selection.minX,
        selection.maxY,
      ],
    ];

    return convexHull(
      cornerCells.flatMap(
        cell =>
          diamondVertices(
            ...cell
          )
      )
    );
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
    drawImageExportSelectionPreview();
  }

  function drawRanges() {
    const bounds = visibleGridBounds(state, 1), selectedId = rangeController?.getState().selectedRangeId;
    const orderedRanges = [
      ...mapDocument.ranges.filter(
        range =>
          range.presetId !==
            "mountain"
      ),
      ...mapDocument.ranges.filter(
        range =>
          range.presetId ===
            "mountain"
      ),
    ];

    /*
      Draw each map cell only once.

      Previously, same-affiliation linked territories could geometrically
      overlap and the semi-transparent fill was painted repeatedly, making
      the overlap visibly darker. Mountains could also add another layer.

      The final visible owner for a cell is the last eligible range in
      orderedRanges. Mountains are intentionally ordered last so their
      obstacle appearance remains visible, but the underlying territory is
      not alpha-stacked underneath them.
    */
    const visibleOwnerByCell =
      new Map();

    for (
      const range
      of orderedRanges
    ) {
      if (
        range.linked &&
        range.active === false
      ) {
        continue;
      }

      for (
        const cell
        of visibleRangeCells(
          range,
          bounds
        )
      ) {
        visibleOwnerByCell.set(
          cell.join(","),
          {
            range,
            cell,
          }
        );
      }
    }

    for (
      const {
        range,
        cell,
      }
      of visibleOwnerByCell.values()
    ) {
      traceCell(cell);
      context.fillStyle =
        withAlpha(
          range.color,
          0.29
        );
      context.fill();

      context.strokeStyle =
        range.color;
      context.lineWidth =
        Math.max(
          1,
          (
            range.locked
              ? 2.4
              : 1.2
          ) *
            state.zoom
        );
      context.stroke();

      if (
        range.kind ===
          "blocked"
      ) {
        const vertices =
          diamondVertices(
            ...cell
          );
        const a =
          sceneToScreen(
            ...vertices[3],
            state
          );
        const b =
          sceneToScreen(
            ...vertices[1],
            state
          );

        context.beginPath();
        context.moveTo(...a);
        context.lineTo(...b);
        context.stroke();
      }

      if (
        !exportingImage &&
        range.id === selectedId
      ) {
        traceCell(cell);
        context.strokeStyle =
          "#7C3AED";
        context.lineWidth =
          Math.max(
            2,
            2.2 * state.zoom
          );
        context.stroke();
      }
    }
    const rangeState =
      rangeController?.getState() ??
      {};
    const preview =
      rangeState.previewCells ??
      [];

    const preset =
      rangeState.mode ===
        "rangePreset"
        ? rangeState.preset
        : null;

    for (
      const cell
      of preview
    ) {
      traceCell(cell);

      if (preset) {
        context.fillStyle =
          withAlpha(
            preset.color,
            0.38
          );
        context.fill();
        context.strokeStyle =
          preset.color;
        context.lineWidth =
          Math.max(
            1.5,
            2.2 * state.zoom
          );
        context.stroke();

        if (
          preset.kind ===
          "blocked"
        ) {
          const vertices =
            diamondVertices(
              ...cell
            );
          const a =
            sceneToScreen(
              ...vertices[3],
              state
            );
          const b =
            sceneToScreen(
              ...vertices[1],
              state
            );

          context.beginPath();
          context.moveTo(...a);
          context.lineTo(...b);
          context.strokeStyle =
            preset.color;
          context.lineWidth =
            Math.max(
              1.5,
              2 * state.zoom
            );
          context.stroke();
        }
      } else {
        context.fillStyle =
          "rgba(124,58,237,.22)";
        context.fill();
        context.strokeStyle =
          "#7C3AED";
        context.lineWidth = 2;
        context.stroke();
      }
    }
  }

  function drawFixedRanges() {
    const bounds = visibleGridBounds(state, 1), selectedId = editableFixed ? rangeController?.getState().selectedRangeId : null;
    const orderedRanges = [...mapDocument.fixedRanges].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    for (const range of orderedRanges) for (const cell of visibleRangeCells(range, bounds)) {
      traceCell(cell); context.fillStyle = withAlpha(range.color, range.kind === "blocked" ? 0.42 : 0.22); context.fill();
      context.save(); context.setLineDash([Math.max(3, 5 * state.zoom), Math.max(2, 3 * state.zoom)]); context.strokeStyle = range.kind === "blocked" ? "#b91c1c" : range.color; context.lineWidth = Math.max(1.5, 2.4 * state.zoom); context.stroke(); context.restore();
      if (range.kind === "blocked") { const vertices = diamondVertices(...cell), a = sceneToScreen(...vertices[3], state), b = sceneToScreen(...vertices[1], state); context.beginPath(); context.moveTo(...a); context.lineTo(...b); context.strokeStyle = "#b91c1c"; context.lineWidth = Math.max(1.5, 2 * state.zoom); context.stroke(); }
      if (!exportingImage && range.id === selectedId) { traceCell(cell); context.strokeStyle = "#7C3AED"; context.lineWidth = Math.max(2, 2.2 * state.zoom); context.stroke(); }
    }
  }

  function traceCell(cell) { context.beginPath(); diamondVertices(...cell).forEach((point, index) => { const screen = sceneToScreen(...point, state); index ? context.lineTo(...screen) : context.moveTo(...screen); }); context.closePath(); }

  function drawPreview() {
    if (exportingImage) return;
    const preview = controller?.getState().preview;
    if (!preview) return;
    const geometry = buildingRenderGeometry({ id: "preview", name: "", affiliation: "", locked: false, ...preview });
    const type = (editableFixed ? fixedBuildingTypes : buildingTypes).get(preview.typeId);
    const previewValid = preview.valid ?? preview.canPlace ?? false;
    context.save(); context.globalAlpha = previewValid ? 0.55 : 0.72;
    fillAndStrokeGeometry(
      geometry,
      previewValid ? (preview.color ?? type?.color ?? "#4E79A7") : "#e53935",
      previewValid ? "#ffffff" : "#8b0000",
      Math.max(1.5, 3 * state.zoom)
    );
    context.restore();
  }

  function drawBulkDeletePreview() {
    if (exportingImage) return;
    const bulkState = bulkDeleteController?.getState();
    if (!bulkState?.previewCells.length) return;
    for (const cell of bulkState.previewCells) {
      traceCell(cell); context.fillStyle = "rgba(220,60,60,.22)"; context.fill();
      context.strokeStyle = "rgb(255,100,100)"; context.lineWidth = Math.max(1.5, 2 * state.zoom); context.stroke();
    }
  }

  function drawRangeErasePreview() {
    if (exportingImage) return;
    const eraseState = rangeEraseController?.getState();
    if (!eraseState?.previewCells.length) return;
    for (const cell of eraseState.previewCells) {
      traceCell(cell); context.fillStyle = "rgba(220,60,60,.22)"; context.fill();
      context.strokeStyle = "rgb(255,100,100)"; context.lineWidth = Math.max(1.5, 2 * state.zoom); context.stroke();
    }
  }

  function drawImageExportSelectionPreview() {
    if (
      exportingImage ||
      !imageExportSelection?.active ||
      !imageExportSelection.startCell
    ) {
      return;
    }

    const endCell =
      imageExportSelection.hoverCell ??
      imageExportSelection.startCell;

    const selection =
      normalizedGridSelection(
        imageExportSelection.startCell,
        endCell
      );

    const hull =
      gridSelectionSceneHull(
        selection
      );

    if (
      hull.length < 3
    ) {
      return;
    }

    context.save();

    context.beginPath();

    hull.forEach(
      (
        point,
        index
      ) => {
        const screen =
          sceneToScreen(
            ...point,
            state
          );

        if (index === 0) {
          context.moveTo(
            ...screen
          );
        } else {
          context.lineTo(
            ...screen
          );
        }
      }
    );

    context.closePath();

    context.fillStyle =
      "rgba(124,58,237,.16)";
    context.fill();

    context.strokeStyle =
      "#7C3AED";
    context.lineWidth =
      Math.max(
        2,
        2.4 * state.zoom
      );
    context.stroke();

    context.restore();
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

      if (
        duplicateHighlightedBuildingIds.has(
          building.id
        )
      ) {
        /*
          Duplicate-name highlight:
          strong dark outer stroke + red inner stroke.
        */
        strokeGeometry(
          geometry,
          "rgba(0,0,0,0.95)",
          Math.max(
            4.5,
            9 * state.zoom
          )
        );

        strokeGeometry(
          geometry,
          "#FF2B2B",
          Math.max(
            3,
            5.5 * state.zoom
          )
        );
      } else if (
        highlightedBuildingIds.has(
          building.id
        )
      ) {
        /*
          Normal building-search highlight.
        */
        strokeGeometry(
          geometry,
          "rgba(0,0,0,0.95)",
          Math.max(
            4,
            8 * state.zoom
          )
        );

        const explicitTheme =
          document.documentElement.dataset.theme;

        const darkTheme =
          explicitTheme === "dark" ||
          (
            (
              !explicitTheme ||
              explicitTheme === "system"
            ) &&
            matchMedia(
              "(prefers-color-scheme: dark)"
            ).matches
          );

        strokeGeometry(
          geometry,
          darkTheme
            ? "#FFFFFF"
            : "#000000",
          Math.max(
            2.5,
            4.5 * state.zoom
          )
        );
      }

      if (!exportingImage) {
        if (building.id === interaction.hoveredBuildingId && building.id !== interaction.selectedBuildingId) strokeGeometry(geometry, "rgba(80, 175, 255, 0.95)", Math.max(1.5, 2 * state.zoom));
        if (building.id === interaction.selectedBuildingId) strokeGeometry(geometry, "#FFD54F", Math.max(2, 5 * state.zoom));
      }
    }
    for (const building of ordered) { const appearance = building.fixed ? { visible: true, labelAlpha: 1 } : (buildingFilter?.appearance(building, interaction.selectedBuildingId) ?? { visible: true, labelAlpha: 1 }); if (appearance.visible) { context.save(); context.globalAlpha = appearance.labelAlpha; drawBuildingLabel(byId.get(building.id)); context.restore(); } }
  }

  function drawBuildingBody(geometry, buildingType, fixed = false) {
    if (!geometry || !buildingType) return;
    const bodyColor = fixed ? (geometry.building.color ?? buildingType.color) : buildingType.color;
    fillAndStrokeGeometry(geometry, "rgba(0,0,0,0.31)", "transparent", 0, 1.5, 2);
    fillAndStrokeGeometry(geometry, bodyColor, "#202020", Math.max(0.5, 3.5 * state.zoom));
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
    const requestedDpr =
      Number(
        devicePixelRatioOverride
      );

    const dpr =
      Number.isFinite(
        requestedDpr
      ) &&
      requestedDpr > 0
        ? requestedDpr
        : Math.max(
            1,
            globalThis.devicePixelRatio ||
              1
          );
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
      const placementState =
        controller?.getState?.() ??
        {};

      const isAllianceStructure =
        mode === "place" &&
        placementState.palette?.typeId ===
          "type-01";

      let affiliation =
        placementState.palette
          ?.defaultAffiliation ??
        "";
      let name = "";

      if (isAllianceStructure) {
        affiliation =
          requestBuildingAffiliation({
            size:
              placementState.palette
                ?.size ??
              1,
          });

        if (affiliation === null) {
          return;
        }

        controller
          ?.setPlacementAffiliation?.(
            affiliation
          );
      }

      const preview =
        controller?.updatePreview(
          ...cell
        );

      if (
        mode === "place" &&
        !preview?.valid
      ) {
        notifyInvalidPlacement({
          cell: [...cell],
          preview,
        });
        return;
      }

      if (mode === "place") {
        name =
          isAllianceStructure
            ? resolveBuildingName({
                size:
                  placementState.palette
                    ?.size ??
                  1,
                affiliation,
              })
            : requestBuildingName();

        if (name === null) {
          return;
        }
      }

      let changed;

      try {
        changed =
          controller.commitAt(
            ...cell,
            {
              name,
              affiliation,
            }
          );
      } catch (error) {
        globalThis.alert?.(
          error.message
        );
        return;
      }

      if (changed) {
        refreshDocument();
        interaction.select(
          changed.id
        );
        onSelectionChange(
          changed
        );
        invalidate();
      }

      return;
    }
    if (
      rangeController?.getState().mode ===
        "rangePreset" &&
      cell
    ) {
      try {
        const result =
          rangeController.placePresetAt(
            cell
          );

        if (
          result?.complete
        ) {
          refreshDocument();
          rangeController
            ?.normalizeSelection();

          onRangeSelectionChange(
            rangeController
              ?.getSelectedRange?.() ??
              null
          );
        }
      } catch (error) {
        notifyRangePresetError(
          error
        );
      }

      onRangeStateChange(
        rangeController.getState()
      );
      invalidate();
      return;
    }

    if (rangeController?.getState().mode === "rangeCreate" && cell) { rangeController.click(cell); onRangeStateChange(rangeController.getState()); invalidate(); return; }
    const building =
      hitTestBuildings(
        sceneX,
        sceneY,
        filterHitGeometries(
          visibleBuildingGeometries()
        ),
        interaction.selectedBuildingId
      );

    controller?.selectBuilding(
      building &&
      (
        !building.fixed ||
        editableFixed
      )
        ? building.id
        : null
    );

    if (
      !building &&
      cell &&
      rangeController
    ) {
      const selectedRange =
        rangeController
          .selectAtCell(
            cell
          );

      /*
        Map click and list click now drive the exact same selected-range state.
        The panel is refreshed immediately, so the clicked range can be edited
        without first finding it in the range list.
      */
      onRangeSelectionChange(
        selectedRange
      );
      onSelectionChange(
        null
      );
    } else if (
      building &&
      rangeController
    ) {
      rangeController
        .selectAtCell(
          [-1, -1]
        );
      onRangeSelectionChange(
        null
      );
    }

    if (
      interaction.select(
        building?.id
      )
    ) {
      onSelectionChange(
        building ??
        null
      );
    }

    invalidate();
  }

  function filterHitGeometries(items) { return buildingFilter ? items.filter(item => item.building.fixed || buildingFilter.appearance(item.building, interaction.selectedBuildingId).hitTest) : items; }

  const activeTouches = new Map();
  let pinchGesture = null;

  function onWheel(event) {
    if (!event.deltaY) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const requested = event.deltaY < 0 ? state.zoom * ZOOM_STEP : state.zoom / ZOOM_STEP;
    state = zoomViewportAt(state, requested, event.clientX - rect.left, event.clientY - rect.top);
    syncNavigation(); updateCursor(event);
  }

  function touchPointFromEvent(event) {
    return {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  }

  function getTouchPair() {
    const touches = [...activeTouches.values()];
    return touches.length >= 2
      ? [touches[0], touches[1]]
      : null;
  }

  function touchDistance(a, b) {
    return Math.hypot(
      b.x - a.x,
      b.y - a.y
    );
  }

  function touchMidpoint(a, b) {
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    };
  }

  function beginPinchGesture() {
    const pair = getTouchPair();

    if (!pair) {
      pinchGesture = null;
      return;
    }

    const [a, b] = pair;
    const distance = touchDistance(a, b);

    if (!Number.isFinite(distance) || distance <= 0) {
      pinchGesture = null;
      return;
    }

    const midpoint = touchMidpoint(a, b);
    const rect = canvas.getBoundingClientRect();

    pinchGesture = {
      startDistance: distance,
      startZoom: state.zoom,
      anchorScene: screenToScene(
        midpoint.x - rect.left,
        midpoint.y - rect.top,
        state
      ),
    };

    /*
      A second finger means this is no longer a tap or a one-finger pan.
      Cancel those candidates so pinch does not accidentally select/move.
    */
    clickCandidate = null;
    panning = null;
    canvas.style.cursor = "default";
  }

  function updatePinchGesture() {
    const pair = getTouchPair();

    if (!pair || !pinchGesture) {
      return false;
    }

    const [a, b] = pair;
    const distance = touchDistance(a, b);

    if (!Number.isFinite(distance) || distance <= 0) {
      return false;
    }

    const midpoint = touchMidpoint(a, b);
    const rect = canvas.getBoundingClientRect();

    const screenX =
      midpoint.x - rect.left;

    const screenY =
      midpoint.y - rect.top;

    const requestedZoom =
      pinchGesture.startZoom *
      (distance / pinchGesture.startDistance);

    const zoom =
      clampZoom(requestedZoom);

    /*
      Keep the original scene point under the moving midpoint.
      This gives natural pinch-zoom + two-finger pan behavior.
    */
    state = {
      ...state,
      zoom,
      sceneCenterX:
        pinchGesture.anchorScene[0] -
        (screenX - state.width / 2) / zoom,
      sceneCenterY:
        pinchGesture.anchorScene[1] -
        (screenY - state.height / 2) / zoom,
    };

    syncNavigation();
    return true;
  }

  function onPointerDown(event) {
    const touch =
      event.pointerType === "touch";

    const mousePan =
      event.button === 1 ||
      (
        event.button === 0 &&
        spacePressed
      );

    if (touch) {
      activeTouches.set(
        event.pointerId,
        touchPointFromEvent(event)
      );

      canvas.setPointerCapture(
        event.pointerId
      );

      event.preventDefault();
      canvas.focus({
        preventScroll: true,
      });

      if (activeTouches.size >= 2) {
        beginPinchGesture();
        return;
      }
    }

    if (
      !touch &&
      !mousePan &&
      event.button === 0 &&
      imageExportSelection?.active
    ) {
      const cell =
        eventCell(event);

      if (cell) {
        if (
          !imageExportSelection.startCell
        ) {
          imageExportSelection.startCell =
            [...cell];

          imageExportSelection.hoverCell =
            [...cell];
        } else {
          imageExportSelection.hoverCell =
            [...cell];
        }

        imageExportDrawing =
          event.pointerId;

        canvas.setPointerCapture(
          event.pointerId
        );

        event.preventDefault();
        invalidate();
      }

      return;
    }


    if (
      !touch &&
      !mousePan &&
      event.button === 0 &&
      bulkDeleteController?.getState().mode ===
        "bulkDelete"
    ) {
      const cell =
        eventCell(event);

      if (cell) {
        bulkDeleteController.begin(cell);
        bulkDrawing =
          event.pointerId;

        onBulkDeleteStateChange(
          bulkDeleteController.getState()
        );

        canvas.setPointerCapture(
          event.pointerId
        );

        event.preventDefault();
        invalidate();
      }

      return;
    }

    if (
      !touch &&
      !mousePan &&
      event.button === 0 &&
      rangeEraseController?.getState().mode ===
        "rangeErase"
    ) {
      const cell =
        eventCell(event);

      if (cell) {
        rangeEraseController.begin(cell);
        eraseDrawing =
          event.pointerId;

        onRangeEraseStateChange(
          rangeEraseController.getState()
        );

        canvas.setPointerCapture(
          event.pointerId
        );

        event.preventDefault();
        invalidate();
      }

      return;
    }

    if (
      !touch &&
      !mousePan &&
      event.button === 0 &&
      rangeController?.getState().mode ===
        "rangePreset"
    ) {
      const cell =
        eventCell(event);

      if (cell) {
        try {
          const result =
            rangeController
              .placePresetAt(
                cell
              );

          if (
            result?.complete
          ) {
            refreshDocument();
            rangeController
              ?.normalizeSelection();

            onRangeSelectionChange(
              rangeController
                ?.getSelectedRange?.() ??
                null
            );
          }
        } catch (error) {
          notifyRangePresetError(
            error
          );
        }

        onRangeStateChange(
          rangeController.getState()
        );

        event.preventDefault();
        invalidate();
      }

      return;
    }

    if (
      !touch &&
      !mousePan &&
      event.button === 0 &&
      rangeController?.getState().mode ===
        "rangeCreate"
    ) {
      const cell =
        eventCell(event);

      if (cell) {
        const rangeState =
          rangeController.getState();

        /*
          Range는 "첫 클릭 = 시작점", "두 번째 클릭 = 끝점"이다.

          예전 코드는 pointerdown과 pointerup 양쪽에서 click()을
          호출해서 한 번의 실제 마우스 클릭을 두 번의 범위 클릭처럼
          취급할 수 있었다.

          이제 첫 번째 실제 클릭의 pointerdown에서만 시작점을 잡고,
          두 번째 실제 클릭은 pointerup에서 확정한다.
        */
        if (!rangeState.startCell) {
          try {
            rangeController.click(cell);
          } catch (error) {
            globalThis.alert?.(
              error?.message ??
              String(error)
            );
          }
        }

        rangeDrawing =
          event.pointerId;

        onRangeStateChange(
          rangeController.getState()
        );

        canvas.setPointerCapture(
          event.pointerId
        );

        event.preventDefault();
        invalidate();
        return;
      }
    }

    if (
      event.button === 0 ||
      touch
    ) {
      clickCandidate = {
        pointerId:
          event.pointerId,
        x:
          event.clientX,
        y:
          event.clientY,
        moved:
          false,
        selectionAllowed:
          touch ||
          !spacePressed,
      };
    }

    if (
      !touch &&
      !mousePan
    ) {
      canvas.focus({
        preventScroll: true,
      });

      canvas.setPointerCapture(
        event.pointerId
      );

      return;
    }

    event.preventDefault();

    canvas.focus({
      preventScroll: true,
    });

    canvas.setPointerCapture(
      event.pointerId
    );

    panning = {
      pointerId:
        event.pointerId,
      x:
        event.clientX,
      y:
        event.clientY,
    };

    canvas.style.cursor =
      "grabbing";
  }

  function onPointerMove(event) {
    if (
      event.pointerType === "touch" &&
      activeTouches.has(
        event.pointerId
      )
    ) {
      activeTouches.set(
        event.pointerId,
        touchPointFromEvent(event)
      );

      if (
        activeTouches.size >= 2 &&
        pinchGesture
      ) {
        event.preventDefault();
        updatePinchGesture();
        return;
      }
    }

    if (
      imageExportDrawing ===
        event.pointerId &&
      imageExportSelection?.active
    ) {
      const cell =
        eventCell(event);

      if (cell) {
        imageExportSelection.hoverCell =
          [...cell];
      }

      invalidate();
      return;
    }


    if (
      bulkDrawing ===
      event.pointerId
    ) {
      const cell =
        eventCell(event);

      if (cell) {
        bulkDeleteController.update(cell);
      }

      onBulkDeleteStateChange(
        bulkDeleteController.getState()
      );

      invalidate();
      return;
    }

    if (
      eraseDrawing ===
      event.pointerId
    ) {
      const cell =
        eventCell(event);

      if (cell) {
        rangeEraseController.update(cell);
      }

      onRangeEraseStateChange(
        rangeEraseController.getState()
      );

      invalidate();
      return;
    }

    if (
      rangeDrawing ===
      event.pointerId
    ) {
      const cell =
        eventCell(event);

      if (cell) {
        rangeController.hover(cell);
      }

      invalidate();
      return;
    }

    if (
      clickCandidate?.pointerId ===
        event.pointerId &&
      Math.hypot(
        event.clientX -
          clickCandidate.x,
        event.clientY -
          clickCandidate.y
      ) >= 6
    ) {
      clickCandidate.moved =
        true;
    }

    if (
      panning?.pointerId ===
      event.pointerId
    ) {
      state =
        panViewport(
          state,
          event.clientX -
            panning.x,
          event.clientY -
            panning.y
        );

      panning.x =
        event.clientX;

      panning.y =
        event.clientY;

      syncNavigation();
    }

    updateCursor(event);
  }

  function endPan(event) {
    const touch =
      event.pointerType === "touch";

    const wasPinching =
      touch &&
      pinchGesture !== null;

    if (touch) {
      activeTouches.delete(
        event.pointerId
      );

      if (
        activeTouches.size >= 2
      ) {
        beginPinchGesture();
      } else if (
        wasPinching ||
        activeTouches.size === 1
      ) {
        /*
          This pointer belonged to a multi-touch gesture.
          Do not let the remaining finger inherit the old tap/pan candidate.
        */
        pinchGesture = null;
        panning = null;
        clickCandidate = null;
      } else {
        /*
          Single-finger touch:
          keep clickCandidate until the normal pointer-up tap test below.

          The previous code cleared clickCandidate here for EVERY touch
          pointer-up, so isTapSelectionCandidate() always received null.
          Result: tapping could never place buildings, Mountain presets,
          or complete ordinary range clicks on mobile.
        */
        pinchGesture = null;
      }

      if (
        canvas.hasPointerCapture(
          event.pointerId
        )
      ) {
        canvas.releasePointerCapture(
          event.pointerId
        );
      }

      if (wasPinching) {
        canvas.style.cursor =
          spacePressed
            ? "grab"
            : "default";
        return;
      }
    }

    if (
      imageExportDrawing ===
        event.pointerId &&
      imageExportSelection?.active
    ) {
      const cell =
        eventCell(event);

      imageExportDrawing =
        null;

      if (
        canvas.hasPointerCapture(
          event.pointerId
        )
      ) {
        canvas.releasePointerCapture(
          event.pointerId
        );
      }

      if (
        cell &&
        imageExportSelection.startCell
      ) {
        imageExportSelection.hoverCell =
          [...cell];

        const sameAsStart =
          cell[0] ===
            imageExportSelection
              .startCell[0] &&
          cell[1] ===
            imageExportSelection
              .startCell[1];

        /*
          Exactly like ordinary map range creation:
          first click selects the start cell;
          second click selects the end cell.
        */
        if (!sameAsStart) {
          const selection =
            normalizedGridSelection(
              imageExportSelection
                .startCell,
              cell
            );

          const sceneBounds =
            gridSelectionSceneBounds(
              selection
            );

          const onComplete =
            imageExportSelection
              .onComplete;

          imageExportSelection =
            null;

          canvas.style.cursor =
            spacePressed
              ? "grab"
              : "default";

          invalidate();

          try {
            onComplete?.({
              ...selection,
              sceneBounds,
            });
          } catch (error) {
            console.error(
              "Image export selection callback failed.",
              error
            );
          }

          return;
        }
      }

      invalidate();
      return;
    }

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
    if (
      rangeDrawing ===
      event.pointerId
    ) {
      const cell =
        eventCell(event);

      if (cell) {
        try {
          /*
            첫 클릭의 pointerup은 시작점과 같은 셀이므로
            controller가 무시한다.
            두 번째 클릭의 pointerup은 다른 셀이므로 여기서 즉시 확정된다.
          */
          const rangeResult =
            rangeController.click(cell);

          if (
            rangeResult?.complete
          ) {
            refreshDocument();
            rangeController?.normalizeSelection();
            onRangeSelectionChange(
              rangeController?.getSelectedRange?.() ??
              null
            );
          }
        } catch (error) {
          globalThis.alert?.(
            error?.message ??
            String(error)
          );
        }
      }

      rangeDrawing = null;

      if (
        canvas.hasPointerCapture(
          event.pointerId
        )
      ) {
        canvas.releasePointerCapture(
          event.pointerId
        );
      }

      onRangeStateChange(
        rangeController.getState()
      );

      invalidate();
      return;
    }
    const wasPanning = panning?.pointerId === event.pointerId;
    const candidate = clickCandidate?.pointerId === event.pointerId ? clickCandidate : null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (wasPanning) panning = null;
    clickCandidate = null; canvas.style.cursor = spacePressed ? "grab" : "default";
    if (isTapSelectionCandidate(candidate)) selectAt(event);
    updateCursor(event);

  }

  function cancelPointer(event) {
    if (
      event.pointerType === "touch"
    ) {
      activeTouches.delete(
        event.pointerId
      );

      if (
        activeTouches.size >= 2
      ) {
        beginPinchGesture();
      } else {
        pinchGesture = null;
      }
    }

    if (imageExportDrawing === event.pointerId) {
      imageExportDrawing = null;
      if (imageExportSelection?.active) {
        imageExportSelection.hoverCell =
          imageExportSelection.startCell
            ? [...imageExportSelection.startCell]
            : null;
      }
      invalidate();
    }
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
  function onBlur() {
    spacePressed = false;
    panning = null;
    clickCandidate = null;
    pinchGesture = null;
    activeTouches.clear();
    canvas.style.cursor = "default";
  }
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
    startImageExportSelection({
      onComplete = null,
    } = {}) {
      imageExportDrawing =
        null;

      imageExportSelection = {
        active:
          true,
        startCell:
          null,
        hoverCell:
          null,
        onComplete:
          typeof onComplete ===
            "function"
            ? onComplete
            : null,
      };

      canvas.style.cursor =
        "crosshair";

      invalidate();

      return true;
    },
    cancelImageExportSelection() {
      const wasActive =
        Boolean(
          imageExportSelection?.active
        );

      imageExportDrawing =
        null;
      imageExportSelection =
        null;

      canvas.style.cursor =
        spacePressed
          ? "grab"
          : "default";

      invalidate();

      return wasActive;
    },
    getImageExportSelectionState() {
      if (!imageExportSelection) {
        return {
          active:
            false,
          startCell:
            null,
          hoverCell:
            null,
        };
      }

      return {
        active:
          Boolean(
            imageExportSelection.active
          ),
        startCell:
          imageExportSelection.startCell
            ? [
                ...imageExportSelection
                  .startCell,
              ]
            : null,
        hoverCell:
          imageExportSelection.hoverCell
            ? [
                ...imageExportSelection
                  .hoverCell,
              ]
            : null,
      };
    },
    clientToScene(clientX, clientY) {
      const rect =
        canvas.getBoundingClientRect();

      const x =
        Number(clientX) -
        rect.left;

      const y =
        Number(clientY) -
        rect.top;

      const [sceneX, sceneY] =
        screenToScene(
          x,
          y,
          state
        );

      return {
        sceneX,
        sceneY,
      };
    },
    async renderSceneRegionToBlob({
      sceneLeft,
      sceneTop,
      sceneRight,
      sceneBottom,
      zoom = 3,
      maxWidth = 4096,
      maxHeight = 4096,
      mimeType = "image/png",
    }) {
      const left =
        Number(sceneLeft);
      const top =
        Number(sceneTop);
      const right =
        Number(sceneRight);
      const bottom =
        Number(sceneBottom);
      const requestedZoom =
        clampZoom(
          Number(zoom)
        );

      if (
        !Number.isFinite(left) ||
        !Number.isFinite(top) ||
        !Number.isFinite(right) ||
        !Number.isFinite(bottom) ||
        !(right > left) ||
        !(bottom > top)
      ) {
        throw new TypeError(
          "Invalid export scene region."
        );
      }

      const width =
        Math.ceil(
          (right - left) *
          requestedZoom
        );

      const height =
        Math.ceil(
          (bottom - top) *
          requestedZoom
        );

      if (
        width < 1 ||
        height < 1
      ) {
        throw new RangeError(
          "Export region is empty."
        );
      }

      if (
        width >
          maxWidth ||
        height >
          maxHeight
      ) {
        const error =
          new RangeError(
            "EXPORT_TOO_LARGE"
          );

        error.code =
          "EXPORT_TOO_LARGE";
        error.width =
          width;
        error.height =
          height;

        throw error;
      }

      const exportCanvas =
        document.createElement(
          "canvas"
        );

      exportCanvas.width =
        width;
      exportCanvas.height =
        height;

      const exportContext =
        exportCanvas.getContext(
          "2d",
          {
            alpha: false,
          }
        );

      if (!exportContext) {
        throw new Error(
          "Canvas 2D is unavailable."
        );
      }

      const previousState =
        state;
      const previousContext =
        context;
      const previousExportingImage =
        exportingImage;

      try {
        /*
          This is the key part:
          use the SAME draw() implementation as the live map, but
          give it an export viewport whose real map zoom is 300%.
          Nothing is copied/upscaled from the visible canvas.
        */
        state = {
          ...state,
          sceneCenterX:
            (left + right) / 2,
          sceneCenterY:
            (top + bottom) / 2,
          zoom:
            requestedZoom,
          width,
          height,
          devicePixelRatio:
            1,
        };

        context =
          exportContext;
        exportingImage =
          true;

        draw();
      } finally {
        state =
          previousState;
        context =
          previousContext;
        exportingImage =
          previousExportingImage;
      }

      const blob =
        await new Promise(
          resolve =>
            exportCanvas.toBlob(
              resolve,
              mimeType
            )
        );

      if (!blob) {
        throw new Error(
          "PNG_BLOB_FAILED"
        );
      }

      return {
        blob,
        width,
        height,
        zoom:
          requestedZoom,
      };
    },
    setSceneViewport({
      sceneCenterX,
      sceneCenterY,
      zoom,
    }) {
      const nextSceneCenterX =
        Number(sceneCenterX);

      const nextSceneCenterY =
        Number(sceneCenterY);

      const nextZoom =
        Number(zoom);

      if (
        !Number.isFinite(
          nextSceneCenterX
        ) ||
        !Number.isFinite(
          nextSceneCenterY
        ) ||
        !Number.isFinite(
          nextZoom
        )
      ) {
        throw new TypeError(
          "Invalid scene viewport."
        );
      }

      state = {
        ...state,
        sceneCenterX:
          nextSceneCenterX,
        sceneCenterY:
          nextSceneCenterY,
        zoom:
          clampZoom(
            nextZoom
          ),
      };

      onViewportChange({
        ...state,
      });

      invalidate();

      return {
        ...state,
      };
    },
    centerAtGrid(x, y) { const [sceneCenterX, sceneCenterY] = gridToScene(...nearestValidGridCoordinate(x, y)); state = { ...state, sceneCenterX, sceneCenterY }; syncNavigation(); return { ...state }; },
    setZoom(requestedZoom) {
      state = zoomViewportAt(state, requestedZoom, state.width / 2, state.height / 2);
      syncNavigation();
      return { ...state };
    },
    zoomBy(factor) {
      const numericFactor = Number(factor);
      if (!Number.isFinite(numericFactor) || numericFactor <= 0) return { ...state };
      state = zoomViewportAt(state, state.zoom * numericFactor, state.width / 2, state.height / 2);
      syncNavigation();
      return { ...state };
    },
    fitToMap({ padding = 24 } = {}) {
      const safePadding = Math.max(0, Number(padding) || 0);
      const [minSceneX, minSceneY] = gridToScene(MAP_MIN_X, MAP_MIN_Y);
      const [maxSceneX, maxSceneY] = gridToScene(MAP_MAX_X, MAP_MAX_Y);
      const mapLeft = minSceneX - DEFAULT_TILE_WIDTH / 2;
      const mapRight = maxSceneX + DEFAULT_TILE_WIDTH / 2;
      const mapTop = minSceneY - DEFAULT_TILE_HEIGHT / 2;
      const mapBottom = maxSceneY + DEFAULT_TILE_HEIGHT / 2;
      const availableWidth = Math.max(1, state.width - safePadding * 2);
      const availableHeight = Math.max(1, state.height - safePadding * 2);
      const requestedZoom = Math.min(
        availableWidth / Math.max(1, mapRight - mapLeft),
        availableHeight / Math.max(1, mapBottom - mapTop),
      );
      state = {
        ...state,
        sceneCenterX: (mapLeft + mapRight) / 2,
        sceneCenterY: (mapTop + mapBottom) / 2,
        zoom: clampZoom(requestedZoom),
      };
      syncNavigation();
      return { ...state };
    },
    getSelectedBuildingId: () => interaction.selectedBuildingId,
    getHoveredBuildingId: () => interaction.hoveredBuildingId,
    getHighlightedBuildingIds: () => new Set(highlightedBuildingIds),
    setHighlightedBuildingIds(ids = []) {
      highlightedBuildingIds =
        new Set(
          ids ?? []
        );
      invalidate();
      return new Set(
        highlightedBuildingIds
      );
    },
    getDuplicateHighlightedBuildingIds: () =>
      new Set(
        duplicateHighlightedBuildingIds
      ),
    setDuplicateHighlightedBuildingIds(ids = []) {
      duplicateHighlightedBuildingIds =
        new Set(
          ids ?? []
        );
      invalidate();
      return new Set(
        duplicateHighlightedBuildingIds
      );
    },
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
