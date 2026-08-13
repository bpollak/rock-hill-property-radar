import OpenAI from "openai";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { diffProperty } from "./lib/changes.mjs";
import { validateDataset } from "./lib/schema.mjs";

const root = new URL("../", import.meta.url);
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const anchor = process.env.FAMILY_ANCHOR_ADDRESS;
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for daily research.");
if (!anchor) throw new Error("FAMILY_ANCHOR_ADDRESS is required and must be stored as a repository secret.");

const previous = JSON.parse(await readFile(new URL("data/current.json", root), "utf8"));
const sourcePolicy = JSON.parse(await readFile(new URL("config/source-policy.json", root), "utf8"));
const known = previous.properties.filter(p => p.strategy !== "rental-benchmark").map(p => ({id:p.id,address:p.address,mls:p.mls,sourceUrl:p.sourceUrl,status:p.status,price:p.price}));
const prompt = `You are the daily real-estate research analyst for a private family decision. Research actual, currently marketed options within 30 driving miles of the private anchor supplied below. Never repeat the anchor in your output.

PRIVATE ANCHOR: ${anchor}
RUN DATE: ${today}

Decision requirements:
- Rock Hill area is preferred; absolute maximum 30 driving miles.
- Mother-in-law must have her own bedroom and private full bathroom. Unknown is acceptable only when explicitly marked unknown.
- She accepts unrelated housemates and stairs.
- Strategies: shared-home, shared-condo, private-purchase, rental-benchmark.
- $275,000 is the absolute maximum offer price. Prioritize listings at or below $275,000. A listing above $275,000 may be retained only when current pricing history or market exposure makes an accepted offer at or below $275,000 credible; explicitly calculate the required seller discount and flag seller acceptance as unresolved. Never model or recommend an offer above $275,000.
- For condos, separately research whole-unit and individual-room rental authority. Do not infer permission from silence. Use allowed, restricted, prohibited, or unknown. Record governing-document or written-management evidence. Unknown must remain unknown.
- Capture current list price, original price, beds, full baths, square feet, year, type, HOA dues, days on market, listing history, taxes if reliable, price per square foot, market comparison, private-bath evidence, pros, concerns, source conflicts, and source URLs.
- Recheck these known candidates and discover credible new ones: ${JSON.stringify(known)}
- Include a current Rock Hill studio/one-bedroom rental benchmark and current room-rent evidence.
- Prefer MLS-fed portals for listing status, official government sources for rules and taxes, recorded HOA documents for restrictions, and primary market sources for investment benchmarks.
- Audit every source category in this source policy on every run. A category with no matching inventory is a valid zero result, but it must not be silently skipped: ${JSON.stringify(sourcePolicy)}
- Do not request, require, or attempt to obtain third-party credentials, paid API keys, broker exports, or direct MLS access. Categories marked not-used are documented limitations, not run failures.
- Reconcile Realtor.com, Redfin, Zillow, Homes.com, Movoto, indexed brokerage/IDX pages, builder inventory, government/GSE inventory, owner-listed inventory, and public auction sources rather than claiming exhaustive MLS coverage.
- Do not output assumptions as facts. Do not invent citations. A source URL must support the corresponding claim.

Return JSON only, with top-level keys market, properties, and methodologySources. Each property must use the same field names and nesting as the examples in the known dataset. Use a stable id of mls-<number> when MLS is available. Include sources as [{label,url,accessed}]. Include hoa as {exists,wholeUnitRental,roomRental,evidence,confidence,followUp}. Include listingHistory, pros, concerns, sourceConflicts, distanceLabel, privateBath, roomRentalLegal, priceCutPercent, and marketPricePerSqft. Do not include the private anchor.`;

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

const priorById = new Map(previous.properties.map(property => [property.id, property]));
const seenIds = new Set();
const active = researched.properties.map(property => {
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

for (const prior of previous.properties) {
  if (seenIds.has(prior.id)) continue;
  const missingRuns = (prior.missingRuns || 0) + 1;
  active.push({
    ...prior,
    missingRuns,
    changeCategory: missingRuns >= 2 ? "archived" : "existing",
    status: missingRuns >= 2 ? "inactive" : prior.status,
    lastChanged: missingRuns >= 2 ? today : prior.lastChanged
  });
}

const next = {
  asOf: today,
  runStatus: "successful",
  researchMethod: previous.researchMethod,
  market: researched.market || previous.market,
  properties: active,
  methodologySources: researched.methodologySources || previous.methodologySources
};
const errors = validateDataset(next);
const serialized = JSON.stringify(next).toLowerCase();
if (serialized.includes(anchor.toLowerCase())) errors.push("Research output leaked the private anchor.");
if (next.properties.filter(p => p.strategy !== "rental-benchmark" && p.status === "active").length < 3) errors.push("Research returned fewer than three active purchase candidates.");
if (errors.length) throw new Error(`Research validation failed; prior snapshot preserved:\n${errors.join("\n")}`);

await mkdir(new URL("data/history/", root), { recursive: true });
await writeFile(new URL(`data/history/${today}.json`, root), `${JSON.stringify(next, null, 2)}\n`);
await writeFile(new URL("data/current.json", root), `${JSON.stringify(next, null, 2)}\n`);
console.log(`Saved validated ${today} research: ${active.filter(p => p.changeCategory === "new").length} new, ${active.filter(p => p.changeCategory === "changed").length} changed, ${active.filter(p => p.changeCategory === "archived").length} archived.`);
