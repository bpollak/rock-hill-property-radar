const DEFAULT_UNKNOWN = {
  label: "Age unverified",
  riskTier: "Elevated",
  reserveMultiplier: 1.5,
  scorePenalty: 18
};

function asOfYear(assumptions) {
  const parsed = Number.parseInt(String(assumptions.asOf || "").slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : new Date().getUTCFullYear();
}

export function ageRiskProfile(property, assumptions) {
  if (property.strategy === "rental-benchmark") return null;
  const built = Number(property.yearBuilt);
  const known = Number.isFinite(built) && built > 1700 && built <= asOfYear(assumptions) + 1;
  const ageYears = known ? Math.max(0, asOfYear(assumptions) - built) : null;
  const configuredBands = assumptions.ageRisk?.bands || [];
  const band = known
    ? configuredBands.find(candidate => ageYears <= candidate.maxAge) || configuredBands.at(-1) || DEFAULT_UNKNOWN
    : assumptions.ageRisk?.unknownYear || DEFAULT_UNKNOWN;
  const reserveMultiplier = Number(band.reserveMultiplier) || DEFAULT_UNKNOWN.reserveMultiplier;
  const scorePenalty = Number.isFinite(band.scorePenalty) ? band.scorePenalty : DEFAULT_UNKNOWN.scorePenalty;
  const baselineAnnualReserveRate = assumptions.operations.maintenanceRate + assumptions.operations.capitalExpenditureRate;

  const diligence = [];
  if (!known) {
    diligence.push("Verify the construction year and permit history before relying on the reserve estimate.");
  } else if (ageYears <= 5) {
    diligence.push("Verify the certificate of occupancy, final permits, builder warranty, and unresolved punch-list items.");
  } else if (ageYears <= 20) {
    diligence.push("Confirm original installation dates and remaining warranties for the roof, HVAC, water heater, and major appliances.");
  } else {
    diligence.push("Obtain documented ages, permits, and service history for the roof, HVAC, water heater, electrical, and plumbing systems.");
  }
  if (known && ageYears > 40) {
    diligence.push("Use a comprehensive inspection focused on structure, foundation, moisture, drainage, wiring, supply and waste piping, roof, and sewer or septic condition.");
  }
  if (known && built < 1978) {
    diligence.push("Require the federal lead disclosure and budget for lead-safe testing and work practices before disturbing painted surfaces.");
  }
  if (known && built < 1980) {
    diligence.push("Before renovation, have suspect older floor tile, ceiling tile, or pipe wrap evaluated for asbestos; age alone does not establish its presence.");
  }
  if (known && ageYears > 80) {
    diligence.push("Confirm insurer and lender eligibility early and price any structural, electrical-service, plumbing, or foundation remediation with licensed specialists.");
  }

  return {
    yearBuilt: known ? built : null,
    ageYears,
    label: band.label || DEFAULT_UNKNOWN.label,
    riskTier: band.riskTier || DEFAULT_UNKNOWN.riskTier,
    reserveMultiplier,
    scorePenalty,
    baselineAnnualReserveRate,
    adjustedAnnualReserveRate: baselineAnnualReserveRate * reserveMultiplier,
    diligence
  };
}
