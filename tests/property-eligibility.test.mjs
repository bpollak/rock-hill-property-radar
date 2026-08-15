import test from "node:test";
import assert from "node:assert/strict";
import { meetsMinimumYearBuilt, minimumYearBuilt } from "../scripts/lib/property-eligibility.mjs";

const assumptions = {livingRequirements:{minimumYearBuilt:1980}};

test("purchase properties built before 1980 are excluded", () => {
  assert.equal(meetsMinimumYearBuilt({strategy:"shared-home",yearBuilt:1979}, assumptions), false);
  assert.equal(meetsMinimumYearBuilt({strategy:"shared-home",yearBuilt:1980}, assumptions), true);
  assert.equal(meetsMinimumYearBuilt({strategy:"private-purchase",yearBuilt:2026}, assumptions), true);
});

test("purchase properties with unknown construction years are excluded", () => {
  assert.equal(meetsMinimumYearBuilt({strategy:"shared-condo"}, assumptions), false);
  assert.equal(meetsMinimumYearBuilt({strategy:"shared-condo",yearBuilt:"1984"}, assumptions), false);
});

test("rental benchmarks remain available without a construction year", () => {
  assert.equal(meetsMinimumYearBuilt({strategy:"rental-benchmark"}, assumptions), true);
});

test("minimum construction year defaults to 1980", () => {
  assert.equal(minimumYearBuilt(), 1980);
});
