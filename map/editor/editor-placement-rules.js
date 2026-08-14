export function evaluatePlacementCells(cells, { fixedRanges = [], ranges = [] }) {
  const sets = collectionSets(fixedRanges, ranges);
  const blockedCells = cells.filter(cell => !cellAllowed(cell, sets));
  return { allowed: blockedCells.length === 0, blockedCells: blockedCells.map(cell => [...cell]) };
}

export function cellAllowed(cell, sets) {
  const key = cell.join(",");

  /*
    범위 의미:
    - blocked: 건설 불가
    - allowed: 건설 가능 표시
    - 아무 범위도 없는 흰색 셀: 기본적으로 건설 가능

    즉 allowed 범위가 존재한다고 해서 그 바깥의 미지정 셀을
    자동으로 금지하지 않는다. 실제 금지 판정은 blocked만 한다.
  */
  if (
    sets.fixedBlocked.has(key) ||
    sets.userBlocked.has(key)
  ) {
    return false;
  }

  return true;
}

function collectionSets(fixedRanges, ranges) {
  const keys = items =>
    new Set(
      items.flatMap(
        range =>
          range.cells.map(
            cell => cell.join(",")
          )
      )
    );

  return {
    fixedBlocked:
      keys(
        fixedRanges.filter(
          range =>
            range.kind === "blocked"
        )
      ),

    userBlocked:
      keys(
        ranges.filter(
          range =>
            range.kind === "blocked"
        )
      ),
  };
}
