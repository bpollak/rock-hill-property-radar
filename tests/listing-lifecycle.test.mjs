import test from "node:test";
import assert from "node:assert/strict";
import { isRemovedFromMarket, reconcileProperties } from "../scripts/lib/listing-lifecycle.mjs";

const prior = {
  id:"mls-1",
  status:"active",
  price:200000,
  beds:3,
  baths:2,
  privateBath:"unknown",
  hoa:{roomRental:"unknown"},
  firstSeen:"2026-08-13",
  lastSeen:"2026-08-14",
  lastChanged:"2026-08-13",
  changeCategory:"existing",
  changeHistory:[],
  missingRuns:1
};

test("active, contingent, and pending listings remain on market", () => {
  for (const status of ["active", "contingent", "pending"]) {
    assert.equal(isRemovedFromMarket({status}), false);
  }
});

test("confirmed inactive market statuses are removed", () => {
  for (const status of ["inactive", "sold", "off-market", "withdrawn", "expired", "removed"]) {
    assert.equal(isRemovedFromMarket({status}), true);
  }
});

test("an omitted prior listing remains available until removal is confirmed", () => {
  const [carried] = reconcileProperties([prior], [], "2026-08-15");
  assert.equal(carried.status, "active");
  assert.equal(carried.changeCategory, "existing");
  assert.equal(carried.missingRuns, 2);
  assert.equal(carried.lastSeen, "2026-08-14");
});

test("a confirmed inactive result updates and removes the listing", () => {
  const [removed] = reconcileProperties([prior], [{...prior,status:"inactive"}], "2026-08-15");
  assert.equal(removed.status, "inactive");
  assert.equal(removed.changeCategory, "changed");
  assert.equal(removed.lastSeen, "2026-08-15");
  assert.equal(isRemovedFromMarket(removed), true);
});
