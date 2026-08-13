import { createHistory, editorShortcutAction } from "../editor/editor-history.js";
import { createMapRenderer } from "../editor/editor-renderer.js";
import {
  TemplateEditorEngine,
  convertDocumentToTemplate,
  emptyTemplate,
} from "./template-editor-core.js";
import {
  createTemplateBuildingController,
  createTemplateRangeController,
} from "./template-editor-controllers.js";
import {
  createTemplateAdminClient,
  validateTemplateNames,
} from "./template-editor-server.js";

const ADMIN_SESSION_URL =
  "https://dpmjwsnqkuzetyvfcmfr.supabase.co/functions/v1/admin-session";

const $ = (id) => document.getElementById(id);

async function start() {
  const token = S967AdminAuth.getToken();

  if (!token) {
    $("gateMessage").textContent = "관리자 로그인이 필요합니다.";
    return;
  }

  try {
    const valid = await S967AdminAuth.validate({
      url: ADMIN_SESSION_URL,
    });

    if (!valid) {
      $("gateMessage").textContent =
        "관리자 세션이 유효하지 않거나 확인할 수 없습니다. 다시 로그인하세요.";
      return;
    }

    $("gate").hidden = true;
    $("app").hidden = false;

    boot();
  } catch (error) {
    console.error("관리자 세션 확인 실패:", error);

    $("gateMessage").textContent =
      "관리자 세션을 확인할 수 없습니다. 잠시 후 다시 시도하세요.";
  }
}

function boot() {
  const engine = new TemplateEditorEngine();
  const history = createHistory({
    onChange: update,
  });
  const server = createTemplateAdminClient();

  let dirty = false;
  let renderer;
  let serverBusy = false;

  const onDirty = (value) => {
    dirty = value;
    update();
  };

  const building = createTemplateBuildingController({
    engine,
    history,
    onChange: update,
    onDirty,
  });

  const range = createTemplateRangeController({
    engine,
    history,
    onChange: update,
    onDirty,
  });

  renderer = createMapRenderer({
    host: $("canvas"),
    engine,
    controller: building,
    rangeController: range,
    editableFixed: true,
    requestBuildingName: () => prompt("건물 이름"),
  });

  history.clear({ saved: true });

  function update() {
    const linked = server.state();

    $("dirty").textContent = dirty ? "● 저장되지 않음" : "저장됨";
    $("dirty").className = dirty ? "dirty" : "";

    $("undoBtn").disabled = !history.canUndo();
    $("redoBtn").disabled = !history.canRedo();

    $("replaceBtn").hidden = !linked.linkedTemplateId;

    $("linkStatus").textContent = linked.linkedTemplateId
      ? `등록된 고정맵 · ${linked.linkedTemplateNames.name_ko} · Template ID: ${linked.linkedTemplateId}`
      : "로컬 고정맵";

    renderTypes();

    const item =
      building.getSelectedBuilding() ||
      range.getSelectedRange();

    $("selection").textContent = item
      ? `${item.name || item.kind} (${item.id})`
      : "선택된 항목이 없습니다.";

    renderer?.refresh();
  }

  function replace(
    raw,
    {
      saved = true,
      clearLink = true,
    } = {}
  ) {
    engine.loadTemplate(raw);
    history.clear({ saved });

    dirty = !saved;

    if (clearLink) {
      server.clearLink();
    }

    building.cancelMode();
    range.cancel();

    update();
  }

  function guard() {
    return (
      !dirty ||
      confirm("현재 작업을 다른 내용으로 교체하시겠습니까?")
    );
  }

  function status(message, error = false) {
    $("serverStatus").textContent = message;
    $("serverStatus").className = error ? "error" : "";
  }

  function authFailure(error) {
    if (error?.status === 401) {
      $("app").hidden = true;
      $("gate").hidden = false;

      $("gateMessage").textContent =
        "관리자 세션이 만료되었습니다. 다시 로그인하세요.";

      return;
    }

    status(
      error?.message || "서버 요청 중 오류가 발생했습니다.",
      true
    );
  }

  function renderTypes() {
    const container = $("types");

    const rows = engine.getDocument().fixedBuildingTypes.map((type) => {
      const row = document.createElement("div");
      const select = document.createElement("button");
      const edit = document.createElement("button");
      const del = document.createElement("button");

      row.className = "row";

      select.textContent =
        `${type.name} · ${type.width}×${type.height}`;

      select.onclick = () => {
        building.selectPalette(type.id);
      };

      edit.textContent = "수정";

      edit.onclick = () => {
        const name = prompt("유형 이름", type.name);

        if (name === null) {
          return;
        }

        const size = prompt(
          "크기 (1 또는 2)",
          String(type.width)
        );

        if (size === null) {
          return;
        }

        try {
          building.mutate(
            () =>
              engine.editType(type.id, {
                name,
                color: $("typeColor").value,
                width: +size,
                height: +size,
              }),
            "fixedTypeEdit"
          );
        } catch (error) {
          alert(error.message);
        }
      };

      del.textContent = "삭제";

      del.onclick = () => {
        try {
          building.mutate(
            () => engine.deleteType(type.id),
            "fixedTypeDelete"
          );
        } catch (error) {
          alert(error.message);
        }
      };

      row.append(select, edit, del);

      return row;
    });

    container.replaceChildren(...rows);
  }

  async function refreshList() {
    if (serverBusy) {
      return;
    }

    serverBusy = true;

    $("refreshServerBtn").disabled = true;
    $("loadServerBtn").disabled = true;

    status("불러오는 중…");

    try {
      const list = await server.list();

      const options = [
        new Option("등록된 고정맵 선택", ""),
        ...list.map(
          (template) =>
            new Option(
              `${template.name_ko}${
                template.is_default ? " [기본맵]" : ""
              }`,
              template.id
            )
        ),
      ];

      $("serverTemplates").replaceChildren(...options);

      status(
        list.length
          ? `${list.length}개 등록됨`
          : "등록된 고정맵이 없습니다."
      );
    } catch (error) {
      authFailure(error);
    } finally {
      serverBusy = false;

      $("refreshServerBtn").disabled = false;
      $("loadServerBtn").disabled = false;
    }
  }

  $("registerBtn").onclick = () => {
    $("registerDialog").showModal();
  };

  $("cancelRegister").onclick = () => {
    $("registerDialog").close();
  };

  $("registerForm").onsubmit = async (event) => {
    event.preventDefault();

    if (serverBusy) {
      return;
    }

    let names;

    try {
      names = validateTemplateNames(
        Object.fromEntries(
          new FormData(event.currentTarget)
        )
      );
    } catch (error) {
      status(error.message, true);
      return;
    }

    serverBusy = true;
    $("registerBtn").disabled = true;

    status("등록 중…");

    try {
      const result = await server.create(
        names,
        engine.exportTemplate()
      );

      $("registerDialog").close();

      status(`등록 완료: ${result.template.name_ko}`);

      await refreshList();
      update();
    } catch (error) {
      authFailure(error);
    } finally {
      serverBusy = false;
      $("registerBtn").disabled = false;
    }
  };

  $("replaceBtn").onclick = async () => {
    if (
      serverBusy ||
      !confirm(
        "등록된 고정맵 파일을 현재 작업 내용으로 교체하시겠습니까?\n" +
        "이미 이 고정맵으로 생성된 기존 사용자 맵은 변경되지 않습니다."
      )
    ) {
      return;
    }

    serverBusy = true;
    $("replaceBtn").disabled = true;

    status("업데이트 중…");

    try {
      const result = await server.replace(
        engine.exportTemplate()
      );

      status(`업데이트 완료: ${result.template.name_ko}`);
      update();
    } catch (error) {
      if (error.status === 404) {
        alert(
          "등록된 고정맵이 더 이상 존재하지 않습니다. " +
          "현재 작업은 유지되며 새 고정맵으로 다시 등록할 수 있습니다."
        );
      }

      authFailure(error);
      update();
    } finally {
      serverBusy = false;
      $("replaceBtn").disabled = false;
    }
  };

  $("refreshServerBtn").onclick = refreshList;

  $("loadServerBtn").onclick = async () => {
    const id = $("serverTemplates").value;

    if (
      !id ||
      serverBusy ||
      !guard()
    ) {
      return;
    }

    serverBusy = true;
    $("loadServerBtn").disabled = true;

    status("고정맵을 여는 중…");

    try {
      const result = await server.load(id);

      replace(result.templateData, {
        saved: true,
        clearLink: false,
      });

      status(`열기 완료: ${result.template.name_ko}`);
    } catch (error) {
      if (
        error.status === 404 &&
        server.state().linkedTemplateId === id
      ) {
        server.clearLink();
      }

      authFailure(error);
      update();
    } finally {
      serverBusy = false;
      $("loadServerBtn").disabled = false;
    }
  };

  $("addType").onclick = () => {
    try {
      building.mutate(
        () =>
          engine.addType({
            id: $("typeId").value,
            name: $("typeName").value,
            color: $("typeColor").value,
            width: +$("typeSize").value,
            height: +$("typeSize").value,
          }),
        "fixedTypeCreate"
      );
    } catch (error) {
      alert(error.message);
    }
  };

  $("newBtn").onclick = () => {
    if (guard()) {
      replace(emptyTemplate(), {
        saved: false,
      });
    }
  };

  $("openBtn").onclick = () => {
    $("templateFile").click();
  };

  $("importBtn").onclick = () => {
    $("mapFile").click();
  };

  $("templateFile").onchange = async (event) => {
    const file = event.target.files[0];

    if (!file || !guard()) {
      return;
    }

    try {
      const raw = JSON.parse(await file.text());

      replace(raw);
    } catch (error) {
      alert(error.message);
    }

    event.target.value = "";
  };

  $("mapFile").onchange = async (event) => {
    const file = event.target.files[0];

    if (!file || !guard()) {
      return;
    }

    try {
      const raw = JSON.parse(await file.text());

      replace(
        convertDocumentToTemplate(raw),
        {
          saved: false,
        }
      );
    } catch (error) {
      alert(`가져오기 실패: ${error.message}`);
    }

    event.target.value = "";
  };

  $("exportBtn").onclick = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          engine.exportTemplate(),
          null,
          2
        ),
      ],
      {
        type: "application/json;charset=utf-8",
      }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "template.isotemplate";
    link.click();

    URL.revokeObjectURL(url);

    history.markSaved();
    dirty = false;

    update();
  };

  $("undoBtn").onclick = () => {
    building.undo();
  };

  $("redoBtn").onclick = () => {
    building.redo();
  };

  $("startRange").onclick = () => {
    range.startCreate({
      kind: $("rangeKind").value,
      color: $("rangeColor").value,
    });
  };

  $("commitRange").onclick = () => {
    try {
      range.commit();
      update();
    } catch (error) {
      alert(error.message);
    }
  };

  $("moveBuilding").onclick = () => {
    building.startMove();
  };

  $("editBuilding").onclick = () => {
    const buildingData =
      building.getSelectedBuilding();

    if (!buildingData) {
      return;
    }

    const name = prompt(
      "건물 이름",
      buildingData.name
    );

    if (name === null) {
      return;
    }

    const typeId = prompt(
      "유형 ID",
      buildingData.typeId
    );

    if (typeId === null) {
      return;
    }

    try {
      building.editSelected({
        name,
        typeId,
      });
    } catch (error) {
      alert(error.message);
    }
  };

  $("deleteBuilding").onclick = () => {
    building.deleteSelected();
  };

  $("editRange").onclick = () => {
    const selectedRange =
      range.getSelectedRange();

    if (!selectedRange) {
      return;
    }

    try {
      range.editSelected({
        kind: $("rangeKind").value,
        color: $("rangeColor").value,
      });
    } catch (error) {
      alert(error.message);
    }
  };

  $("eraseRange").onclick = () => {
    const selectedRange =
      range.getSelectedRange();

    if (!selectedRange) {
      return;
    }

    const value = prompt(
      "삭제할 셀 좌표 x,y",
      selectedRange.cells[0].join(",")
    );

    if (value === null) {
      return;
    }

    try {
      range.erase([
        value.split(",").map(Number),
      ]);
    } catch (error) {
      alert(error.message);
    }
  };

  $("deleteRange").onclick = () => {
    range.deleteSelected();
  };

  addEventListener("keydown", (event) => {
    const action = editorShortcutAction({
      ...event,
      isFormControl:
        /INPUT|SELECT|TEXTAREA/.test(
          event.target.tagName
        ),
    });

    if (!action) {
      return;
    }

    event.preventDefault();
    building[action]();
  });

  addEventListener("beforeunload", (event) => {
    if (!dirty) {
      return;
    }

    event.preventDefault();
    event.returnValue = "";
  });

  update();

  // 에디터를 먼저 표시한 뒤 서버 목록은 별도로 로딩
  refreshList().catch((error) => {
    console.error("고정맵 목록 로딩 실패:", error);
  });
}

start();
