import { ageRiskProfile } from "./age-risk.mjs";

const clamp = value => Math.max(0, Math.min(100, value));

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

export function recommendationStatus(property) {
  if (property.status !== "active") return "Rejected";
  if (property.strategy === "rental-benchmark") return "Benchmark";
  if (property.privateBath === "no") return "Rejected";
  if (property.privateBath !== "yes") return "Needs verification";
  if (property.strategy === "shared-condo") {
    if (property.hoa.roomRental === "prohibited") return "Rejected";
    if (property.hoa.roomRental === "unknown") return "Needs verification";
  }
  if (property.strategy === "shared-home" && property.roomRentalLegal !== "confirmed") return "Needs verification";
  return "Qualified";
}

export function scoreProperty(property, financials, assumptions) {
  if (property.strategy === "rental-benchmark") return null;
  const status = recommendationStatus(property);
  const living = clamp(35 + Math.min(property.beds, 4) * 8 + (property.privateBath === "yes" ? 25 : property.privateBath === "unknown" ? 5 : -30) + (property.oneLevel ? 8 : 0));
  const ten = financials[10];
  const support = clamp(100 - ten.monthlySubsidy / 35);
  const investment = clamp(50 + ((ten.irr ?? -0.05) - 0.07) * 350);
  const pricing = pricingScore(property, assumptions);
  const ageRisk = ageRiskProfile(property, assumptions);
  const nonAgeConcernCount = (property.concerns || []).filter(concern => !/\bbuilt in \d{4}\b.*(?:age|inspection|repair|capital|condition)/i.test(concern)).length;
  const risk = clamp(80 - nonAgeConcernCount * 8 - (property.sourceConflicts?.length || 0) * 10 - (status === "Needs verification" ? 15 : 0) - (ageRisk?.scorePenalty || 0));
  const total = Math.round(living * 0.30 + support * 0.20 + investment * 0.20 + pricing * 0.15 + risk * 0.15);
  return {
    total,
    status,
    agePenalty: ageRisk?.scorePenalty || 0,
    components: {
      livingSuitability: Math.round(living),
      monthlySupportability: Math.round(support),
      investmentReturn: Math.round(investment),
      pricingNegotiation: Math.round(pricing),
      riskOptionality: Math.round(risk)
    }
  };
}
