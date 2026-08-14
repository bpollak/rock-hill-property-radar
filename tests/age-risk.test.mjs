import test from "node:test";
import assert from "node:assert/strict";
import { ageRiskProfile } from "../scripts/lib/age-risk.mjs";
import { analyzeProperty } from "../scripts/lib/finance.mjs";
import { scoreProperty } from "../scripts/lib/scoring.mjs";

const assumptions = {
  asOf: "2026-08-13",
  purchase: {maximumOfferPrice:275000,downPaymentRate:.25,mortgageRate:.0675,mortgageYears:30,buyerClosingCostRate:.03,sellingCostRate:.07},
  operations: {roomRentMonthly:850,vacancyRate:.12,insuranceRate:.0075,maintenanceRate:.01,capitalExpenditureRate:.005,sharedUtilitiesMonthly:400,propertyTaxRate:.0248,rentGrowthRate:.03,expenseGrowthRate:.03,appreciationRate:.03},
  ageRisk: {
    unknownYear: {label:"Age unverified",riskTier:"Elevated",reserveMultiplier:1.5,scorePenalty:18},
    bands: [
      {maxAge:5,label:"Newer construction",riskTier:"Lower",reserveMultiplier:.75,scorePenalty:0},
      {maxAge:40,label:"Mature",riskTier:"Moderate",reserveMultiplier:1.2,scorePenalty:6},
      {maxAge:80,label:"Older",riskTier:"High",reserveMultiplier:1.7,scorePenalty:18},
      {maxAge:999,label:"Century property",riskTier:"Very high",reserveMultiplier:2.25,scorePenalty:30}
    ]
  },
  comparison: {forwardHurdleRate:.07},
  tax: {federalCapitalGainRate:.15,depreciationRecaptureRate:.25,statePlanningRate:.093}
};

const baseProperty = {
  strategy: "shared-home",
  status: "active",
  price: 215000,
  priceCutPercent: 0,
  beds: 4,
  privateBath: "yes",
  roomRentalLegal: "confirmed",
  hoaMonthly: 0,
  concerns: [],
  sourceConflicts: []
};

test("property age selects a deterministic reserve and risk band", () => {
  const century = ageRiskProfile({...baseProperty, yearBuilt:1900}, assumptions);
  const newer = ageRiskProfile({...baseProperty, yearBuilt:2024}, assumptions);
  assert.equal(century.ageYears, 126);
  assert.equal(century.reserveMultiplier, 2.25);
  assert.equal(century.scorePenalty, 30);
  assert.equal(newer.reserveMultiplier, .75);
  assert.equal(newer.scorePenalty, 0);
  assert.ok(century.diligence.some(item => item.includes("lead disclosure")));
});

test("older age increases subsidy and lowers the decision score", () => {
  const oldProperty = {...baseProperty, yearBuilt:1900};
  const newProperty = {...baseProperty, yearBuilt:2024};
  const oldFinancials = {10: analyzeProperty(oldProperty, assumptions, 10)};
  const newFinancials = {10: analyzeProperty(newProperty, assumptions, 10)};
  const oldScore = scoreProperty(oldProperty, oldFinancials, assumptions);
  const newScore = scoreProperty(newProperty, newFinancials, assumptions);
  assert.ok(oldFinancials[10].monthlySubsidy > newFinancials[10].monthlySubsidy);
  assert.ok(oldFinancials[10].maintenanceReserveMonthly > newFinancials[10].maintenanceReserveMonthly);
  assert.ok(oldScore.components.riskOptionality < newScore.components.riskOptionality);
  assert.ok(oldScore.total < newScore.total);
});
