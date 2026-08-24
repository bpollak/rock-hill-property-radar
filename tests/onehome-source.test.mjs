import test from "node:test";
import assert from "node:assert/strict";
import { assertSanitizedOneHomeSnapshot, mergeOneHomeSnapshot, normalizePropertyAddress } from "../scripts/lib/onehome-source.mjs";

const sourceProperty = {
  id:"mls-100", strategy:"shared-home", address:"10 Main St, Rock Hill, SC 29730", sourceUrl:"https://example.com/100", mls:"100", status:"contingent", price:250000, beds:3, baths:2, sqft:1200, yearBuilt:2000, hoaMonthly:0, privateBath:"unknown", roomRentalLegal:"unknown", oneLevel:false, distanceMiles:5, driveMinutes:12, distanceAsOf:"2026-08-23", distanceMethod:"verified route", distanceLabel:"5.0 miles · about 12 minutes from the family reference property", sources:[{label:"Existing",url:"https://example.com/100",accessed:"2026-08-23"}], concerns:[], pros:[], hoa:{exists:null,wholeUnitRental:"unknown",roomRental:"unknown",evidence:[],confidence:"low",followUp:"Verify"}
};
const base = {asOf:"2026-08-24", runStatus:"successful", properties:[sourceProperty]};
const snapshot = properties => ({contract:"onehome-snapshot-v1", sourceId:"onehome-canopy-saved-search", asOf:"2026-08-24", properties});
const detail = {mls:"100",address:"10 Main Street, Rock Hill, SC 29730",status:"Active",price:240000,beds:3,baths:2,sqft:1200,yearBuilt:2000,distanceMiles:5,driveMinutes:12,path:"/en-US/property/aotf~1234567890~CANOPY"};

test("normalizes equivalent street addresses", () => {
  assert.equal(normalizePropertyAddress("10 Main Street #2"), normalizePropertyAddress("10 Main St Apt 2"));
});

test("deduplicates by MLS and retains stricter contingent status", () => {
  const result = mergeOneHomeSnapshot(base, snapshot([detail]));
  assert.equal(result.dataset.properties.length, 1);
  assert.equal(result.updated.length, 1);
  assert.equal(result.dataset.properties[0].status, "contingent");
  assert.equal(result.dataset.properties[0].price, 240000);
});

test("deduplicates by normalized address when MLS changes", () => {
  const result = mergeOneHomeSnapshot(base, snapshot([{...detail,mls:"101"}]));
  assert.equal(result.dataset.properties.length, 1);
  assert.equal(result.updated.length, 1);
});

test("withholds a listing missing construction year", () => {
  const result = mergeOneHomeSnapshot(base, snapshot([{...detail,mls:"102",address:"12 Main St, Rock Hill, SC 29730",yearBuilt:null}]));
  assert.equal(result.added.length, 0);
  assert.equal(result.withheld.length, 1);
});

test("rejects token-bearing snapshots", () => {
  assert.throws(() => assertSanitizedOneHomeSnapshot({...snapshot([]),sourceUrl:"https://portal.onehome.com/?token=secret"}), /token or private access marker/);
});

test("retains a token-free property path for direct-link composition", () => {
  const result = mergeOneHomeSnapshot({...base,properties:[]}, snapshot([detail]));
  assert.equal(result.dataset.properties[0].sourceUrl, "https://portal.onehome.com/en-US/property/aotf~1234567890~CANOPY");
  assert.equal(result.dataset.properties[0].sources[0].url, result.dataset.properties[0].sourceUrl);
});

test("rejects a query string inside a supplied property path", () => {
  assert.throws(() => assertSanitizedOneHomeSnapshot(snapshot([{...detail,path:`${detail.path}?token=secret`}])), /token or private access marker|invalid or access-bearing/);
});
