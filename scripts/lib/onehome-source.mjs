export const ONEHOME_SOURCE_ID = "onehome-canopy-saved-search";
export const ONEHOME_PUBLIC_URL = "https://portal.onehome.com/";
const ONEHOME_PROPERTY_PATH = /^\/en-US\/property\/aotf~\d+~CANOPY$/;

const numberFrom = value => value == null || value === "" ? null : Number(String(value).replace(/[^0-9.]/g, ""));
const stricterStatuses = new Set(["pending", "contingent"]);

export function normalizePropertyAddress(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/#/g, " unit ")
    .replace(/\b(apartment|apt)\b/g, " unit ")
    .replace(/\bstreet\b/g, "st")
    .replace(/\broad\b/g, "rd")
    .replace(/\bdrive\b/g, "dr")
    .replace(/\bcourt\b/g, "ct")
    .replace(/\bcircle\b/g, "cir")
    .replace(/\bparkway\b/g, "pkwy")
    .replace(/\blane\b/g, "ln")
    .replace(/\bavenue\b/g, "ave")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function oneHomeStatus(value) {
  const status = String(value || "").toLowerCase();
  if (status.includes("pending")) return "pending";
  if (status.includes("contingent") || status.includes("under contract")) return "contingent";
  if (status.includes("sold") || status.includes("closed")) return "sold";
  if (status.includes("off market") || status.includes("inactive")) return "off-market";
  return "active";
}

export function assertSanitizedOneHomeSnapshot(snapshot) {
  if (snapshot?.contract !== "onehome-snapshot-v1") throw new Error("OneHome snapshot contract must be onehome-snapshot-v1.");
  if (snapshot?.sourceId !== ONEHOME_SOURCE_ID) throw new Error(`OneHome snapshot sourceId must be ${ONEHOME_SOURCE_ID}.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot?.asOf || "")) throw new Error("OneHome snapshot requires an ISO asOf date.");
  if (!Array.isArray(snapshot?.properties)) throw new Error("OneHome snapshot requires a properties array.");
  const serialized = JSON.stringify(snapshot);
  if (/token=|eyJPU04i|contactid|setkey|@gmail\.com/i.test(serialized)) throw new Error("OneHome snapshot contains a token or private access marker.");
  for (const detail of snapshot.properties) if (detail.path && !ONEHOME_PROPERTY_PATH.test(detail.path)) throw new Error("OneHome snapshot contains an invalid or access-bearing property path.");
  return snapshot;
}

function propertyUrl(path) {
  return path && ONEHOME_PROPERTY_PATH.test(path) ? new URL(path, ONEHOME_PUBLIC_URL).toString() : ONEHOME_PUBLIC_URL;
}

function sourceRecord(asOf, path) {
  return {label:"User-authorized Canopy MLS property listing via OneHome", url:propertyUrl(path), accessed:asOf};
}

function buildImportedProperty(detail, asOf) {
  const price = numberFrom(detail.price);
  const beds = numberFrom(detail.beds ?? detail.bd);
  const baths = numberFrom(detail.baths ?? detail.ba);
  const sqft = numberFrom(detail.sqft);
  const originalPrice = numberFrom(detail.originalPrice ?? detail.previousPrice) || price;
  const propertyType = detail.propertyType || detail.type || "Single Family Residence";
  const condo = /townhouse|condominium/i.test(propertyType);
  const hoaMonthly = numberFrom(detail.hoaMonthly) || 0;
  const oneLevel = detail.oneLevel === true || /\b(ranch|one[- ]level|single[- ]story|single level)\b/i.test(detail.remarks || "");
  const concerns = [
    "A private full bathroom reserved for the family occupant has not been independently documented",
    "Local zoning, occupancy, registration, and separate-room lease authority remain unresolved",
    "Parcel, deed, permit closeout, flood status, insurance eligibility, and material system ages remain unverified",
    "Independent public status corroboration and transfer chronology remain incomplete"
  ];
  if (condo || hoaMonthly) concerns.push("Controlling HOA or condominium documents and separate-room rental authority have not been obtained");
  if (!oneLevel) concerns.push("A one-level layout is not established by the available listing facts");
  if (price > 275000) concerns.push("The list price exceeds the $275,000 maximum offer; seller acceptance at the ceiling is unresolved");
  return {
    id: `mls-${detail.mls}`,
    strategy: condo ? "shared-condo" : "shared-home",
    changeCategory: "new",
    firstSeen: asOf,
    lastSeen: asOf,
    lastChanged: asOf,
    address: detail.address,
    sourceUrl: propertyUrl(detail.path),
    mls: String(detail.mls),
    status: oneHomeStatus(detail.status),
    price,
    originalPrice,
    priceCutPercent: originalPrice > price ? Number((((originalPrice - price) / originalPrice) * 100).toFixed(1)) : 0,
    beds,
    baths,
    sqft,
    pricePerSqft: sqft ? Math.round(price / sqft) : null,
    marketPricePerSqft: null,
    yearBuilt: detail.yearBuilt,
    propertyType,
    hoaMonthly,
    oneLevel,
    privateBath: "unknown",
    roomRentalLegal: "unknown",
    daysOnMarket: numberFrom(detail.daysOnMarket) || 0,
    distanceMiles: detail.distanceMiles,
    driveMinutes: detail.driveMinutes,
    distanceMethod: "ArcGIS public geocoding with OSRM public driving-route estimate from the private family reference property",
    distanceAsOf: asOf,
    distanceLabel: `${detail.distanceMiles.toFixed(1)} miles · about ${detail.driveMinutes} minutes from the family reference property`,
    summary: `${beds}-bedroom, ${baths}-bath ${propertyType.toLowerCase()} listed at $${price.toLocaleString("en-US")} under Canopy MLS ${detail.mls}. Private-bath allocation and separate-room rental authority remain unresolved.`,
    pros: [`${beds} bedrooms and ${baths} bathrooms are reported`, `${detail.yearBuilt} construction meets the configured minimum-year rule`, `${detail.distanceMiles.toFixed(1)} verified driving miles from the family reference property`],
    concerns,
    sourceConflicts: [],
    hoa: {exists: condo || hoaMonthly ? true : null, wholeUnitRental:"unknown", roomRental:"unknown", evidence:[], confidence:"low", followUp:"Obtain governing documents and written confirmation for the proposed occupancy and separate-room lease structure."},
    listingHistory: [{date:asOf, event:"Imported from user-authorized Canopy MLS saved search", price}],
    sources: [sourceRecord(asOf, detail.path)],
    changeHistory: [],
    missingRuns: 0
  };
}

function updateExistingProperty(property, detail, asOf) {
  const changes = [];
  const price = numberFrom(detail.price);
  const incomingStatus = oneHomeStatus(detail.status);
  const nextStatus = stricterStatuses.has(property.status) && incomingStatus === "active" ? property.status : incomingStatus;
  const update = (field, value, label) => {
    if (value == null || JSON.stringify(property[field]) === JSON.stringify(value)) return;
    changes.push({field, from:property[field] ?? null, to:value, label});
    property[field] = value;
  };
  update("price", price, "Canopy MLS saved-search price reconciliation");
  update("status", nextStatus, "Canopy MLS saved-search status reconciliation");
  update("beds", numberFrom(detail.beds ?? detail.bd), "bedroom count reconciled");
  update("baths", numberFrom(detail.baths ?? detail.ba), "bathroom count reconciled");
  update("sqft", numberFrom(detail.sqft), "square footage reconciled");
  update("yearBuilt", detail.yearBuilt, "construction year reconciled");
  if (detail.hoaMonthly != null) update("hoaMonthly", numberFrom(detail.hoaMonthly), "HOA dues reconciled");
  property.lastSeen = asOf;
  property.missingRuns = 0;
  property.distanceMiles = detail.distanceMiles;
  property.driveMinutes = detail.driveMinutes;
  property.distanceAsOf = asOf;
  property.distanceMethod = "ArcGIS public geocoding with OSRM public driving-route estimate from the private family reference property";
  property.distanceLabel = `${detail.distanceMiles.toFixed(1)} miles · about ${detail.driveMinutes} minutes from the family reference property`;
  property.pricePerSqft = property.sqft ? Math.round(property.price / property.sqft) : null;
  property.sources ||= [];
  const oneHomeSource = property.sources.find(source => /OneHome|user-authorized Canopy MLS/i.test(source.label || ""));
  if (oneHomeSource && detail.path) Object.assign(oneHomeSource, sourceRecord(asOf, detail.path));
  else if (!oneHomeSource) property.sources.push(sourceRecord(asOf, detail.path));
  if (detail.path && property.sourceUrl === ONEHOME_PUBLIC_URL) property.sourceUrl = propertyUrl(detail.path);
  if (changes.length) {
    property.changeCategory = "changed";
    property.lastChanged = asOf;
    property.changeHistory ||= [];
    property.changeHistory.push({date:asOf, changes});
  }
  return changes;
}

export function mergeOneHomeSnapshot(dataset, rawSnapshot) {
  const snapshot = assertSanitizedOneHomeSnapshot(rawSnapshot);
  const next = structuredClone(dataset);
  const byMls = new Map(next.properties.filter(property => property.mls).map(property => [String(property.mls), property]));
  const byAddress = new Map(next.properties.map(property => [normalizePropertyAddress(property.address), property]));
  const seen = new Set();
  const result = {added:[], updated:[], withheld:[]};
  for (const detail of snapshot.properties) {
    const key = `${detail.mls}|${normalizePropertyAddress(detail.address)}`;
    if (seen.has(key)) { result.withheld.push({mls:detail.mls, reason:"duplicate supplied record"}); continue; }
    seen.add(key);
    if (!detail.mls || !detail.address || !Number.isFinite(numberFrom(detail.price)) || !Number.isFinite(detail.yearBuilt) || !Number.isFinite(detail.distanceMiles) || !Number.isFinite(detail.driveMinutes)) {
      result.withheld.push({mls:detail.mls || null, address:detail.address || null, reason:"required import evidence missing"});
      continue;
    }
    const existing = byMls.get(String(detail.mls)) || byAddress.get(normalizePropertyAddress(detail.address));
    if (existing) {
      const changes = updateExistingProperty(existing, detail, snapshot.asOf);
      result.updated.push({id:existing.id, mls:String(detail.mls), changes:changes.length});
      continue;
    }
    const property = buildImportedProperty(detail, snapshot.asOf);
    next.properties.push(property);
    byMls.set(property.mls, property);
    byAddress.set(normalizePropertyAddress(property.address), property);
    result.added.push({id:property.id, mls:property.mls});
  }
  next.importSummary = {source:"User-authorized OneHome/Canopy MLS saved search; private token omitted", asOf:snapshot.asOf, supplied:snapshot.properties.length, matchedExisting:result.updated.length, added:result.added.length, withheld:result.withheld.length, deduplication:"MLS number first, normalized street address second"};
  return {dataset:next, ...result};
}
