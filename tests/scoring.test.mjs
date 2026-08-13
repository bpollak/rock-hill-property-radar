import test from "node:test";
import assert from "node:assert/strict";
import { recommendationStatus } from "../scripts/lib/scoring.mjs";

const base = {status:"active",strategy:"shared-home",privateBath:"yes",roomRentalLegal:"confirmed",hoa:{roomRental:"not-applicable"}};

test("unknown private bathroom blocks recommendation", () => {
  assert.equal(recommendationStatus({...base, privateBath:"unknown"}), "Needs verification");
});

test("unknown condo room-rental rules block recommendation", () => {
  assert.equal(recommendationStatus({...base, strategy:"shared-condo", hoa:{roomRental:"unknown"}}), "Needs verification");
});

test("prohibited condo room rentals reject the shared strategy", () => {
  assert.equal(recommendationStatus({...base, strategy:"shared-condo", hoa:{roomRental:"prohibited"}}), "Rejected");
});

test("documented gates qualify a shared house", () => {
  assert.equal(recommendationStatus(base), "Qualified");
});
