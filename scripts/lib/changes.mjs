export const MATERIAL_FIELDS = ["price", "status", "beds", "baths", "privateBath", "hoa.roomRental"];

function get(object, path) {
  return path.split(".").reduce((value, key) => value?.[key], object);
}

export function diffProperty(previous, current) {
  if (!previous) return [{ field: "listing", from: null, to: "added", label: "New listing" }];
  return MATERIAL_FIELDS.flatMap(field => {
    const from = get(previous, field);
    const to = get(current, field);
    return from === to ? [] : [{ field, from, to, label: `${field} changed` }];
  });
}

export function classifyProperty(previous, current) {
  if (!previous) return "new";
  return diffProperty(previous, current).length ? "changed" : "existing";
}
