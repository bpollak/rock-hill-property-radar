import { mkdir, readFile, writeFile } from "node:fs/promises";
import { validateDataset } from "./lib/schema.mjs";
import { mergeOneHomeSnapshot } from "./lib/onehome-source.mjs";

const root = new URL("../", import.meta.url);
const input = process.argv[2];
if (!input) throw new Error("Usage: npm run import:onehome -- /absolute/path/to/sanitized-onehome-snapshot.json");

const snapshot = JSON.parse(await readFile(input, "utf8"));
const currentUrl = new URL("data/current.json", root);
const current = JSON.parse(await readFile(currentUrl, "utf8"));
const result = mergeOneHomeSnapshot(current, snapshot);
const errors = validateDataset(result.dataset);
if (errors.length) throw new Error(`OneHome import validation failed; current data was preserved:\n${errors.join("\n")}`);

await mkdir(new URL("data/history/", root), {recursive:true});
await writeFile(currentUrl, `${JSON.stringify(result.dataset, null, 2)}\n`);
await writeFile(new URL(`data/history/${snapshot.asOf}.json`, root), `${JSON.stringify(result.dataset, null, 2)}\n`);
console.log(`Imported sanitized OneHome snapshot: ${result.added.length} added, ${result.updated.length} matched, ${result.withheld.length} withheld.`);
