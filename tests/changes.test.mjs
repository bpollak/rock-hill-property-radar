import test from "node:test";
import assert from "node:assert/strict";
import { classifyProperty, diffProperty } from "../scripts/lib/changes.mjs";

const listing = {price:200000,status:"active",beds:3,baths:2,privateBath:"unknown",hoa:{roomRental:"unknown"}};

test("a first appearance is new", () => assert.equal(classifyProperty(null, listing), "new"));
test("unchanged listing is previously reviewed", () => assert.equal(classifyProperty(listing, {...listing}), "existing"));
test("price and HOA changes are material", () => {
  const changes = diffProperty(listing, {...listing,price:190000,hoa:{roomRental:"allowed"}});
  assert.deepEqual(changes.map(change => change.field), ["price","hoa.roomRental"]);
});
