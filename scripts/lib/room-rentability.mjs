import { ageRiskProfile } from "./age-risk.mjs";

const clamp = value => Math.max(0, Math.min(100, value));

function concernMatches(property, pattern) {
  return (property.concerns || []).some(concern => pattern.test(concern));
}

function likelihoodLabel(score) {
  if (score >= 80) return "High";
  if (score >= 65) return "Moderately high";
  if (score >= 50) return "Moderate";
  if (score >= 35) return "Low";
  return "Very low";
}

export function roomRentabilityProfile(property, assumptions) {
  if (property.strategy === "rental-benchmark") return null;
  const required = property.strategy === "shared-home" || property.strategy === "shared-condo";
  if (!required) {
    return {
      required: false,
      score: 100,
      label: "Not required",
      incomeRealizationRate: 1,
      rentableRooms: 0,
      tenantBathrooms: 0,
      factors: [],
      followUps: []
    };
  }

  const rentableRooms = Math.max(0, Number(property.beds || 0) - 1);
  const tenantBathrooms = Math.max(0, Number(property.baths || 0) - 1);
  const authorityProhibited = property.roomRentalLegal === "prohibited" || property.hoa?.roomRental === "prohibited";
  const localAuthorityConfirmed = property.roomRentalLegal === "confirmed";
  const hoaAuthorityConfirmed = property.strategy !== "shared-condo" || property.hoa?.roomRental === "allowed";
  const authorityConfirmed = localAuthorityConfirmed && hoaAuthorityConfirmed;

  let authorityScore = authorityProhibited ? 0 : authorityConfirmed ? 100 : 30;
  if (!authorityProhibited && property.strategy === "shared-condo" && property.hoa?.roomRental === "unknown") authorityScore = 20;
  const authorityReason = authorityProhibited
    ? "Individual-room rental is prohibited by a controlling rule."
    : authorityConfirmed
      ? "Local occupancy authority and any applicable HOA authority are documented."
      : property.strategy === "shared-condo" && property.hoa?.roomRental === "unknown"
        ? "HOA authority for separate room leases is unresolved, and local occupancy approval is not documented."
        : "Local zoning, occupancy, registration, and separate-room lease authority are not documented.";

  let capacityScore = rentableRooms === 0 ? 0 : tenantBathrooms === 0 ? 20 : rentableRooms / tenantBathrooms <= 2 ? 90 : rentableRooms / tenantBathrooms <= 3 ? 70 : 50;
  if (property.privateBath !== "yes") capacityScore -= 15;
  if (concernMatches(property, /small|bedroom count|legal bedroom/i)) capacityScore -= 10;
  capacityScore = clamp(capacityScore);
  const capacityReason = `${rentableRooms} potential renter room${rentableRooms === 1 ? "" : "s"} and ${tenantBathrooms} remaining full bathroom${tenantBathrooms === 1 ? "" : "s"} after reserving one private bathroom for the family living arrangement.${property.privateBath === "yes" ? "" : " The private-bath allocation is still unverified."}`;

  const inRockHill = /rock hill/i.test(property.address || "");
  let marketScore = inRockHill ? 75 : 45;
  if ((property.listingHistory || []).some(item => /rent/i.test(item.event || ""))) marketScore += 10;
  if (concernMatches(property, /small.*bedroom|fourth bedroom.*small/i)) marketScore -= 10;
  marketScore = clamp(marketScore);
  const marketReason = inRockHill
    ? "Located in the target Rock Hill market; the financial model uses a separate property-specific room-comparable estimate, but no signed lease is available."
    : "Outside the preferred Rock Hill core, so the shared-room demand assumption receives a location discount.";

  let operationalScore = 60;
  const operationalGaps = [];
  if (concernMatches(property, /zoning|occupancy|registration|lease structure/i)) { operationalScore -= 20; operationalGaps.push("zoning/occupancy"); }
  if (concernMatches(property, /parking/i)) { operationalScore -= 15; operationalGaps.push("parking"); }
  if (concernMatches(property, /septic|sewer capacity|bedroom authorization/i)) { operationalScore -= 15; operationalGaps.push("wastewater capacity"); }
  if (concernMatches(property, /certificate of occupancy|construction is not complete/i)) { operationalScore -= 20; operationalGaps.push("occupancy readiness"); }
  if (authorityConfirmed) operationalScore += 20;
  operationalScore = clamp(operationalScore);
  const operationalReason = operationalGaps.length
    ? `Unresolved operating evidence: ${operationalGaps.join(", ")}.`
    : "Parking, occupancy capacity, safety readiness, and lease operations lack property-specific documentation.";

  const ageRisk = ageRiskProfile(property, assumptions);
  const conditionScores = {Lower:85, Low:80, Moderate:70, Elevated:60, High:45, "Very high":25};
  const conditionScore = conditionScores[ageRisk?.riskTier] ?? 55;
  const conditionReason = `${ageRisk?.riskTier || "Unverified"} age/condition tier. Turn-ready condition, insurance eligibility, and material system readiness still require property-specific evidence.`;

  const weights = assumptions.roomRentability?.factorWeights || {};
  const factors = [
    {key:"authority", label:"Legal and HOA authority", weight:weights.legalAndHoaAuthority ?? .35, score:authorityScore, reason:authorityReason},
    {key:"capacity", label:"Bedroom and bathroom capacity", weight:weights.bedroomBathroomCapacity ?? .20, score:capacityScore, reason:capacityReason},
    {key:"market", label:"Room-demand fit", weight:weights.roomDemandFit ?? .20, score:marketScore, reason:marketReason},
    {key:"operations", label:"Parking and operating readiness", weight:weights.parkingAndOperations ?? .15, score:operationalScore, reason:operationalReason},
    {key:"condition", label:"Condition and tenant readiness", weight:weights.conditionAndReadiness ?? .10, score:conditionScore, reason:conditionReason}
  ];
  let score = Math.round(factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0));
  if (authorityProhibited) score = 0;
  else if (property.strategy === "shared-condo" && property.hoa?.roomRental === "unknown") score = Math.min(score, assumptions.roomRentability?.unknownCondoHoaScoreCap ?? 35);
  else if (!authorityConfirmed) score = Math.min(score, assumptions.roomRentability?.unknownAuthorityScoreCap ?? 49);
  if (property.privateBath !== "yes") score = Math.min(score, 49);

  const followUps = [];
  if (!authorityConfirmed && !authorityProhibited) followUps.push(property.strategy === "shared-condo" ? "Obtain written HOA and local confirmation that separate room leases are permitted." : "Obtain written zoning, occupancy, registration, and separate-room lease confirmation.");
  if (property.privateBath !== "yes") followUps.push("Confirm the family occupant has a private full bathroom without consuming the tenant bathroom allocation.");
  if (operationalGaps.includes("parking")) followUps.push("Document legal on-site parking capacity for the proposed occupants.");
  if (operationalGaps.includes("wastewater capacity")) followUps.push("Confirm sewer or septic capacity for the proposed bedroom and occupant count.");
  if (operationalGaps.includes("occupancy readiness")) followUps.push("Verify certificate of occupancy and rental inspection readiness.");
  if (!operationalGaps.length) followUps.push("Verify parking, smoke/CO safety, bedroom egress, locks, utilities, insurance, and tenant-ready condition.");

  return {
    required: true,
    score,
    label: likelihoodLabel(score),
    incomeRealizationRate: authorityProhibited ? 0 : authorityConfirmed ? 1 : property.strategy === "shared-condo" ? (assumptions.roomRentability?.unknownCondoHoaScoreCap ?? 35) / 100 : 0.5,
    rentableRooms,
    tenantBathrooms,
    authorityConfirmed,
    factors,
    followUps
  };
}
