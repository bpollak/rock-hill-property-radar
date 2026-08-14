import test from "node:test";
import assert from "node:assert/strict";
import { qualificationProfile, recommendationStatus } from "../scripts/lib/scoring.mjs";

const assumptions = {purchase:{maximumOfferPrice:275000},livingRequirements:{maximumDrivingMiles:30,stairsAcceptable:true},comparison:{forwardHurdleRate:.07}};
const base = {status:"active",strategy:"shared-home",price:250000,beds:4,privateBath:"yes",distanceMiles:5,driveMinutes:10,oneLevel:true,roomRentalLegal:"confirmed",hoa:{roomRental:"not-applicable"}};

test("unknown private bathroom blocks recommendation", () => {
  assert.equal(recommendationStatus({...base, privateBath:"unknown"}, assumptions), "Needs verification");
});

test("unknown condo room-rental rules block recommendation", () => {
  assert.equal(recommendationStatus({...base, strategy:"shared-condo", hoa:{roomRental:"unknown"}}, assumptions), "Needs verification");
});

test("prohibited condo room rentals reject the shared strategy", () => {
  assert.equal(recommendationStatus({...base, strategy:"shared-condo", hoa:{roomRental:"prohibited"}}, assumptions), "Rejected");
});

test("documented gates qualify a shared house", () => {
  assert.equal(recommendationStatus(base, assumptions), "Qualified");
});

test("qualified profile lists every passed gate and separates financial caveats", () => {
  const property = {...base, strategy:"private-purchase", price:150000, beds:1, distanceMiles:3.7, driveMinutes:9, hoa:{exists:true,confidence:"medium",roomRental:"not-applicable"}};
  const profile = qualificationProfile(property, assumptions, {10:{monthlySubsidy:1572,irr:-.248}});
  assert.equal(profile.status, "Qualified");
  assert.equal(profile.gates.length, 6);
  assert.equal(profile.reasons.length, 6);
  assert.ok(profile.cardComment.includes("3.7 mi / 9 min"));
  assert.ok(profile.caveats.some(item => item.includes("$1,572")));
  assert.ok(profile.caveats.some(item => item.includes("7.0%")));
});

test("an above-ceiling listing cannot be qualified before seller acceptance", () => {
  assert.equal(recommendationStatus({...base, price:300000}, assumptions), "Needs verification");
});
