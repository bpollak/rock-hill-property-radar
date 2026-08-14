import test from "node:test";
import assert from "node:assert/strict";
import { analyzeProperty } from "../scripts/lib/finance.mjs";
import { roomRentabilityProfile } from "../scripts/lib/room-rentability.mjs";
import { scoreProperty } from "../scripts/lib/scoring.mjs";

const assumptions = {
  asOf: "2026-08-13",
  purchase: {maximumOfferPrice:275000,downPaymentRate:.25,mortgageRate:.0675,mortgageYears:30,buyerClosingCostRate:.03,sellingCostRate:.07},
  operations: {roomRentMonthly:850,vacancyRate:.12,insuranceRate:.0075,maintenanceRate:.01,capitalExpenditureRate:.005,sharedUtilitiesMonthly:400,propertyTaxRate:.0248,rentGrowthRate:.03,expenseGrowthRate:.03,appreciationRate:.03},
  roomRentability: {
    factorWeights: {legalAndHoaAuthority:.35,bedroomBathroomCapacity:.20,roomDemandFit:.20,parkingAndOperations:.15,conditionAndReadiness:.10},
    unknownAuthorityScoreCap:49,
    unknownCondoHoaScoreCap:35
  },
  comparison: {forwardHurdleRate:.07},
  tax: {federalCapitalGainRate:.15,depreciationRecaptureRate:.25,statePlanningRate:.093}
};

const base = {
  strategy:"shared-home",
  address:"Test property, Rock Hill, SC 29732",
  status:"active",
  price:250000,
  priceCutPercent:0,
  beds:4,
  baths:2,
  yearBuilt:2024,
  privateBath:"yes",
  hoaMonthly:0,
  distanceLabel:"Rock Hill, within target area",
  concerns:[],
  sourceConflicts:[],
  listingHistory:[],
  hoa:{roomRental:"not-applicable"}
};

test("unknown rental authority reduces underwritten room income and score", () => {
  const unknown = {...base, roomRentalLegal:"unknown"};
  const confirmed = {...base, roomRentalLegal:"confirmed"};
  const unknownProfile = roomRentabilityProfile(unknown, assumptions);
  const confirmedProfile = roomRentabilityProfile(confirmed, assumptions);
  const unknownFinancials = {10: analyzeProperty(unknown, assumptions, 10)};
  const confirmedFinancials = {10: analyzeProperty(confirmed, assumptions, 10)};
  assert.equal(unknownProfile.score, 49);
  assert.ok(confirmedProfile.score >= 80);
  assert.ok(unknownFinancials[10].roomRevenueMonthly < confirmedFinancials[10].roomRevenueMonthly);
  assert.ok(unknownFinancials[10].monthlySubsidy > confirmedFinancials[10].monthlySubsidy);
  assert.ok(scoreProperty(unknown, unknownFinancials, assumptions).total < scoreProperty(confirmed, confirmedFinancials, assumptions).total);
});

test("a prohibition eliminates underwritten room income", () => {
  const prohibited = {...base, roomRentalLegal:"prohibited"};
  const profile = roomRentabilityProfile(prohibited, assumptions);
  const result = analyzeProperty(prohibited, assumptions, 10);
  assert.equal(profile.score, 0);
  assert.equal(result.roomIncomeRealizationRate, 0);
  assert.equal(result.roomRevenueMonthly, 0);
  assert.ok(result.fullRoomRevenueMonthly > 0);
});

test("private-purchase strategy is not penalized for room rentability", () => {
  const profile = roomRentabilityProfile({...base, strategy:"private-purchase"}, assumptions);
  assert.equal(profile.required, false);
  assert.equal(profile.score, 100);
});
