import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { enrichFinancials } from "./lib/finance.mjs";
import { ageRiskProfile } from "./lib/age-risk.mjs";
import { roomRentabilityProfile } from "./lib/room-rentability.mjs";
import { qualificationProfile, scoreProperty } from "./lib/scoring.mjs";
import { meetsMinimumYearBuilt } from "./lib/property-eligibility.mjs";
import { estimateRoomRent } from "./lib/room-rent-estimate.mjs";

const root = new URL("../", import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, root), "utf8"));
const dataset = await readJson("data/current.json");
const assumptions = await readJson("config/public-assumptions.json");
const sourcePolicy = await readJson("config/source-policy.json");
const roomRentMarket = await readJson("config/room-rent-comps.json");
const modelAssumptions = { ...assumptions, asOf: dataset.asOf };

const eligibleProperties = dataset.properties.filter(property => meetsMinimumYearBuilt(property, modelAssumptions));
const properties = eligibleProperties.map(property => {
  const roomRentEstimate = estimateRoomRent(property, modelAssumptions, roomRentMarket);
  const financials = enrichFinancials(property, modelAssumptions, roomRentEstimate);
  const qualification = qualificationProfile(property, modelAssumptions, financials);
  const recommendation = qualification.status;
  const score = scoreProperty(property, financials, modelAssumptions);
  const ageRisk = ageRiskProfile(property, modelAssumptions);
  const roomRentability = roomRentabilityProfile(property, modelAssumptions);
  const maximumOfferPrice = modelAssumptions.purchase.maximumOfferPrice;
  const offer = {
    maximumOfferPrice,
    modeledPurchasePrice: Math.min(property.price, maximumOfferPrice),
    aboveCeiling: property.strategy !== "rental-benchmark" && property.price > maximumOfferPrice,
    requiredDiscount: property.strategy !== "rental-benchmark" && property.price > maximumOfferPrice ? (property.price - maximumOfferPrice) / property.price : 0
  };
  return { ...property, recommendation, qualification, financials, score, ageRisk, roomRentability, roomRentEstimate, offer };
});

const appData = { ...dataset, properties, assumptions: modelAssumptions, sourcePolicy, roomRentMarket, generatedAt: new Date().toISOString() };
const dist = new URL("dist/", root);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(new URL("public/", root), dist, { recursive: true });
await mkdir(new URL("dist/data/", root), { recursive: true });
await writeFile(new URL("dist/data/app-data.json", root), `${JSON.stringify(appData, null, 2)}\n`);
await writeFile(new URL("dist/.nojekyll", root), "");
const filteredCount = dataset.properties.length - eligibleProperties.length;
console.log(`Built ${properties.length} source-backed options for ${dataset.asOf}; filtered ${filteredCount} purchase properties built before ${modelAssumptions.livingRequirements.minimumYearBuilt}.`);
