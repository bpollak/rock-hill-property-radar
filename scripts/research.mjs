import OpenAI from "openai";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { validateDataset } from "./lib/schema.mjs";
import { isRemovedFromMarket, reconcileProperties } from "./lib/listing-lifecycle.mjs";
import { meetsMinimumYearBuilt, minimumYearBuilt } from "./lib/property-eligibility.mjs";

const root = new URL("../", import.meta.url);
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const anchor = process.env.FAMILY_ANCHOR_ADDRESS;
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for daily research.");
if (!anchor) throw new Error("FAMILY_ANCHOR_ADDRESS is required and must be stored as a repository secret.");

const previous = JSON.parse(await readFile(new URL("data/current.json", root), "utf8"));
const sourcePolicy = JSON.parse(await readFile(new URL("config/source-policy.json", root), "utf8"));
const assumptions = JSON.parse(await readFile(new URL("config/public-assumptions.json", root), "utf8"));
const minimumConstructionYear = minimumYearBuilt(assumptions);
const eligiblePreviousProperties = previous.properties.filter(property => meetsMinimumYearBuilt(property, assumptions));
const known = eligiblePreviousProperties.filter(p => p.strategy !== "rental-benchmark" && !isRemovedFromMarket(p)).map(p => ({id:p.id,address:p.address,mls:p.mls,sourceUrl:p.sourceUrl,status:p.status,price:p.price,yearBuilt:p.yearBuilt}));
const prompt = `You are the daily real-estate research analyst for a private family decision. Research actual, currently marketed options within 30 driving miles of the private anchor supplied below. Never repeat the anchor in your output.

PRIVATE ANCHOR: ${anchor}
RUN DATE: ${today}

Decision requirements:
- Rock Hill area is preferred; absolute maximum 30 driving miles.
- Purchase candidates must have a documented year built of ${minimumConstructionYear} or later. Exclude properties built before ${minimumConstructionYear}, and do not return purchase candidates with an unknown construction year.
- For every purchase candidate, calculate the fastest driving route from the private anchor and return distanceMiles, driveMinutes, distanceAsOf, distanceMethod, and a distanceLabel that says only the mileage and approximate drive time from the "family reference property." Never return the anchor address, its coordinates, a route URL containing it, or any other reversible location identifier. Reject candidates beyond 30 driving miles.
- Mother-in-law must have her own bedroom and private full bathroom. Unknown is acceptable only when explicitly marked unknown.
- She accepts unrelated housemates and stairs.
- Strategies: shared-home, shared-condo, private-purchase, rental-benchmark.
- $275,000 is the absolute maximum offer price. Prioritize listings at or below $275,000. A listing above $275,000 may be retained only when current pricing history or market exposure makes an accepted offer at or below $275,000 credible; explicitly calculate the required seller discount and flag seller acceptance as unresolved. Never model or recommend an offer above $275,000.
- For condos, separately research whole-unit and individual-room rental authority. Do not infer permission from silence. Use allowed, restricted, prohibited, or unknown. Record governing-document or written-management evidence. Unknown must remain unknown.
- For every shared-house or shared-condo strategy, research and summarize the room-rental viability factors used by the model: local zoning/occupancy/registration and separate-room lease authority; HOA authority where applicable; legal bedroom count and egress; bathrooms remaining for tenants after the private family suite; parking capacity; maximum occupant and septic/sewer capacity; smoke/CO and rental-inspection readiness; utilities and common-space practicality; property-specific and local room-demand evidence; condition and insurance constraints. Unknown evidence must remain unknown and reduce the room-rental likelihood. A prohibition must result in zero underwritten room income. Do not present the heuristic likelihood as an empirical probability.
- Capture current list price, original price, beds, full baths, square feet, year, type, HOA dues, days on market, listing history, taxes if reliable, price per square foot, market comparison, private-bath evidence, pros, concerns, source conflicts, and source URLs.
- Capture any publicly documented mandatory recurring or transaction-specific charges, including HOA dues, special assessments, association transfer or capital-contribution fees, land or lot rent, mandatory amenity fees, and builder fees. Put material fees in concerns and source them. If unavailable, say unknown rather than assuming zero.
- Capture and verify year built for every purchase candidate. Research public permit records and listing evidence for the roof, HVAC, water heater, electrical service, supply and waste plumbing, sewer or septic, foundation or structural work, and major renovations. Distinguish listing claims from verified permits, invoices, warranties, and system installation dates. Never treat “renovated” as proof that major systems were replaced. Flag missing system ages and permits for follow-up.
- Recheck every known candidate and discover credible new ones: ${JSON.stringify(known)}
- Return every known candidate unless a public source confirms it is sold, withdrawn, expired, or otherwise off market. Do not omit a known listing merely because it is unchanged or difficult to recheck. Preserve active, contingent, and pending statuses. When removal is confirmed, return the property with status "inactive" and include the supporting source.
- Include a current Rock Hill studio/one-bedroom rental benchmark and current room-rent evidence.
- Prefer MLS-fed portals for listing status, official government sources for rules and taxes, recorded HOA documents for restrictions, and primary market sources for investment benchmarks.
- Audit every source category in this source policy on every run. A category with no matching inventory is a valid zero result, but it must not be silently skipped: ${JSON.stringify(sourcePolicy)}
- Do not request, require, or attempt to obtain third-party credentials, paid API keys, broker exports, or direct MLS access. Categories marked not-used are documented limitations, not run failures.
- Reconcile Realtor.com, Redfin, Zillow, Homes.com, Movoto, indexed brokerage/IDX pages, builder inventory, government/GSE inventory, owner-listed inventory, and public auction sources rather than claiming exhaustive MLS coverage.
- Do not output assumptions as facts. Do not invent citations. A source URL must support the corresponding claim.

Return JSON only, with top-level keys market, properties, and methodologySources. Each property must use the same field names and nesting as the examples in the known dataset. Use a stable id of mls-<number> when MLS is available. Include sources as [{label,url,accessed}]. Include hoa as {exists,wholeUnitRental,roomRental,evidence,confidence,followUp}. Include listingHistory, pros, concerns, sourceConflicts, distanceMiles, driveMinutes, distanceAsOf, distanceMethod, distanceLabel, privateBath, roomRentalLegal, priceCutPercent, and marketPricePerSqft. Do not include the private anchor.`;

const client = new OpenAI();
const response = await client.responses.create({
  model: process.env.OPENAI_RESEARCH_MODEL || "gpt-5.6",
  reasoning: { effort: "high" },
  tools: [{
    type: "web_search",
    search_context_size: "high",
    user_location: { type: "approximate", city: "Rock Hill", region: "South Carolina", country: "US", timezone: "America/New_York" }
  }],
  input: prompt
});

const output = response.output_text || "";
const start = output.indexOf("{");
const end = output.lastIndexOf("}");
if (start < 0 || end <= start) throw new Error("Research response did not contain a JSON object.");
const researched = JSON.parse(output.slice(start, end + 1));
if (!Array.isArray(researched.properties)) throw new Error("Research response omitted properties.");

const eligibleResearchedProperties = researched.properties.filter(property => meetsMinimumYearBuilt(property, assumptions));
const reconciledProperties = reconcileProperties(eligiblePreviousProperties, eligibleResearchedProperties, today);

const next = {
  asOf: today,
  runStatus: "successful",
  researchMethod: previous.researchMethod,
  market: researched.market || previous.market,
  properties: reconciledProperties,
  methodologySources: researched.methodologySources || previous.methodologySources
};
const errors = validateDataset(next);
const serialized = JSON.stringify(next).toLowerCase();
if (serialized.includes(anchor.toLowerCase())) errors.push("Research output leaked the private anchor.");
if (next.properties.filter(p => p.strategy !== "rental-benchmark" && !isRemovedFromMarket(p)).length < 3) errors.push("Research returned fewer than three currently marketed purchase candidates.");
if (errors.length) throw new Error(`Research validation failed; prior snapshot preserved:\n${errors.join("\n")}`);

await mkdir(new URL("data/history/", root), { recursive: true });
await writeFile(new URL(`data/history/${today}.json`, root), `${JSON.stringify(next, null, 2)}\n`);
await writeFile(new URL("data/current.json", root), `${JSON.stringify(next, null, 2)}\n`);
console.log(`Saved validated ${today} research: ${reconciledProperties.filter(p => p.changeCategory === "new").length} new, ${reconciledProperties.filter(p => p.changeCategory === "changed").length} changed, ${reconciledProperties.filter(isRemovedFromMarket).length} removed from market.`);
