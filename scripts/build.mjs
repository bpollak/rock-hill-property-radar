import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { enrichFinancials } from "./lib/finance.mjs";
import { recommendationStatus, scoreProperty } from "./lib/scoring.mjs";

const root = new URL("../", import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, root), "utf8"));
const dataset = await readJson("data/current.json");
const assumptions = await readJson("config/public-assumptions.json");

const properties = dataset.properties.map(property => {
  const financials = enrichFinancials(property, assumptions);
  const recommendation = recommendationStatus(property);
  const score = scoreProperty(property, financials);
  return { ...property, recommendation, financials, score };
});

const appData = { ...dataset, properties, assumptions, generatedAt: new Date().toISOString() };
const dist = new URL("dist/", root);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(new URL("public/", root), dist, { recursive: true });
await mkdir(new URL("dist/data/", root), { recursive: true });
await writeFile(new URL("dist/data/app-data.json", root), `${JSON.stringify(appData, null, 2)}\n`);
await writeFile(new URL("dist/.nojekyll", root), "");
console.log(`Built ${properties.length} source-backed options for ${dataset.asOf}.`);
