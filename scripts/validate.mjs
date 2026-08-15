import { access, readFile } from "node:fs/promises";
import { validateDataset } from "./lib/schema.mjs";

const root = new URL("../", import.meta.url);
const dataset = JSON.parse(await readFile(new URL("data/current.json", root), "utf8"));
const assumptions = JSON.parse(await readFile(new URL("config/public-assumptions.json", root), "utf8"));
const sourcePolicy = JSON.parse(await readFile(new URL("config/source-policy.json", root), "utf8"));
const errors = validateDataset(dataset);
const serialized = JSON.stringify(dataset).toLowerCase();

if (process.env.FAMILY_ANCHOR_ADDRESS && serialized.includes(process.env.FAMILY_ANCHOR_ADDRESS.toLowerCase())) errors.push("Private family anchor appears in public dataset.");
if (dataset.runStatus !== "successful") errors.push("Only the last successful research snapshot may be published.");
if (dataset.properties.filter(p => p.strategy !== "rental-benchmark").length < 3) errors.push("At least three actual purchase candidates are required.");
if (assumptions.comparison.forwardHurdleRate !== 0.07) errors.push("Forward hurdle must remain 7% unless deliberately revised.");
if (assumptions.purchase.maximumOfferPrice !== 275000) errors.push("Maximum offer price must remain $275,000 unless deliberately revised.");
if (assumptions.livingRequirements?.maximumDrivingMiles !== 30) errors.push("Maximum driving distance must remain 30 miles unless deliberately revised.");
if (assumptions.livingRequirements?.minimumYearBuilt !== 1980) errors.push("Minimum construction year must remain 1980 unless deliberately revised.");
if (assumptions.livingRequirements?.privateBedroom !== true || assumptions.livingRequirements?.privateFullBathroom !== true) errors.push("Private bedroom and private full bathroom must remain required.");
if (!Array.isArray(assumptions.ageRisk?.bands) || assumptions.ageRisk.bands.length < 3) errors.push("Age-risk model requires at least three configured bands.");
for (const [index, band] of (assumptions.ageRisk?.bands || []).entries()) {
  if (!Number.isFinite(band.maxAge) || band.maxAge <= 0) errors.push(`Age-risk band ${index + 1} requires a positive maxAge.`);
  if (!Number.isFinite(band.reserveMultiplier) || band.reserveMultiplier <= 0) errors.push(`Age-risk band ${index + 1} requires a positive reserveMultiplier.`);
  if (!Number.isFinite(band.scorePenalty) || band.scorePenalty < 0 || band.scorePenalty > 100) errors.push(`Age-risk band ${index + 1} has an invalid scorePenalty.`);
}
const roomFactorWeights = Object.values(assumptions.roomRentability?.factorWeights || {});
if (roomFactorWeights.length !== 5 || Math.abs(roomFactorWeights.reduce((sum, value) => sum + value, 0) - 1) > 0.000001) errors.push("Room-rentability factor weights must contain five factors totaling 100%.");
if (!Number.isFinite(assumptions.roomRentability?.unknownAuthorityScoreCap) || assumptions.roomRentability.unknownAuthorityScoreCap >= 50) errors.push("Unknown room-rental authority must cap likelihood below 50.");
for (const section of ["listingDiscovery", "propertyVerification", "rentEvidence"]) {
  if (!Array.isArray(sourcePolicy[section]) || sourcePolicy[section].length === 0) errors.push(`Source policy requires ${section}.`);
}
for (const property of dataset.properties) {
  try {
    const primary = new URL(property.sourceUrl);
    if (!['http:','https:'].includes(primary.protocol)) errors.push(`${property.id}: invalid primary-source protocol`);
  } catch { errors.push(`${property.id}: invalid primary-source URL`); }
  for (const source of property.sources || []) {
    try {
      const url = new URL(source.url);
      if (!['http:','https:'].includes(url.protocol)) errors.push(`${property.id}: invalid source protocol`);
    } catch { errors.push(`${property.id}: invalid source URL`); }
  }
  if (property.strategy === "shared-condo" && property.hoa.roomRental === "allowed" && property.hoa.evidence.length === 0) errors.push(`${property.id}: condo room rental cannot be allowed without evidence.`);
  if (property.strategy !== "rental-benchmark" && (!Number.isFinite(property.yearBuilt) || property.yearBuilt < 1700 || property.yearBuilt > Number(dataset.asOf.slice(0, 4)) + 1)) errors.push(`${property.id}: credible yearBuilt is required for age-risk scoring.`);
  if (property.privateBath === "yes" && property.strategy !== "rental-benchmark" && !property.concerns && !property.pros) errors.push(`${property.id}: suitability evidence missing.`);
}
for (const source of dataset.methodologySources || []) {
  try {
    const url = new URL(source.url);
    if (!['http:','https:'].includes(url.protocol)) errors.push(`Invalid methodology-source protocol: ${source.label}`);
  } catch { errors.push(`Invalid methodology-source URL: ${source.label}`); }
}
for (const required of ["public/index.html","public/styles.css","public/app.js"]) {
  try { await access(new URL(required, root)); } catch { errors.push(`Missing required asset: ${required}`); }
}
if (errors.length) {
  console.error(errors.map(error => `- ${error}`).join("\n"));
  process.exit(1);
}
console.log(`Validated ${dataset.properties.length} real options, ${dataset.properties.reduce((n,p) => n + p.sources.length, 0)} listing/rental sources, and public privacy controls.`);
