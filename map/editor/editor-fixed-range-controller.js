import { FixedRange } from "./editor-model.js";
import { snapshotRange } from "./editor-history.js";
import { rectangleCells } from "./editor-range.js";

export function createFixedRangeController({
  engine,
  history,
  buildingController = null,
  onChange = () => {},
  onDirty = () => {},
} = {}) {
  let mode = "select";
  let settings = null;
  let startCell = null;
  let previewCells = [];
  let selectedRangeId = null;
  const areaPeers = new Set();

  const emit = () => onChange(api.getState());
  const notify = () => onDirty(!history.isAtSavedState());
  const ensureWritable = () => {
    if (engine.isReadOnly()) throw new Error("The template is read-only.");
  };

  function startCreate(next) {
    ensureWritable();
    for (const peer of areaPeers) peer?.cancel();
    buildingController?.cancelMode();
    settings = {
      kind: next.kind,
      color: next.color,
      priority: Number.isInteger(next.priority) ? next.priority : 0,
    };
    new FixedRange({ ...settings, cells: [[0, 0]] });
    mode = "rangeCreate";
    startCell = null;
    previewCells = [];
    selectedRangeId = null;
    emit();
  }

  function hover(cell) {
    if (mode !== "rangeCreate" || !startCell) return null;
    previewCells = rectangleCells(startCell, cell);
    emit();
    return previewCells;
  }

  function click(cell) {
    if (mode !== "rangeCreate") {
      selectAtCell(cell);
      return { complete: false };
    }

    if (!startCell) {
      startCell = [...cell];
      previewCells = [[...cell]];
      emit();
      return { complete: false };
    }

    /*
      Renderer는 pointerdown과 pointerup에서 모두 click()을 호출한다.
      첫 클릭의 pointerup은 시작점과 같은 셀이므로 여기서는 무시한다.
      이후 다른 셀을 두 번째 꼭짓점으로 클릭하거나 드래그 후 놓으면
      즉시 범위를 확정한다.
    */
    const sameAsStart =
      cell[0] === startCell[0] &&
      cell[1] === startCell[1] &&
      previewCells.length <= 1;

    if (sameAsStart) {
      emit();
      return { complete: false };
    }

    previewCells = rectangleCells(startCell, cell);
    emit();

    const cells = previewCells.map(value => [...value]);
    const result = commit();

    return {
      complete: Boolean(result),
      cells,
      result,
    };
  }

  function commit() {
    ensureWritable();
    if (mode !== "rangeCreate" || !startCell || !previewCells.length) return null;

    const before = engine.getDocument().fixedRanges.map(snapshotRange);
    const result = engine.commitFixedRange({ ...settings, cells: previewCells });
    const after = engine.getDocument().fixedRanges.map(snapshotRange);
    if (!result.accepted.length) return null;

    selectedRangeId = after.at(-1)?.id ?? null;
    mode = "select";
    startCell = null;
    previewCells = [];

    history.record({
      description: "fixedRangeCreate",
      undo() {
        engine.restoreFixedRanges(before);
        selectedRangeId = null;
      },
      redo() {
        engine.restoreFixedRanges(after);
        selectedRangeId = after.at(-1)?.id ?? null;
      },
    });

    notify();
    emit();
    return result;
  }

  function selectAtCell(cell) {
    const ranges = [...engine.getDocument().fixedRanges]
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    selectedRangeId = [...ranges].reverse().find(item =>
      item.cells.some(value => value[0] === cell[0] && value[1] === cell[1])
    )?.id ?? null;
    emit();
    return selected();
  }

  function editSelected(changes = {}) {
    ensureWritable();
    const item = selected();
    if (!item) return null;
    const before = engine.getDocument().fixedRanges.map(snapshotRange);
    const edited = engine.editFixedRange(item.id, changes);
    const after = engine.getDocument().fixedRanges.map(snapshotRange);

    history.record({
      description: "fixedRangeEdit",
      undo() {
        engine.restoreFixedRanges(before);
        selectedRangeId = item.id;
      },
      redo() {
        engine.restoreFixedRanges(after);
        selectedRangeId = item.id;
      },
    });

    notify();
    emit();
    return edited;
  }

  function deleteSelected() {
    ensureWritable();
    const item = selected();
    if (!item) return null;
    const before = engine.getDocument().fixedRanges.map(snapshotRange);
    const deleted = engine.deleteFixedRange(item.id);
    const after = engine.getDocument().fixedRanges.map(snapshotRange);

    history.record({
      description: "fixedRangeDelete",
      undo() {
        engine.restoreFixedRanges(before);
        selectedRangeId = item.id;
      },
      redo() {
        engine.restoreFixedRanges(after);
        selectedRangeId = null;
      },
    });

    selectedRangeId = null;
    notify();
    emit();
    return deleted;
  }

  function cancel() {
    mode = "select";
    settings = null;
    startCell = null;
    previewCells = [];
    emit();
  }

  function selected() {
    return engine.getDocument().fixedRanges.find(item => item.id === selectedRangeId) ?? null;
  }

  function normalizeSelection() {
    if (selectedRangeId && !selected()) selectedRangeId = null;
    return selectedRangeId;
  }

  function undo() {
    const command = history.undo();
    if (!command) return null;
    mode = "select";
    previewCells = [];
    normalizeSelection();
    notify();
    emit();
    return command;
  }

  function redo() {
    const command = history.redo();
    if (!command) return null;
    mode = "select";
    previewCells = [];
    normalizeSelection();
    notify();
    emit();
    return command;
  }

  const api = {
    startCreate,
    hover,
    click,
    commit,
    selectAtCell,
    editSelected,
    deleteSelected,
    cancel,
    undo,
    redo,
    normalizeSelection,
    addAreaPeer(value) {
      areaPeers.add(value);
    },
    getSelectedRange: selected,
    getState: () => ({
      mode,
      settings: settings && { ...settings },
      startCell: startCell && [...startCell],
      previewCells: previewCells.map(cell => [...cell]),
      selectedRangeId,
    }),
  };

  return api;
}
