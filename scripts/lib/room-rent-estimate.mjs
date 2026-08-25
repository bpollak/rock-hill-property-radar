const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const roundTo = (value, increment = 25) => Math.round(value / increment) * increment;

function weightedQuantile(values, quantile) {
  const sorted = values.filter(item => Number.isFinite(item.value) && item.weight > 0).sort((a, b) => a.value - b.value);
  const totalWeight = sorted.reduce((sum, item) => sum + item.weight, 0);
  if (!sorted.length || totalWeight <= 0) return null;
  const target = totalWeight * quantile;
  let cumulative = 0;
  for (const item of sorted) {
    cumulative += item.weight;
    if (cumulative >= target) return item.value;
  }
  return sorted.at(-1).value;
}

function zipCode(property) {
  return String(property.address || "").match(/\b(\d{5})(?:-\d{4})?\s*$/)?.[1] || null;
}

function concernMatches(property, pattern) {
  return (property.concerns || []).some(concern => pattern.test(concern));
}

function evidenceMatches(property, pattern) {
  return [...(property.pros || []), ...(property.concerns || [])].some(item => pattern.test(item));
}

function marketZoneForZip(zip, market) {
  return Object.entries(market?.marketZones || {}).find(([, zipCodes]) => zipCodes.includes(zip))?.[0] || "regional-fallback";
}

function subjectProfile(property, market) {
  const rentableRooms = Math.max(0, Number(property.beds || 0) - 1);
  const tenantBathrooms = Math.max(0, Number(property.baths || 0) - 1);
  return {
    zipCode: zipCode(property),
    marketZone: marketZoneForZip(zipCode(property), market),
    rentableRooms,
    tenantBathrooms,
    bathroomType: rentableRooms > 0 && tenantBathrooms >= rentableRooms ? "private" : tenantBathrooms > 0 ? "shared" : "none",
    furnished: false,
    utilitiesIncluded: true,
    parkingDocumented: (property.pros || []).some(item => /parking|driveway|garage/i.test(item)),
    propertyType: property.strategy === "shared-condo" ? "apartment" : "house"
  };
}

function comparableWeight(comparable, subject, market) {
  const comparableZone = marketZoneForZip(comparable.zipCode, market);
  let weight = comparableZone === subject.marketZone ? 1 : 0.18;
  if (comparable.zipCode === subject.zipCode) weight *= 1.8;
  if (comparable.bathroomType === subject.bathroomType) weight *= 1.55;
  else if (comparable.bathroomType === "unknown") weight *= 0.85;
  else weight *= 0.58;
  weight *= comparable.furnished === subject.furnished ? 1.2 : 0.78;
  if (comparable.utilitiesIncluded === subject.utilitiesIncluded) weight *= 1.18;
  else if (comparable.utilitiesIncluded == null) weight *= 0.9;
  else weight *= 0.7;
  weight *= comparable.propertyType === subject.propertyType ? 1.12 : 0.78;
  weight *= comparable.leaseType === "long-term" ? 1.25 : 0.58;
  weight *= comparable.status === "active" ? 1 : 0.75;
  const freshnessDays = Math.max(0, (new Date(`${market.asOf}T12:00:00Z`) - new Date(`${comparable.updatedAsOf}T12:00:00Z`)) / 86400000);
  weight *= freshnessDays <= 30 ? 1 : freshnessDays <= 90 ? 0.85 : 0.6;
  return weight;
}

function propertyAdjustments(property, subject, asOf) {
  const adjustments = [];
  const perBedroomSqft = Number(property.sqft) > 0 && Number(property.beds) > 0 ? property.sqft / property.beds : null;
  if (perBedroomSqft != null) {
    if (perBedroomSqft >= 500) adjustments.push({key:"space", label:"Above-average house space per bedroom", rate:0.04});
    else if (perBedroomSqft < 325) adjustments.push({key:"space", label:"Constrained house space per bedroom", rate:-0.06});
    else if (perBedroomSqft < 375) adjustments.push({key:"space", label:"Below-average house space per bedroom", rate:-0.03});
  }
  const propertyAge = Number.isFinite(property.yearBuilt) ? Number(String(asOf).slice(0, 4)) - property.yearBuilt : null;
  if (propertyAge != null && propertyAge <= 10) adjustments.push({key:"condition", label:"Newer-construction proxy", rate:0.03});
  else if (propertyAge != null && propertyAge >= 60) adjustments.push({key:"condition", label:"Older-condition proxy pending inspection", rate:-0.04});
  if (subject.parkingDocumented) adjustments.push({key:"parking", label:"Parking documented in listing evidence", rate:0.02});
  if (evidenceMatches(property, /private entrance|separate entrance/i)) adjustments.push({key:"entrance", label:"Private entrance documented", rate:0.04});
  if (concernMatches(property, /small.*bedroom|fourth bedroom.*small|common-space.*constrain|layout may constrain/i)) adjustments.push({key:"space-constraint", label:"Room or common-space constraint", rate:-0.04});
  if (/manufactured/i.test(property.propertyType || "")) adjustments.push({key:"property-type", label:"Manufactured-home marketability proxy", rate:-0.05});
  return adjustments;
}

export function validateRoomRentMarket(market) {
  const errors = [];
  if (!market?.asOf || !Array.isArray(market.comparables)) return ["Room-rent market requires asOf and comparables."];
  if (market.targetLease?.roomType !== "private-bedroom") errors.push("Room-rent comparables must be scoped to private bedrooms.");
  if (market.comparables.length < 12) errors.push("Room-rent market requires at least 12 comparables.");
  if (!market.marketZones || Object.keys(market.marketZones).length < 3) errors.push("Room-rent market requires regional market zones.");
  const mappedZips = new Set(Object.values(market.marketZones || {}).flat());
  if (mappedZips.size !== Object.values(market.marketZones || {}).flat().length) errors.push("Room-rent market ZIP codes must map to exactly one zone.");
  const ids = new Set();
  const providerKeys = new Set();
  for (const comparable of market.comparables) {
    if (!comparable.id || ids.has(comparable.id)) errors.push(`Missing or duplicate room-rent comparable id: ${comparable.id || "unknown"}`);
    ids.add(comparable.id);
    const providerKey = `${comparable.provider}:${comparable.providerListingId}`;
    if (!comparable.providerListingId || providerKeys.has(providerKey)) errors.push(`${comparable.id}: duplicate provider listing id.`);
    providerKeys.add(providerKey);
    if (!mappedZips.has(comparable.zipCode)) errors.push(`${comparable.id}: ZIP code is not assigned to a market zone.`);
    if (!Number.isFinite(comparable.monthlyRent) || comparable.monthlyRent < 400 || comparable.monthlyRent > 1600) errors.push(`${comparable.id}: implausible monthly rent.`);
    if (!['private','shared','unknown'].includes(comparable.bathroomType)) errors.push(`${comparable.id}: invalid bathroom type.`);
    if (typeof comparable.furnished !== "boolean") errors.push(`${comparable.id}: furnished must be boolean.`);
    if (![true,false,null].includes(comparable.utilitiesIncluded)) errors.push(`${comparable.id}: utilitiesIncluded must be true, false, or null.`);
    if (!['long-term','medium-term'].includes(comparable.leaseType)) errors.push(`${comparable.id}: invalid lease type.`);
    if (!['active','recently-rented'].includes(comparable.status)) errors.push(`${comparable.id}: invalid status.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(comparable.updatedAsOf || "") || comparable.updatedAsOf > market.asOf) errors.push(`${comparable.id}: invalid or future update date.`);
    if (comparable.accessed !== market.asOf) errors.push(`${comparable.id}: comparable must be rechecked on the market as-of date.`);
    try {
      const url = new URL(comparable.sourceUrl);
      if (!['http:','https:'].includes(url.protocol)) errors.push(`${comparable.id}: invalid source protocol.`);
    } catch { errors.push(`${comparable.id}: invalid source URL.`); }
  }
  if (new Set(market.comparables.map(item => item.provider)).size < 3) errors.push("Room-rent market requires at least three providers.");
  for (const [zone, zipCodes] of Object.entries(market.marketZones || {})) {
    if (!market.comparables.some(comparable => zipCodes.includes(comparable.zipCode))) errors.push(`${zone}: market zone requires at least one current comparable.`);
  }
  return errors;
}

export function estimateRoomRent(property, assumptions, market) {
  if (!property || property.strategy === "rental-benchmark" || property.strategy === "private-purchase") return null;
  const subject = subjectProfile(property, market);
  if (!market?.comparables?.length || subject.rentableRooms === 0) {
    const fallback = assumptions.operations.roomRentFallbackMonthly ?? assumptions.operations.roomRentMonthly ?? 850;
    return {
      asOf: market?.asOf || assumptions.asOf,
      method: "fallback",
      confidence: "low",
      expectedPerRoom: fallback,
      lowPerRoom: roundTo(fallback * 0.8),
      highPerRoom: roundTo(fallback * 1.2),
      roomRents: Array(subject.rentableRooms).fill(fallback),
      totalExpectedMonthly: fallback * subject.rentableRooms,
      totalLowMonthly: roundTo(fallback * 0.8) * subject.rentableRooms,
      totalHighMonthly: roundTo(fallback * 1.2) * subject.rentableRooms,
      compCount: 0,
      exactMatchCount: 0,
      sourceCount: 0,
      comparableIds: [],
      subject,
      adjustments: [],
      caveat: "No current room-level comparable dataset was available; the configured fallback is used."
    };
  }

  const allWeighted = market.comparables.map(comparable => ({
    comparable,
    value: comparable.monthlyRent,
    weight: comparableWeight(comparable, subject, market)
  }));
  const zoneMatches = allWeighted.filter(({comparable}) => marketZoneForZip(comparable.zipCode, market) === subject.marketZone);
  const weighted = zoneMatches.length >= 3 ? zoneMatches : allWeighted;
  const rawBase = weightedQuantile(weighted, 0.5);
  const rawLow = weightedQuantile(weighted, 0.25);
  const rawHigh = weightedQuantile(weighted, 0.75);
  const adjustments = propertyAdjustments(property, subject, market.asOf);
  const adjustmentRate = clamp(adjustments.reduce((sum, adjustment) => sum + adjustment.rate, 0), -0.12, 0.12);
  const expectedPerRoom = roundTo(rawBase * (1 + adjustmentRate));
  const lowPerRoom = Math.min(expectedPerRoom, roundTo(rawLow * (1 + adjustmentRate - 0.03)));
  const highPerRoom = Math.max(expectedPerRoom, roundTo(rawHigh * (1 + adjustmentRate + 0.03)));
  const roomRents = Array(subject.rentableRooms).fill(expectedPerRoom);
  if (subject.rentableRooms >= 3 && concernMatches(property, /small.*bedroom|fourth bedroom.*small/i)) roomRents[roomRents.length - 1] = roundTo(expectedPerRoom * 0.9);
  const exactMatches = zoneMatches.filter(({comparable}) => comparable.zipCode === subject.zipCode && comparable.bathroomType === subject.bathroomType && comparable.leaseType === "long-term");
  const comparableIds = [...weighted].sort((a, b) => b.weight - a.weight).slice(0, 8).map(item => item.comparable.id);
  const sourceCount = new Set(zoneMatches.map(item => item.comparable.provider)).size;
  const spreadRate = rawBase ? (rawHigh - rawLow) / rawBase : 1;
  const confidence = zoneMatches.length >= 8 && exactMatches.length >= 3 && sourceCount >= 2 && spreadRate <= 0.35 ? "medium" : "low";
  return {
    asOf: market.asOf,
    method: "weighted-room-comparables",
    confidence,
    expectedPerRoom,
    lowPerRoom,
    highPerRoom,
    roomRents,
    totalExpectedMonthly: roomRents.reduce((sum, value) => sum + value, 0),
    totalLowMonthly: lowPerRoom * subject.rentableRooms,
    totalHighMonthly: highPerRoom * subject.rentableRooms,
    compCount: zoneMatches.length,
    exactMatchCount: exactMatches.length,
    sourceCount,
    comparableIds,
    subject,
    adjustments,
    caveat: `${zoneMatches.length} current asking-rent comparables in the ${subject.marketZone} zone, not signed leases. Sparse or single-source zones remain low confidence; furnishing and room-specific measurements require confirmation.`
  };
}
