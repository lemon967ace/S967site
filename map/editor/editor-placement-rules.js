export function evaluatePlacementCells(cells, { fixedRanges = [], ranges = [] }) {
  const sets = collectionSets(fixedRanges, ranges);
  const blockedCells = cells.filter(cell => !cellAllowed(cell, sets));
  return { allowed: blockedCells.length === 0, blockedCells: blockedCells.map(cell => [...cell]) };
}

export function cellAllowed(cell, sets) {
  const key = cell.join(",");
  if (sets.fixedBlocked.has(key) || sets.userBlocked.has(key)) return false;
  if (sets.hasFixedAllowed && !sets.fixedAllowed.has(key)) return false;
  if (sets.hasUserAllowed && !sets.userAllowed.has(key)) return false;
  return true;
}

function collectionSets(fixedRanges, ranges) {
  const keys = items => new Set(items.flatMap(range => range.cells.map(cell => cell.join(","))));
  const fixedAllowedRanges = fixedRanges.filter(range => range.kind === "allowed");
  const userAllowedRanges = ranges.filter(range => range.kind === "allowed");
  return {
    fixedBlocked: keys(fixedRanges.filter(range => range.kind === "blocked")),
    userBlocked: keys(ranges.filter(range => range.kind === "blocked")),
    fixedAllowed: keys(fixedAllowedRanges), userAllowed: keys(userAllowedRanges),
    hasFixedAllowed: fixedAllowedRanges.length > 0, hasUserAllowed: userAllowedRanges.length > 0,
  };
}
