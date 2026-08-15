(() => {
  "use strict";

  const COLORING_ADMIN_API_URL =
    "https://dpmjwsnqkuzetyvfcmfr.supabase.co/functions/v1/coloring-admin";

  const REQUEST_TIMEOUT_MS =
    15000;

  const section =
    document.getElementById(
      "coloringAdminSection"
    );

  if (!section) {
    return;
  }

  const currentHost =
    document.getElementById(
      "coloringBoardCurrent"
    );

  const boardStatus =
    document.getElementById(
      "coloringBoardStatus"
    );

  const refreshButton =
    document.getElementById(
      "refreshColoringBoardButton"
    );

  const fileInput =
    document.getElementById(
      "newColoringBoardFile"
    );

  const replaceButton =
    document.getElementById(
      "replaceColoringBoardButton"
    );

  const previewHost =
    document.getElementById(
      "newColoringBoardPreview"
    );

  const replaceStatus =
    document.getElementById(
      "replaceColoringBoardStatus"
    );

  const coloringTab =
    document.querySelector(
      '[data-admin-tab="coloring"]'
    );

  let currentBoard =
    null;

  let pendingBoard =
    null;

  let loaded =
    false;

  function setLocalStatus(
    element,
    message,
    isError = false
  ) {
    if (!element) {
      return;
    }

    element.textContent =
      message;

    element.classList.toggle(
      "error",
      isError
    );
  }

  async function request(
    method,
    body = null
  ) {
    const token =
      window.S967AdminAuth
        ?.getToken?.();

    if (!token) {
      throw new Error(
        "관리자 로그인이 필요합니다."
      );
    }

    const controller =
      new AbortController();

    const timer =
      window.setTimeout(
        () =>
          controller.abort(),
        REQUEST_TIMEOUT_MS
      );

    try {
      const options = {
        method,
        signal:
          controller.signal,
        cache:
          "no-store",
        headers: {
          Authorization:
            `Bearer ${token}`,
        },
      };

      if (body !== null) {
        options.headers[
          "Content-Type"
        ] =
          "application/json";

        options.body =
          JSON.stringify(
            body
          );
      }

      const response =
        await fetch(
          COLORING_ADMIN_API_URL,
          options
        );

      const result =
        await response
          .json()
          .catch(
            () => ({})
          );

      if (!response.ok) {
        if (
          response.status ===
            401 ||
          response.status ===
            403
        ) {
          window.S967AdminAuth
            ?.clearToken?.();
        }

        throw new Error(
          result.error ||
          result.message ||
          "색칠놀이 관리자 요청에 실패했습니다."
        );
      }

      return result;
    } catch (error) {
      if (
        error?.name ===
          "AbortError"
      ) {
        throw new Error(
          "요청 시간이 초과되었습니다."
        );
      }

      throw error;
    } finally {
      window.clearTimeout(
        timer
      );
    }
  }

  function validateBoard(
    board
  ) {
    if (
      !board ||
      typeof board !==
        "object" ||
      Array.isArray(board)
    ) {
      throw new Error(
        "JSON 최상위 값이 올바른 객체가 아닙니다."
      );
    }

    const id =
      String(
        board.id ??
        ""
      ).trim();

    if (
      !id ||
      id.length > 100 ||
      !/^[A-Za-z0-9._-]+$/.test(
        id
      )
    ) {
      throw new Error(
        "구역도 id는 영문, 숫자, 점, 밑줄, 하이픈만 사용해 1~100자로 입력해야 합니다."
      );
    }

    if (
      !Array.isArray(
        board.regions
      ) ||
      board.regions.length <
        1 ||
      board.regions.length >
        5000
    ) {
      throw new Error(
        "regions는 1~5000개의 구역을 포함해야 합니다."
      );
    }

    const regionIds =
      new Set();

    for (
      const region
      of board.regions
    ) {
      const regionId =
        String(
          region?.id ??
          ""
        ).trim();

      if (!regionId) {
        throw new Error(
          "모든 구역에는 id가 필요합니다."
        );
      }

      if (
        regionIds.has(
          regionId
        )
      ) {
        throw new Error(
          `중복 구역 id: ${regionId}`
        );
      }

      regionIds.add(
        regionId
      );

      if (
        region.kind !==
          "path" &&
        region.kind !==
          "polygon"
      ) {
        throw new Error(
          `${regionId}: kind는 path 또는 polygon이어야 합니다.`
        );
      }

      if (
        region.kind ===
          "path" &&
        !String(
          region.path ??
          ""
        ).trim()
      ) {
        throw new Error(
          `${regionId}: path 데이터가 없습니다.`
        );
      }

      if (
        region.kind ===
          "polygon" &&
        !String(
          region.points ??
          ""
        ).trim()
      ) {
        throw new Error(
          `${regionId}: points 데이터가 없습니다.`
        );
      }
    }

    if (
      !board.adjacency ||
      typeof board.adjacency !==
        "object" ||
      Array.isArray(
        board.adjacency
      )
    ) {
      throw new Error(
        "adjacency 데이터가 필요합니다."
      );
    }

    for (
      const regionId
      of regionIds
    ) {
      const neighbors =
        board.adjacency[
          regionId
        ];

      if (
        !Array.isArray(
          neighbors
        )
      ) {
        throw new Error(
          `${regionId}: adjacency 배열이 없습니다.`
        );
      }

      for (
        const neighbor
        of neighbors
      ) {
        if (
          !regionIds.has(
            String(
              neighbor
            )
          )
        ) {
          throw new Error(
            `${regionId}: 존재하지 않는 인접 구역 ${neighbor}`
          );
        }
      }
    }

    return {
      id,
      regionCount:
        board.regions.length,
    };
  }

  async function readBoardFile(
    file
  ) {
    if (!file) {
      throw new Error(
        "JSON 파일을 선택하세요."
      );
    }

    if (
      file.size >
        12 * 1024 * 1024
    ) {
      throw new Error(
        "구역도 JSON은 12 MiB 이하여야 합니다."
      );
    }

    const text =
      await file.text();

    let board;

    try {
      board =
        JSON.parse(
          text
        );
    } catch {
      throw new Error(
        "JSON 형식이 올바르지 않습니다."
      );
    }

    const info =
      validateBoard(
        board
      );

    return {
      board,
      info,
    };
  }

  function renderCurrentBoard() {
    currentHost.replaceChildren();

    if (!currentBoard) {
      const empty =
        document.createElement(
          "div"
        );

      empty.className =
        "small";

      empty.textContent =
        "현재 등록된 구역도가 없습니다.";

      currentHost.append(
        empty
      );

      return;
    }

    const title =
      document.createElement(
        "div"
      );

    title.className =
      "group-buy-card-title";

    title.textContent =
      currentBoard.board_id;

    const meta =
      document.createElement(
        "div"
      );

    meta.className =
      "group-buy-meta";

    const updated =
      currentBoard.updated_at
        ? new Date(
            currentBoard.updated_at
          ).toLocaleString(
            "ko-KR",
            {
              timeZone:
                "Asia/Seoul",
            }
          )
        : "-";

    meta.textContent =
      `구역 ${Number(
        currentBoard.region_count ??
        0
      ).toLocaleString()}개 · ` +
      `업데이트 ${updated} KST`;

    currentHost.append(
      title,
      meta
    );
  }

  function renderPendingBoard() {
    if (!pendingBoard) {
      previewHost.textContent =
        "";

      return;
    }

    previewHost.textContent =
      `새 구역도: ${pendingBoard.info.id} · ` +
      `구역 ${pendingBoard.info.regionCount.toLocaleString()}개`;
  }

  async function loadBoard() {
    refreshButton.disabled =
      true;

    setLocalStatus(
      boardStatus,
      "불러오는 중…"
    );

    try {
      const result =
        await request(
          "GET"
        );

      currentBoard =
        result.board ??
        null;

      loaded =
        true;

      renderCurrentBoard();

      setLocalStatus(
        boardStatus,
        ""
      );
    } catch (error) {
      setLocalStatus(
        boardStatus,
        error.message ||
        "현재 구역도를 불러오지 못했습니다.",
        true
      );
    } finally {
      refreshButton.disabled =
        false;
    }
  }

  fileInput.addEventListener(
    "change",
    async () => {
      pendingBoard =
        null;

      renderPendingBoard();

      const file =
        fileInput.files?.[
          0
        ];

      if (!file) {
        return;
      }

      try {
        pendingBoard =
          await readBoardFile(
            file
          );

        renderPendingBoard();

        setLocalStatus(
          replaceStatus,
          ""
        );
      } catch (error) {
        fileInput.value =
          "";

        setLocalStatus(
          replaceStatus,
          error.message,
          true
        );
      }
    }
  );

  replaceButton.addEventListener(
    "click",
    async () => {
      if (!pendingBoard) {
        setLocalStatus(
          replaceStatus,
          "먼저 새 구역도 JSON 파일을 선택하세요.",
          true
        );

        return;
      }

      if (
        currentBoard?.board_id ===
          pendingBoard.info.id
      ) {
        setLocalStatus(
          replaceStatus,
          "새 구역도의 id가 현재 구역도와 같습니다. 구역도를 교체할 때는 새 id를 사용하세요.",
          true
        );

        return;
      }

      const confirmed =
        window.confirm(
          `구역도를 "${pendingBoard.info.id}"(으)로 교체할까요?\n\n` +
          `새 구역: ${pendingBoard.info.regionCount.toLocaleString()}개\n\n` +
          "이 작업을 실행하면 모든 사용자의 기존 색칠 데이터가 즉시 삭제됩니다.\n" +
          "삭제된 색칠 데이터는 복구할 수 없습니다."
        );

      if (!confirmed) {
        return;
      }

      const finalConfirmed =
        window.confirm(
          "정말 교체하시겠습니까?\n\n전 사용자의 색칠 데이터를 전부 삭제하고 새 구역도를 활성화합니다."
        );

      if (!finalConfirmed) {
        return;
      }

      replaceButton.disabled =
        true;
      fileInput.disabled =
        true;

      setLocalStatus(
        replaceStatus,
        "새 구역도를 적용하고 기존 사용자 색칠 데이터를 삭제하는 중…"
      );

      try {
        const result =
          await request(
            "POST",
            {
              action:
                "replace_board",
              board:
                pendingBoard.board,
            }
          );

        const deleted =
          Number(
            result.deleted_user_data_count ??
            0
          );

        fileInput.value =
          "";
        pendingBoard =
          null;

        renderPendingBoard();

        await loadBoard();

        setLocalStatus(
          replaceStatus,
          `구역도를 교체했습니다. 기존 사용자 색칠 데이터 ${deleted.toLocaleString()}건을 삭제했습니다.`
        );
      } catch (error) {
        setLocalStatus(
          replaceStatus,
          error.message ||
          "구역도를 교체하지 못했습니다.",
          true
        );
      } finally {
        replaceButton.disabled =
          false;
        fileInput.disabled =
          false;
      }
    }
  );

  refreshButton.addEventListener(
    "click",
    loadBoard
  );

  coloringTab?.addEventListener(
    "click",
    () => {
      if (!loaded) {
        loadBoard();
      }
    }
  );
})();
