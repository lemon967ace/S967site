import PNSMapEngine from "../editor/editor-engine.js";
import { createMapRenderer, ZOOM_STEP } from "../editor/editor-renderer.js";
import { createHistory, editorShortcutAction } from "../editor/editor-history.js";
import { createMinimap } from "../editor/editor-minimap.js";
import { validateColor } from "../editor/editor-model.js";
import { readIsomapFile } from "../editor/editor-file.js";
import { convertDocumentToTemplate } from "../editor/editor-template.js";
import { createFixedBuildingController } from "../editor/editor-fixed-building-controller.js";
import { createFixedRangeController } from "../editor/editor-fixed-range-controller.js";
import { createFixedBulkDeleteController } from "../editor/editor-fixed-bulk-delete.js";
import { createFixedRangeEraseController } from "../editor/editor-fixed-range-erase.js";
import { createTemplateAdminClient, validateTemplateNames } from "./template-editor-server.js";

const ADMIN_SESSION_URL =
  "https://dpmjwsnqkuzetyvfcmfr.supabase.co/functions/v1/admin-session";

const $ = id => document.getElementById(id);

let renderer = null;
let minimap = null;
let history = null;
let buildingController = null;
let rangeController = null;
let bulkDeleteController = null;
let rangeEraseController = null;
let server = null;
let dirty = false;
let serverBusy = false;

const editorHost = {
  setCursor(x, y) {
    $("cursorStatus").textContent = `X: ${x} · Y: ${y}`;
  },
  clearCursor() {
    $("cursorStatus").textContent = "X: — · Y: —";
  },
  setZoom(zoom) {
    const percent = Math.round(zoom * 100);
    $("zoomStatus").textContent = `${percent}%`;
    if (document.activeElement !== $("zoomPercentInput")) {
      $("zoomPercentInput").value = String(percent);
    }
  },
  markDirty() {
    setDirty(true);
  },
};

await start();

async function start() {
  setOverlay("관리자 세션 확인 중…", "");

  if (!globalThis.S967AdminAuth?.getToken?.()) {
    return setOverlay(
      "관리자 로그인이 필요합니다.",
      "관리자 페이지에서 로그인한 뒤 다시 열어 주세요.",
      true,
    );
  }

  const valid = await globalThis.S967AdminAuth.validate({ url: ADMIN_SESSION_URL });
  if (!valid) {
    return setOverlay(
      "관리자 세션을 확인할 수 없습니다.",
      "다시 로그인해 주세요.",
      true,
    );
  }

  try {
    bootEditor();
    hideOverlay();
    await refreshServerList();
  } catch (error) {
    console.error("Template editor boot failed:", error);
    setOverlay("고정맵 제작기를 시작하지 못했습니다.", error?.message || String(error), true);
  }
}

function bootEditor() {
  server = createTemplateAdminClient();
  PNSMapEngine.createTemplateDocument();

  history = createHistory({
    onChange: () => updateUi(false),
  });

  const onDirty = value => setDirty(value);
  const onControllerChange = () => updateUi(true);

  buildingController = createFixedBuildingController({
    engine: PNSMapEngine,
    history,
    onChange: onControllerChange,
    onDirty,
  });

  rangeController = createFixedRangeController({
    engine: PNSMapEngine,
    history,
    buildingController,
    onChange: onControllerChange,
    onDirty,
  });

  bulkDeleteController = createFixedBulkDeleteController({
    engine: PNSMapEngine,
    history,
    buildingController,
    rangeController,
    onChange: onControllerChange,
    onDirty,
  });

  rangeEraseController = createFixedRangeEraseController({
    engine: PNSMapEngine,
    history,
    buildingController,
    rangeController,
    bulkDeleteController,
    onChange: onControllerChange,
    onDirty,
  });

  buildingController.setRangeController(rangeController);
  buildingController.addAreaPeer(bulkDeleteController);
  buildingController.addAreaPeer(rangeEraseController);
  rangeController.addAreaPeer(bulkDeleteController);
  rangeController.addAreaPeer(rangeEraseController);
  bulkDeleteController.setAreaPeer(rangeEraseController);

  history.clear({ saved: true });

  renderer = createMapRenderer({
    host: $("mapCanvasHost"),
    engine: PNSMapEngine,
    controller: buildingController,
    rangeController,
    bulkDeleteController,
    rangeEraseController,
    editableFixed: true,
    requestBuildingName: () => {
      const value = prompt("고정 건물 이름을 입력하세요.", "");
      if (value === null) return null;
      const name = value.trim();
      if (!name) {
        alert("건물 이름은 비워 둘 수 없습니다.");
        return null;
      }
      return name;
    },
    confirmBulkDelete: ({ deleteCount }) =>
      confirm(`선택한 영역의 고정 건물 ${deleteCount}개를 삭제할까요?`),
    notifyBulkDeleteEmpty: () => alert("삭제할 고정 건물이 없습니다."),
    confirmRangeErase: ({ cellCount }) =>
      confirm(`고정 범위 셀 ${cellCount}개를 삭제할까요?`),
    notifyRangeEraseEmpty: () => alert("삭제할 고정 범위 셀이 없습니다."),
    editorHost,
    onSelectionChange: () => renderSelection(),
    onRangeSelectionChange: () => renderSelection(),
    onRangeStateChange: () => updateUi(false),
    onBulkDeleteStateChange: () => updateUi(false),
    onRangeEraseStateChange: () => updateUi(false),
    onViewportChange: state => minimap?.setViewport(state),
    onDocumentChange: doc => minimap?.setDocument(doc),
  });

  minimap = createMinimap({
    host: $("minimapHost"),
    renderer,
    getDocument: () => PNSMapEngine.getDocument(),
  });

  bindUi();
  setDirty(false);
  updateUi(true);
  $("documentStatus").textContent = "준비됨";
}

function bindUi() {
  $("newTemplateButton").addEventListener("click", () => {
    if (!confirmReplaceCurrent()) return;
    server.clearLink();
    replaceTemplate(null, { saved: false });
  });

  $("openTemplateButton").addEventListener("click", () => $("templateFileInput").click());
  $("importMapButton").addEventListener("click", () => $("mapFileInput").click());

  $("templateFileInput").addEventListener("change", async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !confirmReplaceCurrent()) return;
    try {
      const raw = JSON.parse(await file.text());
      server.clearLink();
      replaceTemplate(raw, { saved: true });
      $("documentStatus").textContent = `열기 완료 · ${file.name}`;
    } catch (error) {
      console.error(error);
      alert(`.isotemplate 열기 실패: ${error.message}`);
    }
  });

  $("mapFileInput").addEventListener("change", async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !confirmReplaceCurrent()) return;
    try {
      const documentData = await readIsomapFile(file);
      const template = convertDocumentToTemplate(documentData);
      server.clearLink();
      replaceTemplate(template, { saved: false });
      $("documentStatus").textContent = `가져오기 완료 · ${file.name}`;
    } catch (error) {
      console.error(error);
      alert(`.isomap 가져오기 실패: ${error.message}`);
    }
  });

  $("exportTemplateButton").addEventListener("click", exportTemplateFile);

  $("refreshServerButton").addEventListener("click", refreshServerList);
  $("loadServerButton").addEventListener("click", loadSelectedServerTemplate);
  $("registerServerButton").addEventListener("click", () => $("registerDialog").showModal());
  $("cancelRegisterButton").addEventListener("click", () => $("registerDialog").close());
  $("registerForm").addEventListener("submit", registerServerTemplate);
  $("replaceServerButton").addEventListener("click", replaceServerTemplate);

  $("selectToolButton").addEventListener("click", selectTool);
  $("moveToolButton").addEventListener("click", () => {
    try {
      rangeController.cancel();
      bulkDeleteController.cancel();
      rangeEraseController.cancel();
      buildingController.startMove();
    } catch (error) {
      alert(error.message);
    }
  });
  $("bulkDeleteToolButton").addEventListener("click", () => bulkDeleteController.start());
  $("rangeEraseToolButton").addEventListener("click", () => rangeEraseController.start());

  $("undoButton").addEventListener("click", () => buildingController.undo());
  $("redoButton").addEventListener("click", () => buildingController.redo());

  $("zoomOutButton").addEventListener("click", () => renderer.zoomBy(1 / ZOOM_STEP));
  $("zoomInButton").addEventListener("click", () => renderer.zoomBy(ZOOM_STEP));
  $("fitMapButton").addEventListener("click", () => renderer.fitToMap());
  $("zoomPercentInput").addEventListener("change", applyZoomInput);
  $("zoomPercentInput").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyZoomInput();
      event.currentTarget.blur();
    }
  });

  $("addTypeButton").addEventListener("click", addFixedType);
  $("newRangeButton").addEventListener("click", startFixedRange);
  $("confirmRangeButton").addEventListener("click", () => {
    try {
      const result = rangeController.commit();
      if (!result) alert("먼저 지도에서 범위의 시작점과 끝점을 지정하세요.");
    } catch (error) {
      alert(error.message);
    }
  });

  addEventListener("keydown", event => {
    const isFormControl = Boolean(
      event.target?.closest?.(
        "input, textarea, select, button, [contenteditable='true']"
      )
    );

    const action = editorShortcutAction({
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      isFormControl,
    });

    if (action) {
      event.preventDefault();
      buildingController[action]();
      return;
    }

    if (
      !isFormControl &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const key = event.key.toLowerCase();

      // S = Select
      if (key === "s") {
        event.preventDefault();
        selectTool();
        return;
      }

      // M = Move selected fixed building
      if (key === "m") {
        event.preventDefault();

        try {
          rangeController.cancel();
          bulkDeleteController.cancel();
          rangeEraseController.cancel();
          buildingController.startMove();
          renderer.invalidate();
          updateUi(false);
        } catch (error) {
          alert(error.message);
        }
        return;
      }
    }

    if (event.key === "Escape") {
      selectTool();
      return;
    }

    if (
      event.key === "Delete" &&
      !isFormControl
    ) {
      const building =
        buildingController.getSelectedBuilding();
      const range =
        rangeController.getSelectedRange();

      if (
        building &&
        confirm(
          `고정 건물 '${building.name}'을 삭제할까요?`
        )
      ) {
        buildingController.deleteSelected();
      } else if (
        range &&
        confirm("선택한 고정 범위를 삭제할까요?")
      ) {
        rangeController.deleteSelected();
      }
    }
  });

  addEventListener("beforeunload", event => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

function selectTool() {
  buildingController.cancelMode();
  rangeController.cancel();
  bulkDeleteController.cancel();
  rangeEraseController.cancel();
  updateUi(false);
}

function applyZoomInput() {
  const percent = Number($("zoomPercentInput").value);
  if (!Number.isFinite(percent) || percent < 1 || percent > 400) {
    alert("배율은 1~400%로 입력하세요.");
    editorHost.setZoom(renderer.getState().zoom);
    return;
  }
  renderer.setZoom(percent / 100);
}

function addFixedType() {
  try {
    const id = $("typeIdInput").value.trim();
    const name = $("typeNameInput").value.trim();
    const color = validateColor($("typeColorInput").value, "건물 종류 색");
    const width = Number($("typeWidthInput").value);
    const height = Number($("typeHeightInput").value);
    if (!id || !name) throw new TypeError("ID와 이름을 입력하세요.");
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new RangeError("가로·세로 크기는 1 이상의 정수여야 합니다.");
    }

    const before = snapshotTemplate();
    PNSMapEngine.addFixedBuildingType({ id, name, color, width, height });
    const after = snapshotTemplate();
    recordTemplateMutation("fixedTypeCreate", before, after);

    $("typeNameInput").value = "";
    $("buildingColorInput").value = color;
    updateUi(true);
  } catch (error) {
    alert(error.message);
  }
}

function startFixedRange() {
  try {
    const color = validateColor($("rangeColorInput").value, "범위 색");
    const priority = parsePriority($("rangePriorityInput").value);
    rangeController.startCreate({
      kind: $("rangeKindInput").value,
      color,
      priority,
    });
  } catch (error) {
    alert(error.message);
  }
}

function renderTypes() {
  const host = $("buildingTypesHost");
  host.replaceChildren();

  for (const type of PNSMapEngine.getDocument().fixedBuildingTypes) {
    const row = document.createElement("div");
    row.className = "type-row";

    const select = document.createElement("button");
    select.type = "button";
    select.className = "select-type";
    select.textContent = `${type.name} · ${type.width}×${type.height}`;
    select.title = `${type.id} · ${type.color}`;
    select.addEventListener("click", () => {
      try {
        const color = validateColor($("buildingColorInput").value || type.color, "건물 색");
        const priority = parsePriority($("buildingPriorityInput").value);
        $("buildingColorInput").value = color;
        buildingController.selectPalette(type.id, { color, priority });
      } catch (error) {
        alert(error.message);
      }
    });

    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "수정";
    edit.addEventListener("click", () => editFixedType(type));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = "삭제";
    remove.addEventListener("click", () => deleteFixedType(type));

    row.append(select, edit, remove);
    host.append(row);
  }
}

function editFixedType(type) {
  const name = prompt("건물 종류 이름", type.name);
  if (name === null) return;
  const colorInput = prompt("건물 종류 기본 색 (#RRGGBB 또는 255,255,255)", type.color);
  if (colorInput === null) return;
  const widthInput = prompt("가로 크기", String(type.width));
  if (widthInput === null) return;

  const heightInput = prompt("세로 크기", String(type.height));
  if (heightInput === null) return;

  try {
    const color = validateColor(colorInput, "건물 종류 색");
    const width = Number(widthInput);
    const height = Number(heightInput);

    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1
    ) {
      throw new RangeError("가로·세로 크기는 1 이상의 정수여야 합니다.");
    }

    const before = snapshotTemplate();

    PNSMapEngine.editFixedBuildingType(
      type.id,
      {
        name,
        color,
        width,
        height,
      }
    );

    const after = snapshotTemplate();
    recordTemplateMutation("fixedTypeEdit", before, after);
    updateUi(true);
  } catch (error) {
    alert(error.message);
  }
}

function deleteFixedType(type) {
  if (!confirm(`건물 종류 '${type.name}'을 삭제할까요?`)) return;
  try {
    const before = snapshotTemplate();
    PNSMapEngine.deleteFixedBuildingType(type.id);
    const after = snapshotTemplate();
    recordTemplateMutation("fixedTypeDelete", before, after);
    updateUi(true);
  } catch (error) {
    alert(error.message);
  }
}

function renderSelection() {
  const host = $("selectionHost");
  const building = buildingController?.getSelectedBuilding();
  const range = rangeController?.getSelectedRange();

  if (building) {
    host.innerHTML = `
      <div class="selection-name">고정 건물 · ${escapeHtml(building.name)}</div>
      <div class="field-grid">
        <label>이름<input id="selBuildingName" value="${escapeAttr(building.name)}"></label>
        <label>종류<select id="selBuildingType"></select></label>
        <div class="row">
          <label class="grow">X<input id="selBuildingX" type="number" value="${building.x}"></label>
          <label class="grow">Y<input id="selBuildingY" type="number" value="${building.y}"></label>
        </div>
        <label>색<input id="selBuildingColor" value="${escapeAttr(building.color)}"></label>
        <label>우선순위<input id="selBuildingPriority" type="number" step="1" value="${building.priority ?? 0}"></label>
        <button id="applyBuildingSelection" type="button">변경 적용</button>
        <button id="deleteBuildingSelection" class="danger" type="button">건물 삭제</button>
      </div>
      <p class="hint">고정 건물은 최종 맵에서는 항상 잠김 상태입니다. 관리자 제작기에서만 수정할 수 있습니다.</p>`;

    const select = $("selBuildingType");
    for (const type of PNSMapEngine.getDocument().fixedBuildingTypes) {
      const option = new Option(`${type.name} · ${type.width}×${type.height}`, type.id);
      option.selected = type.id === building.typeId;
      select.add(option);
    }

    $("applyBuildingSelection").addEventListener("click", () => {
      try {
        buildingController.editSelected({
          name: $("selBuildingName").value.trim(),
          typeId: $("selBuildingType").value,
          x: Number($("selBuildingX").value),
          y: Number($("selBuildingY").value),
          color: validateColor($("selBuildingColor").value, "건물 색"),
          priority: parsePriority($("selBuildingPriority").value),
        });
      } catch (error) {
        alert(error.message);
      }
    });

    $("deleteBuildingSelection").addEventListener("click", () => {
      if (confirm(`고정 건물 '${building.name}'을 삭제할까요?`)) buildingController.deleteSelected();
    });
    return;
  }

  if (range) {
    host.innerHTML = `
      <div class="selection-name">고정 범위 · ${range.cells.length}셀</div>
      <div class="field-grid">
        <label>종류<select id="selRangeKind"><option value="allowed">건축 허용</option><option value="blocked">건축 금지</option></select></label>
        <label>색<input id="selRangeColor" value="${escapeAttr(range.color)}"></label>
        <label>우선순위<input id="selRangePriority" type="number" step="1" value="${range.priority ?? 0}"></label>
        <button id="applyRangeSelection" type="button">변경 적용</button>
        <button id="deleteRangeSelection" class="danger" type="button">범위 삭제</button>
      </div>
      <p class="hint">범위 우선순위는 항상 저장됩니다. 현재 같은 셀에 두 고정 범위가 겹치는 것은 허용하지 않습니다.</p>`;
    $("selRangeKind").value = range.kind;
    $("applyRangeSelection").addEventListener("click", () => {
      try {
        rangeController.editSelected({
          kind: $("selRangeKind").value,
          color: validateColor($("selRangeColor").value, "범위 색"),
          priority: parsePriority($("selRangePriority").value),
        });
      } catch (error) {
        alert(error.message);
      }
    });
    $("deleteRangeSelection").addEventListener("click", () => {
      if (confirm("선택한 고정 범위를 삭제할까요?")) rangeController.deleteSelected();
    });
    return;
  }

  host.innerHTML = '<div class="selection-empty">선택된 항목이 없습니다.</div>';
}

function updateUi(refreshRenderer = false) {
  if (!history || !buildingController || !rangeController) return;
  $("undoButton").disabled = !history.canUndo();
  $("redoButton").disabled = !history.canRedo();
  $("moveToolButton").disabled = !buildingController.getSelectedBuilding();
  $("confirmRangeButton").disabled = rangeController.getState().mode !== "rangeCreate";

  const linked = server?.state?.();
  $("replaceServerButton").hidden = !linked?.linkedTemplateId;

  renderTypes();
  renderSelection();

  if (refreshRenderer) {
    renderer?.refresh();
    minimap?.setDocument(PNSMapEngine.getDocument());
  }
}

function setDirty(value) {
  dirty = Boolean(value);
  $("dirtyBadge").textContent = dirty ? "● 저장되지 않음" : "저장됨";
  $("documentStatus").textContent = dirty ? "저장되지 않음" : "저장됨";
}

function replaceTemplate(template, { saved = true } = {}) {
  if (template) PNSMapEngine.loadTemplateDocument(template);
  else PNSMapEngine.createTemplateDocument();

  history.clear({ saved });
  buildingController.cancelMode();
  rangeController.cancel();
  bulkDeleteController.cancel();
  rangeEraseController.cancel();
  setDirty(!saved);

  renderer.refresh();
  renderer.fitToMap();
  minimap.setDocument(PNSMapEngine.getDocument());
  renderSelection();
  renderTypes();
}

function snapshotTemplate() {
  return PNSMapEngine.exportTemplateDocument();
}

function restoreTemplate(snapshot) {
  PNSMapEngine.loadTemplateDocument(snapshot);
  buildingController.normalizeSelection();
  rangeController.normalizeSelection();
  renderer.refresh();
  minimap?.setDocument(PNSMapEngine.getDocument());
}

function recordTemplateMutation(description, before, after) {
  history.record({
    description,
    undo() { restoreTemplate(before); },
    redo() { restoreTemplate(after); },
  });
  setDirty(!history.isAtSavedState());
}

function exportTemplateFile() {
  try {
    const data = PNSMapEngine.exportTemplateDocument();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "template.isotemplate";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    history.markSaved();
    setDirty(false);
    $("documentStatus").textContent = "내보내기 완료";
  } catch (error) {
    alert(error.message);
  }
}

async function refreshServerList() {
  if (!server || serverBusy) return;
  serverBusy = true;
  setServerStatus("고정맵 목록 불러오는 중…");
  try {
    const list = await server.list();
    $("serverTemplates").replaceChildren(
      new Option("등록된 고정맵 선택", ""),
      ...list.map(item => new Option(
        `${item.name_ko}${item.is_default ? " [기본맵]" : ""}`,
        item.id,
      )),
    );
    setServerStatus(`${list.length}개 등록됨`);
  } catch (error) {
    handleServerError(error);
  } finally {
    serverBusy = false;
  }
}

async function loadSelectedServerTemplate() {
  const id = $("serverTemplates").value;
  if (!id || serverBusy || !confirmReplaceCurrent()) return;
  serverBusy = true;
  setServerStatus("서버 고정맵 여는 중…");
  try {
    const result = await server.load(id);
    replaceTemplate(result.templateData, { saved: true });
    setServerStatus(`열기 완료 · ${result.template.name_ko}`);
  } catch (error) {
    handleServerError(error);
  } finally {
    serverBusy = false;
  }
}

async function registerServerTemplate(event) {
  event.preventDefault();
  if (serverBusy) return;
  try {
    const names = validateTemplateNames(Object.fromEntries(new FormData(event.currentTarget)));
    serverBusy = true;
    setServerStatus("신규 등록 중…");
    const result = await server.create(names, PNSMapEngine.exportTemplateDocument());
    $("registerDialog").close();
    history.markSaved();
    setDirty(false);
    setServerStatus(`등록 완료 · ${result.template.name_ko}`);
    await refreshServerList();
    updateUi(false);
  } catch (error) {
    handleServerError(error);
  } finally {
    serverBusy = false;
  }
}

async function replaceServerTemplate() {
  if (serverBusy) return;
  if (!confirm("연결된 서버 고정맵을 현재 내용으로 업데이트할까요? 기존 사용자 맵은 바뀌지 않습니다.")) return;
  serverBusy = true;
  setServerStatus("서버 업데이트 중…");
  try {
    const result = await server.replace(PNSMapEngine.exportTemplateDocument());
    history.markSaved();
    setDirty(false);
    setServerStatus(`업데이트 완료 · ${result.template.name_ko}`);
  } catch (error) {
    handleServerError(error);
  } finally {
    serverBusy = false;
  }
}

function handleServerError(error) {
  console.error(error);
  if (error?.status === 401) {
    setOverlay("관리자 세션이 만료되었습니다.", "다시 로그인해 주세요.", true);
  }
  setServerStatus(error?.message || "서버 요청 실패", true);
}

function setServerStatus(message, error = false) {
  $("serverStatus").textContent = message;
  $("serverStatus").style.color = error ? "#d75555" : "";
}

function confirmReplaceCurrent() {
  return !dirty || confirm("현재 저장되지 않은 작업을 다른 내용으로 교체할까요?");
}

function parsePriority(value) {
  if (String(value).trim() === "") throw new TypeError("우선순위는 반드시 입력해야 합니다.");
  const number = Number(value);
  if (!Number.isInteger(number)) throw new TypeError("우선순위는 정수여야 합니다.");
  return number;
}

function setOverlay(title, message = "", actions = false) {
  $("overlayTitle").textContent = title;
  $("overlayMessage").textContent = message;
  $("overlayActions").classList.toggle("hidden", !actions);
  $("editorOverlay").classList.remove("hidden");
}

function hideOverlay() {
  $("editorOverlay").classList.add("hidden");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}
