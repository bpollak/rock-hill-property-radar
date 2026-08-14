export const STRATEGIES = new Set(["shared-home", "shared-condo", "private-purchase", "rental-benchmark"]);

export function validateDataset(dataset) {
  const errors = [];
  if (!dataset.asOf || !Array.isArray(dataset.properties)) errors.push("Dataset requires asOf and properties.");
  const ids = new Set();
  for (const property of dataset.properties || []) {
    if (!property.id || ids.has(property.id)) errors.push(`Missing or duplicate id: ${property.id || "unknown"}`);
    ids.add(property.id);
    if (!STRATEGIES.has(property.strategy)) errors.push(`${property.id}: invalid strategy`);
    if (!property.address || !property.sourceUrl) errors.push(`${property.id}: address and sourceUrl required`);
    if (!Array.isArray(property.sources) || property.sources.length === 0) errors.push(`${property.id}: at least one source required`);
    if (property.strategy !== "rental-benchmark" && (!Number.isFinite(property.price) || property.price <= 0)) errors.push(`${property.id}: price must be positive`);
    if (property.strategy !== "rental-benchmark") {
      if (!Number.isFinite(property.distanceMiles) || property.distanceMiles < 0 || property.distanceMiles > 30) errors.push(`${property.id}: distanceMiles must be a verified driving distance within 30 miles`);
      if (!Number.isFinite(property.driveMinutes) || property.driveMinutes <= 0) errors.push(`${property.id}: positive driveMinutes required`);
      if (!property.distanceAsOf || !property.distanceMethod || !property.distanceLabel) errors.push(`${property.id}: route date, method, and public distance label required`);
    }
  }
  return errors;
}
