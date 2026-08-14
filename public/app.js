const state = { data: null, change: "new", strategy: "all", status: "all", sort: "score" };

const $ = selector => document.querySelector(selector);
const money = value => value == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const percent = value => value == null ? "—" : `${(value * 100).toFixed(1)}%`;
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);
const strategyLabel = value => ({"shared-home":"Shared house","shared-condo":"Shared condo","private-purchase":"Private purchase","rental-benchmark":"Rental benchmark"})[value] || value;
const dateLabel = value => new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {month:"long", day:"numeric", year:"numeric"});

function badgeClass(status) {
  if (status === "Qualified") return "qualified";
  if (status === "Needs verification") return "verify";
  if (status === "Rejected") return "rejected";
  return "";
}

function rentabilityClass(score) {
  if (score >= 65) return "rent-high";
  if (score >= 35) return "rent-low";
  return "rent-very-low";
}

function statusGate(property) {
  if (property.recommendation === "Qualified") return property.qualification?.cardComment || "All current eligibility gates are documented as satisfied.";
  if (property.recommendation === "Benchmark") return "Reference option, not scored as a purchase.";
  const unresolvedGate = property.qualification?.gates?.find(gate => gate.status === "failed") || property.qualification?.gates?.find(gate => gate.status === "unresolved");
  if (unresolvedGate) return unresolvedGate.reason;
  return "A hard decision gate is unresolved.";
}

function renderCard(property) {
  const ten = property.financials?.[10];
  const benchmark = property.strategy === "rental-benchmark";
  const price = benchmark ? `${money(property.price)}/mo` : money(property.price);
  const score = property.score?.total ?? "—";
  const priceNote = benchmark ? `${money(property.priceRange[0])}–${money(property.priceRange[1])} observed range` : property.offer.aboveCeiling ? `Model uses ${money(property.offer.modeledPurchasePrice)} max offer · ${(property.offer.requiredDiscount*100).toFixed(1)}% below list required` : property.priceCutPercent ? `${property.priceCutPercent}% below original list · within offer ceiling` : "Within $275,000 offer ceiling";
  const roomBadge = property.roomRentability?.required ? `<span class="badge ${rentabilityClass(property.roomRentability.score)}">Room rental: ${escapeHtml(property.roomRentability.label)} ${property.roomRentability.score}/100</span>` : "";
  const distanceBadge = Number.isFinite(property.distanceMiles) ? `<span class="badge distance">${property.distanceMiles.toFixed(1)} mi · ${property.driveMinutes} min from reference</span>` : "";
  return `<article class="property-card ${property.recommendation === "Qualified" ? "qualified" : ""}" data-id="${escapeHtml(property.id)}">
    <div class="card-identity"><div class="badges">
      <span class="badge ${property.changeCategory === "new" ? "new" : ""}">${escapeHtml(property.changeCategory === "new" ? "New today" : property.changeCategory)}</span>
      <span class="badge">${escapeHtml(strategyLabel(property.strategy))}</span>
      <span class="badge ${badgeClass(property.recommendation)}">${escapeHtml(property.recommendation)}</span>
      ${roomBadge}
      ${distanceBadge}
    </div><h3>${escapeHtml(property.address)}</h3><p class="property-type">${escapeHtml(property.propertyType || property.distanceLabel)} · ${escapeHtml(priceNote)}</p></div>
    <div class="score"><strong>${score}</strong><small>${benchmark ? "reference" : "score"}</small></div>
    <div class="card-facts">
      <div class="fact"><strong>${price}</strong><small>${benchmark ? "Monthly rent" : "List price"}</small></div>
      <div class="fact"><strong>${benchmark ? "N/A" : money(property.offer.modeledPurchasePrice)}</strong><small>Modeled offer</small></div>
      <div class="fact"><strong>${benchmark ? "N/A" : money(ten?.mortgageMonthly)}</strong><small>Mortgage P&amp;I / mo</small></div>
      <div class="fact"><strong>${benchmark ? "N/A" : property.offer.aboveCeiling ? `${(property.offer.requiredDiscount*100).toFixed(1)}%` : "0%"}</strong><small>Needed discount</small></div>
      <div class="fact"><strong>${property.beds ?? "—"} / ${property.baths ?? "—"}</strong><small>Beds / baths</small></div>
      <div class="fact"><strong>${property.yearBuilt ?? "—"}</strong><small>Year built</small></div>
      <div class="fact"><strong>${benchmark ? "N/A" : property.hoa?.exists ? `${money(property.hoaMonthly)}/mo` : "None"}</strong><small>Reported HOA</small></div>
      <div class="fact"><strong>${property.daysOnMarket ?? "—"}</strong><small>Days listed</small></div>
      <div class="fact"><strong>${benchmark ? money(property.price) : money(ten?.monthlySubsidy)}</strong><small>${benchmark ? "Monthly" : "Subsidy / mo"}</small></div>
      <div class="fact"><strong>${benchmark ? "N/A" : percent(ten?.irr)}</strong><small>10-year IRR</small></div>
    </div>
    <p class="card-summary">${escapeHtml(property.summary)}</p>
    <div class="card-decision">
      <div class="gate ${property.recommendation === "Qualified" || benchmark ? "ok" : ""}"><strong>${escapeHtml(property.recommendation === "Qualified" ? "Why it qualifies" : property.recommendation)}:</strong> ${escapeHtml(statusGate(property))}</div>
      <div class="card-actions"><button class="detail-button" type="button" data-detail="${escapeHtml(property.id)}">Review details</button><a class="source-link" href="${escapeHtml(property.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open primary source ↗</a></div>
    </div>
  </article>`;
}

function filteredProperties() {
  const active = state.data.properties.filter(property => {
    const changeMatch = state.change === "all" ? property.status === "active" : property.changeCategory === state.change;
    const strategyMatch = state.strategy === "all" || property.strategy === state.strategy;
    const statusMatch = state.status === "all" || property.recommendation === state.status;
    return changeMatch && strategyMatch && statusMatch;
  });
  return active.sort((a,b) => {
    if (state.sort === "subsidy") return (a.financials?.[10]?.monthlySubsidy ?? Number.MAX_SAFE_INTEGER) - (b.financials?.[10]?.monthlySubsidy ?? Number.MAX_SAFE_INTEGER);
    if (state.sort === "price") return a.price - b.price;
    if (state.sort === "days") return (a.daysOnMarket ?? 9999) - (b.daysOnMarket ?? 9999);
    if (state.sort === "distance") return (a.distanceMiles ?? Number.MAX_SAFE_INTEGER) - (b.distanceMiles ?? Number.MAX_SAFE_INTEGER);
    return (b.score?.total ?? -1) - (a.score?.total ?? -1);
  });
}

function renderList() {
  const properties = filteredProperties();
  $("#property-list").innerHTML = properties.map(renderCard).join("");
  $("#empty-state").hidden = properties.length > 0;
  $("#result-summary").textContent = `${properties.length} option${properties.length === 1 ? "" : "s"} shown`;
  document.querySelectorAll("[data-detail]").forEach(button => button.addEventListener("click", () => openDetail(button.dataset.detail)));
}

function renderOverview() {
  const purchases = state.data.properties.filter(p => p.strategy !== "rental-benchmark" && p.status === "active");
  const qualified = purchases.filter(p => p.recommendation === "Qualified");
  const verification = purchases.filter(p => p.recommendation === "Needs verification");
  const subsidies = purchases.map(p => p.financials?.[10]?.monthlySubsidy).filter(Number.isFinite);
  $("#candidate-count").textContent = purchases.length;
  $("#new-count").textContent = purchases.filter(p => p.changeCategory === "new").length;
  $("#verification-count").textContent = verification.length;
  $("#qualified-count").textContent = qualified.length;
  $("#lowest-subsidy").textContent = subsidies.length ? `${money(Math.min(...subsidies))}/mo` : "—";
  $("#decision-note").textContent = qualified.length ? `${qualified.length} option${qualified.length === 1 ? " clears" : "s clear"} every current eligibility gate. Financial hurdles remain separate and are shown in each detail.` : "No purchase candidate clears every eligibility gate yet. Verification can change that.";
  $("#as-of").textContent = `Research current as of ${dateLabel(state.data.asOf)}`;
  $("#run-status").textContent = `Last successful research: ${dateLabel(state.data.asOf)}`;
  $("#model-version").textContent = `Model ${state.data.assumptions.modelVersion} · Data ${state.data.asOf}`;
  const categories = ["new","changed","existing","archived"];
  categories.forEach(category => $(`#tab-${category}`).textContent = state.data.properties.filter(p => p.changeCategory === category).length);
  $("#tab-all").textContent = state.data.properties.filter(p => p.status === "active").length;
}

function renderComparison() {
  const properties = state.data.properties.filter(p => p.financials?.[10]).sort((a,b) => b.score.total - a.score.total);
  $("#comparison-table tbody").innerHTML = properties.map(property => {
    const result = property.financials[10];
    const gapClass = result.wealthGapVsHurdle >= 0 ? "positive" : "negative";
    return `<tr><td>${escapeHtml(property.address)}</td><td>${Number.isFinite(property.distanceMiles) ? `${property.distanceMiles.toFixed(1)} mi · ${property.driveMinutes} min` : "—"}</td><td>${money(result.modeledPurchasePrice)}${property.offer.aboveCeiling ? "*" : ""}</td><td>${money(result.initialCash)}</td><td>${money(result.monthlySubsidy)}</td><td class="${(result.irr ?? -1) >= .07 ? "positive" : "negative"}">${percent(result.irr)}</td><td>${money(result.netSaleProceeds)}</td><td class="${gapClass}">${result.wealthGapVsHurdle >= 0 ? "+" : ""}${money(result.wealthGapVsHurdle)}</td></tr>`;
  }).join("");
}

function scoreBars(property) {
  const labels = {livingSuitability:"Living suitability",monthlySupportability:"Monthly supportability",investmentReturn:"Investment return",pricingNegotiation:"Pricing and negotiation",roomRentalViability:"Room-rental viability",riskOptionality:"Risk and optionality"};
  return Object.entries(property.score?.components || {}).map(([key,value]) => `<div class="score-bar"><span>${labels[key]}</span><div class="bar-track"><div class="bar-fill" style="width:${value}%"></div></div><strong>${value}</strong></div>`).join("");
}

function criteriaAssessment(property, ten) {
  const benchmark = property.strategy === "rental-benchmark";
  const maxOffer = state.data.assumptions.purchase.maximumOfferPrice;
  const privateBath = property.privateBath === "yes"
    ? ["Meets", "Private full bathroom is documented.", "meet"]
    : ["Verify", "Private full bathroom is not yet documented.", "warn"];
  const offer = benchmark
    ? ["Reference", "Rental option has no purchase price.", "info"]
    : property.price <= maxOffer
      ? ["Meets", `${money(property.price)} list price is within the ${money(maxOffer)} ceiling.`, "meet"]
      : ["Conditional", `${money(property.offer.modeledPurchasePrice)} modeled offer requires a ${(property.offer.requiredDiscount*100).toFixed(1)}% seller discount.`, "warn"];
  const sharing = benchmark || property.strategy === "private-purchase"
    ? ["Not needed", "This strategy does not rely on individual-room income.", "info"]
    : property.roomRentability
      ? [`${property.roomRentability.label} ${property.roomRentability.score}/100`, `${money(ten?.roomRevenueMonthly)} of ${money(ten?.fullRoomRevenueMonthly)} potential monthly room income is underwritten after the viability haircut. ${property.roomRentability.authorityConfirmed ? "Authority is documented." : "Rental authority remains unresolved."}`, property.roomRentability.score >= 65 ? "meet" : property.roomRentability.score >= 35 ? "warn" : "no"]
      : ["Verify", "Room-rental viability has not been evaluated.", "warn"];
  const investment = benchmark
    ? ["Reference", "No ownership return is modeled.", "info"]
    : (ten?.irr ?? -1) >= state.data.assumptions.comparison.forwardHurdleRate
      ? ["Meets", `${percent(ten.irr)} modeled 10-year IRR exceeds the 7% hurdle.`, "meet"]
      : ["Below hurdle", `${percent(ten?.irr)} modeled 10-year IRR is below the 7% hurdle.`, "no"];
  const age = benchmark
    ? ["Reference", "Repair and capital risk remain with the landlord.", "info"]
    : property.ageRisk
      ? [property.ageRisk.riskTier, `${property.ageRisk.ageYears} years old · ${property.ageRisk.reserveMultiplier.toFixed(2)}× reserve factor · ${property.ageRisk.scorePenalty}-point deduction inside risk and optionality.`, ["Lower", "Low"].includes(property.ageRisk.riskTier) ? "meet" : property.ageRisk.riskTier === "Moderate" ? "info" : "warn"]
      : ["Verify", "Construction year and age risk are not documented.", "warn"];
  const rows = [
    ["Private living", ...privateBath],
    ["Location", "Meets", property.distanceLabel, "meet"],
    ["Offer ceiling", ...offer],
    ["Room-income strategy", ...sharing],
    ["Age / condition", ...age],
    ["10-year return", ...investment]
  ];
  return rows.map(([label,status,note,tone]) => `<div class="criteria-row"><strong>${escapeHtml(label)}</strong><span class="criteria-status ${tone}">${escapeHtml(status)}</span><span>${escapeHtml(note)}</span></div>`).join("");
}

function propertyFacts(property, ten) {
  const marketDelta = property.pricePerSqft && property.marketPricePerSqft
    ? `${Math.abs((property.pricePerSqft/property.marketPricePerSqft-1)*100).toFixed(0)}% ${(property.pricePerSqft/property.marketPricePerSqft-1) <= 0 ? "below" : "above"} cited market`
    : "Not available";
  const facts = [
    ["Property type", property.propertyType || "Not available"],
    ["Beds / baths", `${property.beds ?? "—"} / ${property.baths ?? "—"}`],
    ["Living area", property.sqft ? `${property.sqft.toLocaleString()} sq ft` : "Not available"],
    ["Year built / age", property.ageRisk ? `${property.yearBuilt} · ${property.ageRisk.ageYears} years` : property.yearBuilt ?? "Not available"],
    ["Days listed", property.daysOnMarket ?? "Not available"],
    ["Price / sq ft", property.pricePerSqft ? `${money(property.pricePerSqft)} · ${marketDelta}` : "Not available"],
    ["HOA", property.hoa?.exists ? `${money(property.hoaMonthly)}/mo reported; verify` : "None reported; verify"],
    ["Layout", property.oneLevel ? "One level" : "Multiple levels / stairs acceptable"],
    ["Distance / drive", Number.isFinite(property.distanceMiles) ? `${property.distanceMiles.toFixed(1)} miles · about ${property.driveMinutes} minutes` : "Not available"],
    ["Private bath", property.privateBath === "yes" ? "Confirmed" : "Unconfirmed"],
    [property.roomRentability?.required ? "Room-rental likelihood" : "Monthly subsidy", property.roomRentability?.required ? `${property.roomRentability.label} · ${property.roomRentability.score}/100` : ten ? money(ten.monthlySubsidy) : "Rental benchmark"]
  ];
  return facts.map(([label,value]) => `<div class="property-fact"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`).join("");
}

function recurringCosts(property, ten) {
  if (!ten) return `<p class="cost-note">The rental benchmark is the advertised monthly rent. Deposits, application fees, utilities, renter insurance, and move-in charges are not included unless a source explicitly documents them.</p>`;
  const o = state.data.assumptions.operations;
  const price = ten.modeledPurchasePrice;
  const rows = [
    ["Mortgage principal + interest", ten.mortgageMonthly, "Modeled"],
    ["Property tax", price * o.propertyTaxRate / 12, "Modeled rate"],
    ["Insurance", price * o.insuranceRate / 12, "Modeled rate"],
    ["Age-adjusted maintenance reserve", ten.maintenanceReserveMonthly, `${ten.ageReserveMultiplier.toFixed(2)}× age factor`],
    ["Age-adjusted capital reserve", ten.capitalReserveMonthly, `${ten.ageReserveMultiplier.toFixed(2)}× age factor`],
    ["HOA / association", property.hoa?.exists ? property.hoaMonthly || 0 : 0, property.hoa?.exists ? "Reported; verify" : "None reported"],
    ["Shared utilities", ten.rentableRooms ? o.sharedUtilitiesMonthly : 0, ten.rentableRooms ? "Modeled" : "Not applicable"],
    ["Less underwritten room income", -ten.roomRevenueMonthly, ten.rentableRooms ? `${ten.rentableRooms} room${ten.rentableRooms === 1 ? "" : "s"}; ${(ten.roomIncomeRealizationRate*100).toFixed(0)}% viability factor after vacancy` : "Not applicable"]
  ];
  return `<div class="cost-table">${rows.map(([label,value,basis]) => `<div class="cost-row"><span>${escapeHtml(label)}</span><strong class="${value < 0 ? "cost-offset" : ""}">${value < 0 ? "−" : ""}${money(Math.abs(Math.round(value)))}</strong><small>${escapeHtml(basis)}</small></div>`).join("")}<div class="cost-row cost-total"><span>Estimated monthly subsidy</span><strong>${money(ten.monthlySubsidy)}</strong><small>Year one</small></div></div><p class="cost-note">Components are displayed as rounded dollars; the total is calculated before rounding. The age adjustment changes reserves by ${ten.ageReservePremiumMonthly >= 0 ? "+" : "−"}${money(Math.abs(ten.ageReservePremiumMonthly))}/mo versus the baseline. Initial cash is ${money(ten.initialCash)}, including the modeled down payment and buyer closing costs. Inspection, appraisal, lender fees beyond the closing-cost allowance, title exceptions, special assessments, repairs, and property-specific insurance surcharges require quotes or documents.</p>`;
}

function roomRentabilityDetail(property, ten) {
  const rentability = property.roomRentability;
  if (!rentability?.required || !ten) return `<p class="cost-note">This strategy does not depend on individual-room rental income.</p>`;
  const factors = rentability.factors.map(factor => `<div class="rentability-row"><span>${escapeHtml(factor.label)}<small>${(factor.weight*100).toFixed(0)}% weight</small></span><strong>${factor.score}/100</strong><p>${escapeHtml(factor.reason)}</p></div>`).join("");
  return `<div class="age-risk-summary rentability-summary">
    <div><small>Likelihood</small><strong>${escapeHtml(rentability.label)} · ${rentability.score}/100</strong></div>
    <div><small>Potential rooms</small><strong>${rentability.rentableRooms}</strong></div>
    <div><small>Potential income</small><strong>${money(ten.fullRoomRevenueMonthly)}/mo</strong></div>
    <div><small>Underwritten income</small><strong>${money(ten.roomRevenueMonthly)}/mo</strong></div>
    <div><small>Income at risk</small><strong>${money(ten.roomIncomeAtRiskMonthly)}/mo</strong></div>
  </div><div class="rentability-table">${factors}</div><h4>Required follow-up</h4><ul>${rentability.followUps.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul><p class="cost-note">The likelihood score is a conservative underwriting heuristic, not an empirical probability. It is applied before the separate ${Math.round(state.data.assumptions.operations.vacancyRate*100)}% vacancy assumption. Documented legal authority, parking, occupant capacity, safety, condition, and property-specific demand can raise the score on a future run.</p>`;
}

function qualificationDetail(property) {
  const qualification = property.qualification;
  if (!qualification?.allRequiredGatesMet) return "";
  const gates = qualification.gates.map(gate => `<div class="qualification-row"><span aria-hidden="true">✓</span><div><strong>${escapeHtml(gate.label)}</strong><p>${escapeHtml(gate.reason)}</p></div></div>`).join("");
  const caveats = qualification.caveats.length ? `<div class="qualification-caveats"><strong>Qualification does not resolve these financial or diligence issues</strong><ul>${qualification.caveats.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` : "";
  return `<section class="qualification-panel"><h3>Why this property qualifies</h3><p class="qualification-intro">It clears all ${qualification.gates.length} current eligibility gates:</p><div class="qualification-checklist">${gates}</div>${caveats}</section>`;
}

function ageRiskDetail(property, ten) {
  if (!property.ageRisk || !ten) return `<p class="cost-note">This is a rental benchmark. The landlord retains age-related repair and capital risk.</p>`;
  const risk = property.ageRisk;
  const annualReserve = (ten.maintenanceReserveMonthly + ten.capitalReserveMonthly) * 12;
  return `<div class="age-risk-summary">
    <div><small>Age at model date</small><strong>${risk.ageYears} years</strong></div>
    <div><small>Risk tier</small><strong>${escapeHtml(risk.riskTier)}</strong></div>
    <div><small>Reserve factor</small><strong>${risk.reserveMultiplier.toFixed(2)}×</strong></div>
    <div><small>Annual reserve</small><strong>${money(annualReserve)}</strong></div>
    <div><small>Risk-score deduction</small><strong>−${risk.scorePenalty}</strong></div>
  </div><h4>Inspection and potential rework priorities</h4><ul>${risk.diligence.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul><p class="cost-note">This is an age-based planning proxy, not an upfront repair estimate or contractor bid. Listing claims such as “renovated” do not reduce the factor until permits, invoices, system ages, inspection findings, and warranties substantiate the work.</p>`;
}

function openDetail(id) {
  const property = state.data.properties.find(p => p.id === id);
  if (!property) return;
  const ten = property.financials?.[10];
  const fifteen = property.financials?.[15];
  const financialSection = ten ? `<div class="financial-cards">
    <div class="financial-card"><strong>${money(ten.monthlySubsidy)}</strong><small>Monthly subsidy, year one</small></div>
    <div class="financial-card"><strong>${percent(ten.irr)}</strong><small>10-year modeled IRR</small></div>
    <div class="financial-card"><strong>${percent(fifteen.irr)}</strong><small>15-year modeled IRR</small></div>
    <div class="financial-card"><strong>${money(ten.wealthGapVsHurdle)}</strong><small>10-year wealth gap vs 7%</small></div>
    <div class="financial-card"><strong>${money(ten.modeledPurchasePrice)}</strong><small>Modeled purchase price${property.offer.aboveCeiling ? `; ${(property.offer.requiredDiscount*100).toFixed(1)}% below list required` : ""}</small></div>
    <div class="financial-card"><strong>${money(ten.initialCash)}</strong><small>Down payment + closing</small></div>
    <div class="financial-card"><strong>${money(ten.taxEstimate)}</strong><small>Estimated sale taxes at year 10</small></div>
  </div>` : `<p>This is a rental benchmark, not a purchase investment.</p>`;
  const sources = property.sources.map(source => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)} · checked ${escapeHtml(source.accessed)}</a>`).join("");
  const history = property.listingHistory.length ? property.listingHistory.map(item => `<p><strong>${escapeHtml(item.date)}</strong> · ${escapeHtml(item.event)} ${item.price ? `· ${money(item.price)}` : ""}</p>`).join("") : "<p>No purchase history included for this benchmark.</p>";
  $("#dialog-content").innerHTML = `<div class="detail-header"><div class="badges"><span class="badge">${escapeHtml(strategyLabel(property.strategy))}</span><span class="badge ${badgeClass(property.recommendation)}">${escapeHtml(property.recommendation)}</span></div><h2 id="dialog-title">${escapeHtml(property.address)}</h2><p>${escapeHtml(property.summary)}</p></div>
  <section class="detail-verdict ${property.recommendation === "Qualified" ? "qualified" : ""}"><strong>${escapeHtml(property.recommendation)}.</strong> ${escapeHtml(statusGate(property))}</section>
  ${qualificationDetail(property)}
  <section class="criteria-panel"><h3>Criteria fit</h3><div class="criteria-table">${criteriaAssessment(property, ten)}</div></section>
  <section class="property-facts-panel"><h3>Property specifics</h3><div class="property-facts-grid">${propertyFacts(property, ten)}</div></section>
  <section class="room-rental-panel"><h3>Room-rental viability</h3>${roomRentabilityDetail(property, ten)}</section>
  <section class="age-risk-panel"><h3>Age, condition and rework risk</h3>${ageRiskDetail(property, ten)}</section>
  <section class="cost-panel"><h3>Recurring cost components</h3>${recurringCosts(property, ten)}</section>
  <div class="detail-grid">
    <section class="detail-panel"><h3>Decision score</h3>${property.score ? `<div class="score-bars">${scoreBars(property)}</div><p class="cost-note">Room-rental viability is 15% of the total score and also changes underwritten income, subsidy, and investment return. Age deducts ${property.score.agePenalty} points inside risk and optionality and also changes reserves.</p>` : "<p>Reference option, not scored.</p>"}</section>
    <section class="detail-panel"><h3>Financial model</h3>${financialSection}</section>
    <section class="detail-panel"><h3>Why it could work</h3><ul>${property.pros.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
    <section class="detail-panel"><h3>Concerns and gates</h3><ul>${property.concerns.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>${property.sourceConflicts.length ? `<p><strong>Source conflict:</strong> ${escapeHtml(property.sourceConflicts.join(" "))}</p>` : ""}</section>
    <section class="detail-panel"><h3>HOA / rental authority</h3><p><strong>Individual-room rental:</strong> ${escapeHtml(property.hoa.roomRental)}</p><p><strong>Evidence confidence:</strong> ${escapeHtml(property.hoa.confidence)}</p><p>${escapeHtml(property.hoa.followUp)}</p></section>
    <section class="detail-panel"><h3>Listing history</h3><div class="history">${history}</div></section>
    <section class="detail-panel"><h3>Sources</h3><div class="source-list">${sources}</div></section>
    <section class="detail-panel"><h3>Location</h3><p>${escapeHtml(property.distanceLabel)}</p><p>${property.distanceAsOf ? `Fastest driving-route estimate checked ${escapeHtml(dateLabel(property.distanceAsOf))}. Drive time varies with traffic.` : "Route estimate not available."}</p><p>Exact family reference address and coordinates are intentionally excluded from this public site.</p></section>
  </div>`;
  const dialog = $("#detail-dialog");
  dialog.showModal();
  dialog.scrollTop = 0;
  $("#dialog-content").scrollTop = 0;
  dialog.querySelector(".dialog-close").focus({preventScroll:true});
}

function renderMethod() {
  const a = state.data.assumptions;
  const weights = [["Living suitability","Private room/bath, layout, capacity",25],["Monthly supportability","Mortgage, age-adjusted reserves, viability-adjusted rent offset",20],["Investment return","Viability- and age-adjusted IRR versus the 7% hurdle",20],["Pricing and negotiation","Price per square foot, cuts, market time",10],["Room-rental viability","Authority, capacity, demand, operations, condition",15],["Risk and optionality","Evidence gaps, age, conflicts, exit flexibility",10]];
  const coverage = [
    ...state.data.sourcePolicy.listingDiscovery.map(item => ({...item, section:"Listing discovery"})),
    ...state.data.sourcePolicy.propertyVerification.map(item => ({...item, section:"Property verification"})),
    ...state.data.sourcePolicy.rentEvidence.map(item => ({...item, section:"Rent evidence"}))
  ];
  $("#method-content").innerHTML = `<div class="method-list">${weights.map(row => `<div class="method-row"><strong>${row[0]}</strong><span>${row[1]}</span><strong>${row[2]}%</strong></div>`).join("")}</div>
    <div class="method-warning"><strong>Eligibility gates override the score.</strong> “Qualified” means the listing is active, the private living arrangement is documented, the property is within 30 driving miles and the offer ceiling, the layout fits, and any room-rental authority required by the strategy is documented. It does not mean the property clears the 7% return hurdle or requires no subsidy. Distance and drive time are measured from the private family reference property without publishing its address.</div>
    <h3>Public planning assumptions</h3><div class="assumption-grid">
      <div class="assumption"><strong>${(a.purchase.downPaymentRate*100).toFixed(0)}% down</strong><small>Plus ${(a.purchase.buyerClosingCostRate*100).toFixed(0)}% buyer closing costs</small></div>
      <div class="assumption"><strong>${money(a.purchase.maximumOfferPrice)}</strong><small>Absolute maximum offer and modeled acquisition price</small></div>
      <div class="assumption"><strong>${percent(a.purchase.mortgageRate)}</strong><small>30-year planning mortgage rate</small></div>
      <div class="assumption"><strong>${money(a.operations.roomRentMonthly)}/room</strong><small>${(a.operations.vacancyRate*100).toFixed(0)}% vacancy; ${money(a.operations.roomRentLow)}–${money(a.operations.roomRentHigh)} sensitivity</small></div>
      <div class="assumption"><strong>${percent(a.operations.appreciationRate)}</strong><small>Annual property appreciation assumption</small></div>
      <div class="assumption"><strong>${percent(a.operations.maintenanceRate + a.operations.capitalExpenditureRate)}</strong><small>Baseline annual maintenance + capital reserve; scaled ${Math.min(...a.ageRisk.bands.map(b => b.reserveMultiplier)).toFixed(2)}×–${Math.max(...a.ageRisk.bands.map(b => b.reserveMultiplier)).toFixed(2)}× by property age</small></div>
      <div class="assumption"><strong>0–100</strong><small>Room-rental likelihood; applied as the income realization factor before vacancy</small></div>
      <div class="assumption"><strong>${percent(a.comparison.forwardHurdleRate)}</strong><small>Forward alternative-investment hurdle</small></div>
      <div class="assumption"><strong>${percent(a.comparison.sp500Trailing10YearAnnualized)}</strong><small>Trailing 10-year S&amp;P benchmark as of ${escapeHtml(a.comparison.sp500AsOf)}; historical context only</small></div>
    </div><p class="fine-print">${escapeHtml(a.roomRentability.note)} ${escapeHtml(a.ageRisk.note)} ${escapeHtml(a.tax.note)}</p>
    <h3>Research coverage</h3><div class="coverage-table">${coverage.map(item => `<div class="coverage-row"><span>${escapeHtml(item.section)}</span><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.sources.join(", "))}</span><em class="coverage-status ${escapeHtml(item.status)}">${escapeHtml(item.status.replaceAll("-", " "))}</em></div>`).join("")}</div>
    <h3>Methodology sources</h3><div class="source-list">${state.data.methodologySources.map(source => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a>`).join("")}</div>`;
}

function setupEvents() {
  document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(item => {item.classList.remove("active"); item.setAttribute("aria-selected","false");});
    tab.classList.add("active"); tab.setAttribute("aria-selected","true"); state.change = tab.dataset.change; renderList();
  }));
  [["#strategy-filter","strategy"],["#status-filter","status"],["#sort-filter","sort"]].forEach(([selector,key]) => $(selector).addEventListener("change", event => { state[key] = event.target.value; renderList(); }));
  $("#method-button").addEventListener("click", () => $("#method-dialog").showModal());
  $("#sources-button").addEventListener("click", () => $("#method-dialog").showModal());
  document.querySelectorAll("dialog").forEach(dialog => {
    dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  });
}

async function init() {
  try {
    const response = await fetch("data/app-data.json", {cache:"no-store"});
    if (!response.ok) throw new Error(`Data request failed: ${response.status}`);
    state.data = await response.json();
    renderOverview(); renderList(); renderComparison(); renderMethod(); setupEvents();
  } catch (error) {
    $("#run-status").textContent = "Research data unavailable";
    $("#property-list").innerHTML = `<div class="empty-state"><h3>Validated property data is unavailable</h3><p>The dashboard will not substitute placeholder listings. Please try again later.</p></div>`;
    console.error(error);
  }
}

init();
