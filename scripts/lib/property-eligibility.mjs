export const DEFAULT_MINIMUM_YEAR_BUILT = 1980;

export function minimumYearBuilt(assumptions = {}) {
  return assumptions.livingRequirements?.minimumYearBuilt ?? DEFAULT_MINIMUM_YEAR_BUILT;
}

export function meetsMinimumYearBuilt(property, assumptions = {}) {
  if (property.strategy === "rental-benchmark") return true;
  return Number.isFinite(property.yearBuilt) && property.yearBuilt >= minimumYearBuilt(assumptions);
}
