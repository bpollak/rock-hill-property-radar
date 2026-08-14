import { ageRiskProfile } from "./age-risk.mjs";
import { roomRentabilityProfile } from "./room-rentability.mjs";

const clamp = value => Math.max(0, Math.min(100, value));
const moneyText = value => new Intl.NumberFormat("en-US", {style:"currency", currency:"USD", maximumFractionDigits:0}).format(value);
const percentText = value => `${(value * 100).toFixed(1)}%`;

function pricingScore(property, assumptions) {
  let score = 55;
  if (property.priceCutPercent >= 10) score += 15;
  else if (property.priceCutPercent >= 5) score += 8;
  if (property.pricePerSqft && property.marketPricePerSqft) {
    const ratio = property.pricePerSqft / property.marketPricePerSqft;
    if (ratio < 0.75) score += 20;
    else if (ratio < 0.9) score += 12;
    else if (ratio > 1.1) score -= 12;
  }
  if (property.sourceConflicts?.length) score -= 8;
  const ceiling = assumptions.purchase.maximumOfferPrice;
  const requiredDiscount = Math.max(0, (property.price - ceiling) / property.price);
  if (requiredDiscount > 0.10) score -= 25;
  else if (requiredDiscount > 0.05) score -= 12;
  else if (requiredDiscount > 0) score -= 6;
  return clamp(score);
}

export function qualificationProfile(property, assumptions = {}, financials = null) {
  if (property.strategy === "rental-benchmark") return {status:"Benchmark", allRequiredGatesMet:false, gates:[], reasons:[], caveats:[], summary:"Reference option, not evaluated as a purchase candidate.", cardComment:"Reference option."};

  const maximumOfferPrice = assumptions.purchase?.maximumOfferPrice ?? 275000;
  const maximumDrivingMiles = assumptions.livingRequirements?.maximumDrivingMiles ?? 30;
  const stairsAcceptable = assumptions.livingRequirements?.stairsAcceptable ?? true;
  const gates = [];
  const addGate = (key, label, status, reason, shortReason) => gates.push({key, label, status, reason, shortReason});

  addGate("listing", "Active listing", property.status === "active" ? "met" : "failed",
    property.status === "active" ? "The current research snapshot identifies the property as actively marketed." : "The property is not currently identified as active.",
    property.status === "active" ? "active listing" : "inactive listing");

  const bedroomKnown = Number(property.beds) >= 1;
  const privateLivingStatus = bedroomKnown && property.privateBath === "yes" ? "met" : property.privateBath === "no" || !bedroomKnown ? "failed" : "unresolved";
  addGate("private-living", "Private bedroom and full bathroom", privateLivingStatus,
    privateLivingStatus === "met" ? `${property.beds} bedroom${property.beds === 1 ? " is" : "s are"} reported, and a private full bathroom for the family occupant is documented.` : privateLivingStatus === "failed" ? "A private bedroom and private full bathroom are not both available." : "The private full bathroom has not been documented.",
    privateLivingStatus === "met" ? `${property.beds} bedroom${property.beds === 1 ? "" : "s"} with a documented private full bathroom` : "private living arrangement unresolved");

  const distanceKnown = Number.isFinite(property.distanceMiles) && Number.isFinite(property.driveMinutes);
  const distanceStatus = distanceKnown ? (property.distanceMiles <= maximumDrivingMiles ? "met" : "failed") : "unresolved";
  addGate("distance", "Distance", distanceStatus,
    distanceStatus === "met" ? `${property.distanceMiles.toFixed(1)} driving miles and about ${property.driveMinutes} minutes from the family reference property, within the ${maximumDrivingMiles}-mile limit.` : distanceStatus === "failed" ? `${property.distanceMiles.toFixed(1)} driving miles exceeds the ${maximumDrivingMiles}-mile limit.` : "Driving distance from the family reference property is not documented.",
    distanceStatus === "met" ? `${property.distanceMiles.toFixed(1)} mi / ${property.driveMinutes} min within the ${maximumDrivingMiles}-mile limit` : "distance unresolved");

  const offerStatus = Number.isFinite(property.price) ? (property.price <= maximumOfferPrice ? "met" : "unresolved") : "unresolved";
  addGate("offer", "Offer ceiling", offerStatus,
    offerStatus === "met" ? `${moneyText(property.price)} list price is ${moneyText(maximumOfferPrice - property.price)} below the ${moneyText(maximumOfferPrice)} maximum offer.` : `The list price exceeds ${moneyText(maximumOfferPrice)}; seller acceptance at or below the ceiling is unresolved.`,
    offerStatus === "met" ? `${moneyText(property.price)} within the ${moneyText(maximumOfferPrice)} cap` : "seller acceptance within the offer cap unresolved");

  let rentalStatus = "met";
  let rentalReason = "The private-purchase strategy does not depend on individual-room rental income, so room-rental approval is not an eligibility gate.";
  let rentalShortReason = "room-rental approval not required";
  if (property.strategy === "shared-home") {
    rentalStatus = property.roomRentalLegal === "confirmed" ? "met" : property.roomRentalLegal === "prohibited" ? "failed" : "unresolved";
    rentalReason = rentalStatus === "met" ? "Local authority for the proposed unrelated-occupant and room-lease structure is documented." : rentalStatus === "failed" ? "The proposed individual-room rental structure is prohibited." : "Local zoning, occupancy, registration, and separate-room lease authority are unresolved.";
    rentalShortReason = rentalStatus === "met" ? "shared-room authority documented" : "shared-room authority unresolved";
  } else if (property.strategy === "shared-condo") {
    const prohibited = property.roomRentalLegal === "prohibited" || property.hoa?.roomRental === "prohibited";
    rentalStatus = prohibited ? "failed" : property.roomRentalLegal === "confirmed" && property.hoa?.roomRental === "allowed" ? "met" : "unresolved";
    rentalReason = rentalStatus === "met" ? "Both local authority and written HOA authority for individual-room rental are documented." : rentalStatus === "failed" ? "A controlling local or HOA rule prohibits individual-room rental." : "Both local authority and written HOA authority for individual-room rental have not been documented.";
    rentalShortReason = rentalStatus === "met" ? "local and HOA room-rental authority documented" : "local or HOA room-rental authority unresolved";
  }
  addGate("room-rental", "Room-rental dependency", rentalStatus, rentalReason, rentalShortReason);

  addGate("layout", "Layout and stairs", stairsAcceptable ? "met" : property.oneLevel ? "met" : "failed",
    property.oneLevel ? "The reported one-level layout is compatible with the living requirement." : stairsAcceptable ? "The property has multiple levels, and stairs are acceptable for the family occupant." : "The property has multiple levels, but stairs are not acceptable.",
    property.oneLevel ? "one-level layout" : stairsAcceptable ? "stairs acceptable" : "layout incompatible");

  const failed = gates.some(gate => gate.status === "failed");
  const unresolved = gates.some(gate => gate.status === "unresolved");
  const status = failed ? "Rejected" : unresolved ? "Needs verification" : "Qualified";
  const reasons = status === "Qualified" ? gates.map(gate => gate.reason) : [];
  const caveats = [];
  const ten = financials?.[10];
  if (status === "Qualified" && ten) {
    if (ten.monthlySubsidy > 0) caveats.push(`The model still requires an estimated ${moneyText(ten.monthlySubsidy)} monthly subsidy in year one.`);
    const hurdle = assumptions.comparison?.forwardHurdleRate ?? 0.07;
    if ((ten.irr ?? -1) < hurdle) caveats.push(`The ${percentText(ten.irr)} modeled 10-year IRR is below the ${percentText(hurdle)} comparison hurdle; eligibility is not an investment-return endorsement.`);
  }
  if (status === "Qualified" && property.hoa?.exists && property.hoa?.confidence !== "high") caveats.push("HOA dues, reserves, assessments, insurance, and financing eligibility still require document review.");

  return {
    status,
    allRequiredGatesMet: status === "Qualified",
    gates,
    reasons,
    caveats,
    summary: status === "Qualified" ? `Clears all ${gates.length} current eligibility gates.` : status === "Needs verification" ? `${gates.filter(gate => gate.status === "unresolved").length} eligibility gate${gates.filter(gate => gate.status === "unresolved").length === 1 ? " is" : "s are"} unresolved.` : `${gates.filter(gate => gate.status === "failed").length} eligibility gate${gates.filter(gate => gate.status === "failed").length === 1 ? " fails" : "s fail"}.`,
    cardComment: status === "Qualified" ? gates.map(gate => gate.shortReason).join("; ") + "." : ""
  };
}

export function recommendationStatus(property, assumptions = {}) {
  return qualificationProfile(property, assumptions).status;
}

export function scoreProperty(property, financials, assumptions) {
  if (property.strategy === "rental-benchmark") return null;
  const status = recommendationStatus(property, assumptions);
  const living = clamp(35 + Math.min(property.beds, 4) * 8 + (property.privateBath === "yes" ? 25 : property.privateBath === "unknown" ? 5 : -30) + (property.oneLevel ? 8 : 0));
  const ten = financials[10];
  const support = clamp(100 - ten.monthlySubsidy / 35);
  const investment = clamp(50 + ((ten.irr ?? -0.05) - 0.07) * 350);
  const pricing = pricingScore(property, assumptions);
  const ageRisk = ageRiskProfile(property, assumptions);
  const roomRentability = roomRentabilityProfile(property, assumptions);
  const roomRental = roomRentability?.score ?? 100;
  const nonAgeConcernCount = (property.concerns || []).filter(concern => !/\bbuilt in \d{4}\b.*(?:age|inspection|repair|capital|condition)/i.test(concern)).length;
  const risk = clamp(80 - nonAgeConcernCount * 8 - (property.sourceConflicts?.length || 0) * 10 - (status === "Needs verification" ? 15 : 0) - (ageRisk?.scorePenalty || 0));
  const total = Math.round(living * 0.25 + support * 0.20 + investment * 0.20 + pricing * 0.10 + roomRental * 0.15 + risk * 0.10);
  return {
    total,
    status,
    agePenalty: ageRisk?.scorePenalty || 0,
    components: {
      livingSuitability: Math.round(living),
      monthlySupportability: Math.round(support),
      investmentReturn: Math.round(investment),
      pricingNegotiation: Math.round(pricing),
      roomRentalViability: Math.round(roomRental),
      riskOptionality: Math.round(risk)
    }
  };
}
