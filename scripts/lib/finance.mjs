export function monthlyPayment(principal, annualRate, years) {
  if (principal <= 0) return 0;
  const n = years * 12;
  if (annualRate === 0) return principal / n;
  const r = annualRate / 12;
  return principal * (r * (1 + r) ** n) / ((1 + r) ** n - 1);
}

export function remainingBalance(principal, annualRate, years, monthsPaid) {
  const n = years * 12;
  if (monthsPaid >= n) return 0;
  if (annualRate === 0) return principal * (1 - monthsPaid / n);
  const r = annualRate / 12;
  const payment = monthlyPayment(principal, annualRate, years);
  return principal * (1 + r) ** monthsPaid - payment * (((1 + r) ** monthsPaid - 1) / r);
}

export function irr(cashflows) {
  const npv = rate => cashflows.reduce((sum, cash, year) => sum + cash / (1 + rate) ** year, 0);
  let low = -0.99;
  let high = 5;
  if (npv(low) * npv(high) > 0) return null;
  for (let i = 0; i < 180; i += 1) {
    const mid = (low + high) / 2;
    if (npv(low) * npv(mid) <= 0) high = mid;
    else low = mid;
  }
  return (low + high) / 2;
}

function futureValueOfContributions(initial, annualContributions, rate) {
  let value = initial;
  for (const contribution of annualContributions) value = value * (1 + rate) + contribution;
  return value;
}

export function analyzeProperty(property, assumptions, years) {
  if (property.strategy === "rental-benchmark") return null;
  const p = assumptions.purchase;
  const o = assumptions.operations;
  const t = assumptions.tax;
  const price = property.price;
  const down = price * p.downPaymentRate;
  const closing = price * p.buyerClosingCostRate;
  const loan = price - down;
  const mortgage = monthlyPayment(loan, p.mortgageRate, p.mortgageYears);
  const rentableRooms = property.strategy === "private-purchase" ? 0 : Math.max(0, property.beds - 1);
  const baseRent = rentableRooms * o.roomRentMonthly * (1 - o.vacancyRate);
  const baseExpenses = mortgage + price * (o.propertyTaxRate + o.insuranceRate + o.maintenanceRate + o.capitalExpenditureRate) / 12 + (property.hoaMonthly || 0) + (rentableRooms ? o.sharedUtilitiesMonthly : 0);
  const monthlySubsidy = Math.max(0, baseExpenses - baseRent);
  const annualSubsidies = [];
  const cashflows = [-(down + closing)];
  for (let year = 1; year <= years; year += 1) {
    const rent = baseRent * 12 * (1 + o.rentGrowthRate) ** (year - 1);
    const nonMortgage = (baseExpenses - mortgage) * 12 * (1 + o.expenseGrowthRate) ** (year - 1);
    const subsidy = Math.max(0, mortgage * 12 + nonMortgage - rent);
    annualSubsidies.push(subsidy);
    cashflows.push(-subsidy);
  }
  const futurePrice = price * (1 + o.appreciationRate) ** years;
  const saleCosts = futurePrice * p.sellingCostRate;
  const balance = remainingBalance(loan, p.mortgageRate, p.mortgageYears, years * 12);
  const rentalShare = property.strategy === "private-purchase" ? 0 : rentableRooms / Math.max(1, property.beds);
  const buildingBasis = price * 0.8;
  const depreciation = Math.min(buildingBasis * rentalShare, buildingBasis * rentalShare / 27.5 * years);
  const gain = Math.max(0, futurePrice - price - saleCosts);
  const recaptureTax = depreciation * (t.depreciationRecaptureRate + t.statePlanningRate);
  const remainingGain = Math.max(0, gain - depreciation);
  // The buyer is not expected to occupy the property as a principal residence,
  // so the planning model does not assume a primary-home gain exclusion.
  const gainTax = remainingGain * (t.federalCapitalGainRate + t.statePlanningRate);
  const saleProceeds = futurePrice - saleCosts - balance - recaptureTax - gainTax;
  cashflows[cashflows.length - 1] += saleProceeds;
  const totalCashInvested = down + closing + annualSubsidies.reduce((a, b) => a + b, 0);
  const investmentIrr = irr(cashflows);
  const alternativeValue = futureValueOfContributions(down + closing, annualSubsidies, assumptions.comparison.forwardHurdleRate);
  return {
    years,
    downPayment: Math.round(down),
    initialCash: Math.round(down + closing),
    mortgageMonthly: Math.round(mortgage),
    roomRevenueMonthly: Math.round(baseRent),
    operatingCostMonthly: Math.round(baseExpenses),
    monthlySubsidy: Math.round(monthlySubsidy),
    totalCashInvested: Math.round(totalCashInvested),
    netSaleProceeds: Math.round(saleProceeds),
    netWealth: Math.round(saleProceeds - annualSubsidies.reduce((a, b) => a + b, 0) - down - closing),
    irr: investmentIrr,
    alternativeValue: Math.round(alternativeValue),
    wealthGapVsHurdle: Math.round(saleProceeds - alternativeValue),
    rentableRooms,
    taxEstimate: Math.round(recaptureTax + gainTax)
  };
}

export function enrichFinancials(property, assumptions) {
  const results = {};
  for (const years of assumptions.comparison.holdingPeriods) results[years] = analyzeProperty(property, assumptions, years);
  return results;
}
