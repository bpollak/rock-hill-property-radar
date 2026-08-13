import test from "node:test";
import assert from "node:assert/strict";
import { analyzeProperty, irr, monthlyPayment, remainingBalance } from "../scripts/lib/finance.mjs";

test("mortgage payment and amortization are deterministic", () => {
  const payment = monthlyPayment(225000, 0.0675, 30);
  assert.ok(payment > 1450 && payment < 1470);
  assert.ok(remainingBalance(225000, 0.0675, 30, 120) < 197000);
  assert.ok(remainingBalance(225000, 0.0675, 30, 120) > 190000);
});

test("IRR solves a simple doubling", () => {
  assert.ok(Math.abs(irr([-100, 0, 200]) - Math.sqrt(2) + 1) < 0.00001);
});

test("room income reduces the required subsidy", () => {
  const assumptions = {
    purchase:{downPaymentRate:.25,mortgageRate:.0675,mortgageYears:30,buyerClosingCostRate:.03,sellingCostRate:.07},
    operations:{roomRentMonthly:850,vacancyRate:.12,insuranceRate:.0075,maintenanceRate:.01,capitalExpenditureRate:.005,sharedUtilitiesMonthly:400,propertyTaxRate:.0248,rentGrowthRate:.03,expenseGrowthRate:.03,appreciationRate:.03},
    comparison:{forwardHurdleRate:.07},
    tax:{federalCapitalGainRate:.15,depreciationRecaptureRate:.25,statePlanningRate:.093}
  };
  const shared = analyzeProperty({strategy:"shared-home",price:250000,beds:4,hoaMonthly:0}, assumptions, 10);
  const privateUse = analyzeProperty({strategy:"private-purchase",price:250000,beds:4,hoaMonthly:0}, assumptions, 10);
  assert.ok(shared.monthlySubsidy < privateUse.monthlySubsidy);
  assert.equal(shared.rentableRooms, 3);
});
