import { createHistory, editorShortcutAction } from "../editor/editor-history.js";
import { createMapRenderer, viewportCenterGrid } from "../editor/editor-renderer.js";
import { TemplateEditorEngine, convertDocumentToTemplate, emptyTemplate } from "./template-editor-core.js";
import { createTemplateBuildingController, createTemplateRangeController } from "./template-editor-controllers.js";
import { createTemplateAdminClient, validateTemplateNames } from "./template-editor-server.js";

const ADMIN_SESSION_URL =
  "https://dpmjwsnqkuzetyvfcmfr.supabase.co/functions/v1/admin-session";

const $ = id => document.getElementById(id);

if (!S967AdminAuth.getToken()) {
  $("gateMessage").textContent = "관리자 로그인이 필요합니다.";
} else if (await S967AdminAuth.validate({ url: ADMIN_SESSION_URL })) {
  $("gate").hidden = true;
  $("app").hidden = false;
  boot();
} else {
  $("gateMessage").textContent =
    "관리자 세션이 유효하지 않거나 확인할 수 없습니다. 다시 로그인하세요.";
}

function boot() {
  const engine = new TemplateEditorEngine();
  const server = createTemplateAdminClient();

  let dirty = false;
  let renderer = null;
  let serverBusy = false;

  /*
    중요:
    history.clear()는 onChange를 즉시 호출한다.
    따라서 building/range를 만든 뒤 clear해야 한다.
  */
  const history = createHistory({
    onChange: () => update(),
  });

  const onDirty = value => {
    dirty = value;
    update();
  };

  const building = createTemplateBuildingController({
    engine,
    history,
    onChange: () => update(),
    onDirty,
  });

  const range = createTemplateRangeController({
    engine,
    history,
    onChange: () => update(),
    onDirty,
  });

  history.clear({ saved: true });

  const editorHost = {
    setCursor(x, y) {
      $("cursorCoord").textContent = `커서 X ${x} / Y ${y}`;
    },
    clearCursor() {
      $("cursorCoord").textContent = "커서 X — / Y —";
    },
    setZoom() {},
    markDirty() {
      dirty = true;
      update(false);
    },
  };

  renderer = createMapRenderer({
    host: $("canvas"),
    engine,
    controller: building,
    rangeController: range,
    editableFixed: true,
    editorHost,
    requestBuildingName: () => prompt("건물 이름"),
    onViewportChange: () => updateNavigation(),
  });

  function update(refreshRenderer = true) {
    const linked = server.state();

    $("dirty").textContent =
      dirty ? "● 저장되지 않음" : "저장됨";
    $("dirty").className =
      dirty ? "dirty" : "";

    $("undoBtn").disabled =
      !history.canUndo();
    $("redoBtn").disabled =
      !history.canRedo();

    $("replaceBtn").hidden =
      !linked.linkedTemplateId;

    $("linkStatus").textContent =
      linked.linkedTemplateId
        ? `등록된 고정맵 · ${linked.linkedTemplateNames.name_ko} · Template ID: ${linked.linkedTemplateId}`
        : "로컬 고정맵";

    renderTypes();
    renderSelection();
    updateNavigation();

    if (refreshRenderer) {
      renderer?.refresh();
    }
  }

  function renderSelection() {
    const selectedBuilding =
      building.getSelectedBuilding();

    const selectedRange =
      range.getSelectedRange();

    if (selectedBuilding) {
      $("selection").textContent =
        `${selectedBuilding.name} (${selectedBuilding.id}) · ` +
        `X ${selectedBuilding.x} / Y ${selectedBuilding.y}`;

      $("buildingCoords").hidden = false;
      $("buildingX").value = selectedBuilding.x;
      $("buildingY").value = selectedBuilding.y;
      return;
    }

    $("buildingCoords").hidden = true;

    if (selectedRange) {
      $("selection").textContent =
        `${selectedRange.kind} (${selectedRange.id}) · ` +
        `${selectedRange.cells.length}셀`;
      return;
    }

    $("selection").textContent =
      "선택된 항목이 없습니다.";
  }

  function updateNavigation() {
    if (!renderer) return;

    const state =
      renderer.getState();

    const [centerX, centerY] =
      viewportCenterGrid(state);

    if (document.activeElement !== $("centerX")) {
      $("centerX").value = centerX;
    }

    if (document.activeElement !== $("centerY")) {
      $("centerY").value = centerY;
    }

    if (document.activeElement !== $("zoomInput")) {
      $("zoomInput").value =
        Math.round(state.zoom * 100);
    }
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
      confirm(
        "현재 작업을 다른 내용으로 교체하시겠습니까?"
      )
    );
  }

  function status(
    message,
    error = false
  ) {
    $("serverStatus").textContent =
      message;
    $("serverStatus").className =
      error ? "error" : "";
  }

  function authFailure(error) {
    if (error.status === 401) {
      $("app").hidden = true;
      $("gate").hidden = false;
      $("gateMessage").textContent =
        "관리자 세션이 만료되었습니다. 다시 로그인하세요.";
    }

    status(error.message, true);
  }

  function renderTypes() {
    $("types").replaceChildren(
      ...engine
        .getDocument()
        .fixedBuildingTypes
        .map(type => {
          const row =
            document.createElement("div");
          const select =
            document.createElement("button");
          const edit =
            document.createElement("button");
          const del =
            document.createElement("button");

          row.className = "row";

          select.textContent =
            `${type.name} · ${type.width}×${type.height}`;

          select.onclick = () => {
            range.cancel();
            building.selectPalette(type.id);
          };

          edit.textContent = "수정";
          edit.onclick = () => {
            const name =
              prompt("유형 이름", type.name);

            const size =
              name === null
                ? null
                : prompt(
                    "크기 (1 또는 2)",
                    String(type.width)
                  );

            if (size !== null) {
              try {
                building.mutate(
                  () =>
                    engine.editType(
                      type.id,
                      {
                        name,
                        color:
                          $("typeColor").value,
                        width: +size,
                        height: +size,
                      }
                    ),
                  "fixedTypeEdit"
                );
              } catch (error) {
                alert(error.message);
              }
            }
          };

          del.textContent = "삭제";
          del.onclick = () => {
            try {
              building.mutate(
                () =>
                  engine.deleteType(
                    type.id
                  ),
                "fixedTypeDelete"
              );
            } catch (error) {
              alert(error.message);
            }
          };

          row.append(
            select,
            edit,
            del
          );

          return row;
        })
    );
  }

  async function refreshList() {
    if (serverBusy) return;

    serverBusy = true;
    $("refreshServerBtn").disabled = true;
    $("loadServerBtn").disabled = true;
    status("불러오는 중…");

    try {
      const list =
        await server.list();

      $("serverTemplates").replaceChildren(
        new Option(
          "등록된 고정맵 선택",
          ""
        ),
        ...list.map(
          template =>
            new Option(
              `${template.name_ko}${
                template.is_default
                  ? " [기본맵]"
                  : ""
              }`,
              template.id
            )
        )
      );

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

  $("registerBtn").onclick = () =>
    $("registerDialog").showModal();

  $("cancelRegister").onclick = () =>
    $("registerDialog").close();

  $("registerForm").onsubmit =
    async event => {
      event.preventDefault();

      if (serverBusy) return;

      let names;

      try {
        names =
          validateTemplateNames(
            Object.fromEntries(
              new FormData(
                event.currentTarget
              )
            )
          );
      } catch (error) {
        return status(
          error.message,
          true
        );
      }

      serverBusy = true;
      $("registerBtn").disabled = true;
      status("등록 중…");

      try {
        const result =
          await server.create(
            names,
            engine.exportTemplate()
          );

        $("registerDialog").close();

        status(
          `등록 완료: ${result.template.name_ko}`
        );

        serverBusy = false;
        await refreshList();
        update();
      } catch (error) {
        authFailure(error);
      } finally {
        serverBusy = false;
        $("registerBtn").disabled = false;
      }
    };

  $("replaceBtn").onclick =
    async () => {
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
        const result =
          await server.replace(
            engine.exportTemplate()
          );

        status(
          `업데이트 완료: ${result.template.name_ko}`
        );

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

  $("refreshServerBtn").onclick =
    refreshList;

  $("loadServerBtn").onclick =
    async () => {
      const id =
        $("serverTemplates").value;

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
        const result =
          await server.load(id);

        replace(
          result.templateData,
          {
            saved: true,
            clearLink: false,
          }
        );

        status(
          `열기 완료: ${result.template.name_ko}`
        );
      } catch (error) {
        if (
          error.status === 404 &&
          server.state()
            .linkedTemplateId === id
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
      range.cancel();

      building.mutate(
        () =>
          engine.addType({
            id:
              $("typeId").value,
            name:
              $("typeName").value,
            color:
              $("typeColor").value,
            width:
              +$("typeSize").value,
            height:
              +$("typeSize").value,
          }),
        "fixedTypeCreate"
      );
    } catch (error) {
      alert(error.message);
    }
  };

  $("newBtn").onclick = () => {
    if (guard()) {
      replace(
        emptyTemplate(),
        { saved: false }
      );
    }
  };

  $("openBtn").onclick = () =>
    $("templateFile").click();

  $("importBtn").onclick = () =>
    $("mapFile").click();

  $("templateFile").onchange =
    async event => {
      if (
        !event.target.files[0] ||
        !guard()
      ) {
        return;
      }

      try {
        replace(
          JSON.parse(
            await event.target.files[0]
              .text()
          )
        );
      } catch (error) {
        alert(error.message);
      }

      event.target.value = "";
    };

  $("mapFile").onchange =
    async event => {
      if (
        !event.target.files[0] ||
        !guard()
      ) {
        return;
      }

      try {
        const raw =
          JSON.parse(
            await event.target.files[0]
              .text()
          );

        const converted =
          convertDocumentToTemplate(
            raw
          );

        replace(
          converted,
          { saved: false }
        );
      } catch (error) {
        console.error(
          "isomap import failed",
          error
        );

        alert(
          `가져오기 실패: ${error.message}`
        );
      }

      event.target.value = "";
    };

  $("exportBtn").onclick = () => {
    const blob =
      new Blob(
        [
          JSON.stringify(
            engine.exportTemplate(),
            null,
            2
          ),
        ],
        {
          type:
            "application/json;charset=utf-8",
        }
      );

    const anchor =
      document.createElement("a");

    anchor.href =
      URL.createObjectURL(blob);

    anchor.download =
      "template.isotemplate";

    anchor.click();

    URL.revokeObjectURL(
      anchor.href
    );

    history.markSaved();
    dirty = false;
    update();
  };

  $("undoBtn").onclick =
    () => building.undo();

  $("redoBtn").onclick =
    () => building.redo();

  $("startRange").onclick = () => {
    building.cancelMode();

    range.startCreate({
      kind:
        $("rangeKind").value,
      color:
        $("rangeColor").value,
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

  $("createRangeCoords").onclick =
    () => {
      const start = [
        Number(
          $("rangeX1").value
        ),
        Number(
          $("rangeY1").value
        ),
      ];

      const end = [
        Number(
          $("rangeX2").value
        ),
        Number(
          $("rangeY2").value
        ),
      ];

      if (
        ![...start, ...end]
          .every(Number.isInteger)
      ) {
        alert(
          "X1, Y1, X2, Y2를 모두 입력하세요."
        );
        return;
      }

      try {
        building.cancelMode();

        range.createRectangle(
          {
            kind:
              $("rangeKind").value,
            color:
              $("rangeColor").value,
          },
          start,
          end
        );

        update();
      } catch (error) {
        alert(error.message);
      }
    };

  $("moveBuilding").onclick = () => {
    range.cancel();
    building.startMove();
  };

  $("moveBuildingCoords").onclick =
    () => {
      const selected =
        building.getSelectedBuilding();

      if (!selected) return;

      const x =
        Number(
          $("buildingX").value
        );

      const y =
        Number(
          $("buildingY").value
        );

      if (
        !Number.isInteger(x) ||
        !Number.isInteger(y)
      ) {
        alert(
          "올바른 X/Y 좌표를 입력하세요."
        );
        return;
      }

      try {
        building.editSelected({
          x,
          y,
        });

        update();
      } catch (error) {
        alert(error.message);
      }
    };

  $("editBuilding").onclick = () => {
    const selected =
      building.getSelectedBuilding();

    if (!selected) return;

    const name =
      prompt(
        "건물 이름",
        selected.name
      );

    const typeId =
      name === null
        ? null
        : prompt(
            "유형 ID",
            selected.typeId
          );

    if (typeId !== null) {
      try {
        building.editSelected({
          name,
          typeId,
        });
      } catch (error) {
        alert(error.message);
      }
    }
  };

  $("deleteBuilding").onclick = () => {
    building.deleteSelected();
    update();
  };

  $("editRange").onclick = () => {
    const selected =
      range.getSelectedRange();

    if (!selected) return;

    try {
      range.editSelected({
        kind:
          $("rangeKind").value,
        color:
          $("rangeColor").value,
      });

      update();
    } catch (error) {
      alert(error.message);
    }
  };

  $("eraseRange").onclick = () => {
    const selected =
      range.getSelectedRange();

    if (!selected) return;

    const value =
      prompt(
        "삭제할 셀 좌표 x,y",
        selected.cells[0].join(",")
      );

    if (value === null) return;

    const cell =
      value
        .split(",")
        .map(Number);

    if (
      cell.length !== 2 ||
      !cell.every(Number.isInteger)
    ) {
      alert(
        "좌표는 x,y 형식으로 입력하세요."
      );
      return;
    }

    try {
      range.erase([cell]);
      update();
    } catch (error) {
      alert(error.message);
    }
  };

  $("deleteRange").onclick = () => {
    range.deleteSelected();
    update();
  };

  $("goCenter").onclick = () => {
    const x =
      Number(
        $("centerX").value
      );

    const y =
      Number(
        $("centerY").value
      );

    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y)
    ) {
      alert(
        "올바른 중심 좌표를 입력하세요."
      );
      return;
    }

    renderer.centerAtGrid(
      x,
      y
    );

    updateNavigation();
  };

  $("applyZoom").onclick = () => {
    const percent =
      Number(
        $("zoomInput").value
      );

    if (
      !Number.isFinite(percent) ||
      percent < 1 ||
      percent > 400
    ) {
      alert(
        "배율은 1~400%로 입력하세요."
      );
      return;
    }

    renderer.setZoom(
      percent / 100
    );

    updateNavigation();
  };

  for (
    const id
    of ["centerX", "centerY"]
  ) {
    $(id).addEventListener(
      "keydown",
      event => {
        if (event.key === "Enter") {
          $("goCenter").click();
        }
      }
    );
  }

  $("zoomInput")
    .addEventListener(
      "keydown",
      event => {
        if (event.key === "Enter") {
          $("applyZoom").click();
        }
      }
    );

  addEventListener(
    "keydown",
    event => {
      const action =
        editorShortcutAction({
          ...event,
          isFormControl:
            /INPUT|SELECT|TEXTAREA|BUTTON/
              .test(
                event.target.tagName
              ),
        });

      if (action) {
        event.preventDefault();
        building[action]();
      }
    }
  );

  addEventListener(
    "beforeunload",
    event => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
  );

  update();
  refreshList();
}
