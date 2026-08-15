import { diffProperty } from "./changes.mjs";

const REMOVED_STATUSES = new Set(["inactive", "sold", "off-market", "off market", "withdrawn", "expired", "removed"]);

export function isRemovedFromMarket(property) {
  return REMOVED_STATUSES.has(String(property?.status || "").trim().toLowerCase());
}

export function reconcileProperties(previousProperties, researchedProperties, today) {
  const priorById = new Map(previousProperties.map(property => [property.id, property]));
  const seenIds = new Set();
  const reconciled = researchedProperties.map(property => {
    const prior = priorById.get(property.id);
    const changes = diffProperty(prior, property);
    seenIds.add(property.id);
    return {
      ...property,
      status: property.status || "active",
      firstSeen: prior?.firstSeen || today,
      lastSeen: today,
      lastChanged: changes.length ? today : prior?.lastChanged || today,
      changeCategory: prior ? (changes.length ? "changed" : "existing") : "new",
      changeHistory: changes.length ? [...(prior?.changeHistory || []), {date:today, changes}] : (prior?.changeHistory || []),
      missingRuns: 0
    };
  });

  for (const prior of previousProperties) {
    if (seenIds.has(prior.id)) continue;
    reconciled.push({
      ...prior,
      missingRuns: (prior.missingRuns || 0) + 1,
      changeCategory: "existing"
    });
  }

  return reconciled;
}
