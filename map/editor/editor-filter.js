export function createBuildingFilter(document) {
  let typeIds = new Set(document.buildingTypes.map(item => item.id));
  let affiliations = new Set(["", ...document.buildings.map(item => item.affiliation)]);
  let mode = "dim";
  function set(next) { if (next.typeIds) typeIds = new Set(next.typeIds); if (next.affiliations) affiliations = new Set(next.affiliations); if (next.mode) mode = next.mode === "hide" ? "hide" : "dim"; }
  function refreshAffiliations(buildings) { const available = new Set(["", ...buildings.map(item => item.affiliation)]); for (const value of available) if (!affiliations.has(value)) affiliations.add(value); for (const value of [...affiliations]) if (!available.has(value)) affiliations.delete(value); return available; }
  function passes(building) { return typeIds.has(building.typeId) && affiliations.has(building.affiliation); }
  function appearance(building, selectedId = null) { if (building.id === selectedId || passes(building)) return { visible: true, bodyAlpha: 1, labelAlpha: 1, hitTest: true }; return mode === "hide" ? { visible: false, bodyAlpha: 0, labelAlpha: 0, hitTest: false } : { visible: true, bodyAlpha: 0.2, labelAlpha: 0.28, hitTest: true }; }
  function reset(currentDocument = document) { typeIds = new Set(currentDocument.buildingTypes.map(item => item.id)); affiliations = new Set(["", ...currentDocument.buildings.map(item => item.affiliation)]); }
  return { set, reset, refreshAffiliations, passes, appearance, getState: () => ({ typeIds: new Set(typeIds), affiliations: new Set(affiliations), mode }) };
}
