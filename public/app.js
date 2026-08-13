const state = { data: null, change: "new", strategy: "all", status: "all", sort: "score" };

const $ = selector => document.querySelector(selector);
const money = value => value == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const percent = value => value == null ? "—" : `${(value * 100).toFixed(1)}%`;
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);
const strategyLabel = value => ({"shared-home":"Shared house","shared-condo":"Shared condo","private-purchase":"Private purchase","rental-benchmark":"Rental benchmark"})[value] || value;
const dateLabel = value => new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {month:"long", day:"numeric", year:"numeric"});

function badgeClass(status) {
  if (status === "Needs verification") return "verify";
  if (status === "Rejected") return "rejected";
  return "";
}

function statusGate(property) {
  if (property.recommendation === "Qualified") return "Living and rental gates are documented as satisfied.";
  if (property.recommendation === "Benchmark") return "Reference option, not scored as a purchase.";
  if (property.privateBath !== "yes") return "Private full bathroom must be confirmed.";
  if (property.strategy === "shared-condo" && property.hoa.roomRental === "unknown") return "HOA room-rental authority must be documented.";
  if (property.roomRentalLegal !== "confirmed" && property.strategy === "shared-home") return "Room-rental zoning and occupancy must be confirmed.";
  return "A hard decision gate is unresolved.";
}

function renderCard(property) {
  const ten = property.financials?.[10];
  const benchmark = property.strategy === "rental-benchmark";
  const price = benchmark ? `${money(property.price)}/mo` : money(property.price);
  const score = property.score?.total ?? "—";
  const priceNote = benchmark ? `${money(property.priceRange[0])}–${money(property.priceRange[1])} observed range` : property.offer.aboveCeiling ? `Model uses ${money(property.offer.modeledPurchasePrice)} max offer · ${(property.offer.requiredDiscount*100).toFixed(1)}% below list required` : property.priceCutPercent ? `${property.priceCutPercent}% below original list · within offer ceiling` : "Within $275,000 offer ceiling";
  return `<article class="property-card" data-id="${escapeHtml(property.id)}">
    <div class="card-identity"><div class="badges">
      <span class="badge ${property.changeCategory === "new" ? "new" : ""}">${escapeHtml(property.changeCategory === "new" ? "New today" : property.changeCategory)}</span>
      <span class="badge">${escapeHtml(strategyLabel(property.strategy))}</span>
      <span class="badge ${badgeClass(property.recommendation)}">${escapeHtml(property.recommendation)}</span>
    </div><h3>${escapeHtml(property.address)}</h3><p class="property-type">${escapeHtml(property.propertyType || property.distanceLabel)} · ${escapeHtml(priceNote)}</p></div>
    <div class="score"><strong>${score}</strong><small>${benchmark ? "reference" : "score"}</small></div>
    <div class="card-facts">
      <div class="fact"><strong>${price}</strong><small>${benchmark ? "Monthly rent" : "List price"}</small></div>
      <div class="fact"><strong>${benchmark ? "N/A" : money(property.offer.modeledPurchasePrice)}</strong><small>Modeled offer</small></div>
      <div class="fact"><strong>${benchmark ? "N/A" : property.offer.aboveCeiling ? `${(property.offer.requiredDiscount*100).toFixed(1)}%` : "0%"}</strong><small>Needed discount</small></div>
      <div class="fact"><strong>${property.beds ?? "—"} / ${property.baths ?? "—"}</strong><small>Beds / baths</small></div>
      <div class="fact"><strong>${property.daysOnMarket ?? "—"}</strong><small>Days listed</small></div>
      <div class="fact"><strong>${benchmark ? money(property.price) : money(ten?.monthlySubsidy)}</strong><small>${benchmark ? "Monthly" : "Subsidy / mo"}</small></div>
      <div class="fact"><strong>${benchmark ? "N/A" : percent(ten?.irr)}</strong><small>10-year IRR</small></div>
    </div>
    <p class="card-summary">${escapeHtml(property.summary)}</p>
    <div class="gate ${property.recommendation === "Qualified" || benchmark ? "ok" : ""}"><strong>${escapeHtml(property.recommendation)}:</strong> ${escapeHtml(statusGate(property))}</div>
    <div class="card-actions"><button class="detail-button" type="button" data-detail="${escapeHtml(property.id)}">Review details</button><a class="source-link" href="${escapeHtml(property.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open primary source ↗</a></div>
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
  $("#decision-note").textContent = qualified.length ? `${qualified.length} option${qualified.length === 1 ? " clears" : "s clear"} the current hard gates.` : "No purchase candidate clears every hard gate yet. Verification can change that.";
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
    return `<tr><td>${escapeHtml(property.address)}</td><td>${money(result.modeledPurchasePrice)}${property.offer.aboveCeiling ? "*" : ""}</td><td>${money(result.initialCash)}</td><td>${money(result.monthlySubsidy)}</td><td class="${(result.irr ?? -1) >= .07 ? "positive" : "negative"}">${percent(result.irr)}</td><td>${money(result.netSaleProceeds)}</td><td class="${gapClass}">${result.wealthGapVsHurdle >= 0 ? "+" : ""}${money(result.wealthGapVsHurdle)}</td></tr>`;
  }).join("");
}

function scoreBars(property) {
  const labels = {livingSuitability:"Living suitability",monthlySupportability:"Monthly supportability",investmentReturn:"Investment return",pricingNegotiation:"Pricing and negotiation",riskOptionality:"Risk and optionality"};
  return Object.entries(property.score?.components || {}).map(([key,value]) => `<div class="score-bar"><span>${labels[key]}</span><div class="bar-track"><div class="bar-fill" style="width:${value}%"></div></div><strong>${value}</strong></div>`).join("");
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
  <div class="detail-grid">
    <section class="detail-panel"><h3>Decision score</h3>${property.score ? `<div class="score-bars">${scoreBars(property)}</div>` : "<p>Reference option, not scored.</p>"}</section>
    <section class="detail-panel"><h3>Financial model</h3>${financialSection}</section>
    <section class="detail-panel"><h3>Why it could work</h3><ul>${property.pros.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
    <section class="detail-panel"><h3>Concerns and gates</h3><ul>${property.concerns.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>${property.sourceConflicts.length ? `<p><strong>Source conflict:</strong> ${escapeHtml(property.sourceConflicts.join(" "))}</p>` : ""}</section>
    <section class="detail-panel"><h3>HOA / rental authority</h3><p><strong>Individual-room rental:</strong> ${escapeHtml(property.hoa.roomRental)}</p><p><strong>Evidence confidence:</strong> ${escapeHtml(property.hoa.confidence)}</p><p>${escapeHtml(property.hoa.followUp)}</p></section>
    <section class="detail-panel"><h3>Listing history</h3><div class="history">${history}</div></section>
    <section class="detail-panel"><h3>Sources</h3><div class="source-list">${sources}</div></section>
    <section class="detail-panel"><h3>Location</h3><p>${escapeHtml(property.distanceLabel)}</p><p>Exact family anchor is intentionally excluded from this public site.</p></section>
  </div>`;
  $("#detail-dialog").showModal();
}

function renderMethod() {
  const a = state.data.assumptions;
  const weights = [["Living suitability","Private room/bath, layout, capacity",30],["Monthly supportability","Mortgage, operating cost, rent offset",20],["Investment return","Modeled IRR and 7% hurdle",20],["Pricing and negotiation","Price per square foot, cuts, market time",15],["Risk and optionality","Evidence gaps, conflicts, exit flexibility",15]];
  const coverage = [
    ...state.data.sourcePolicy.listingDiscovery.map(item => ({...item, section:"Listing discovery"})),
    ...state.data.sourcePolicy.propertyVerification.map(item => ({...item, section:"Property verification"})),
    ...state.data.sourcePolicy.rentEvidence.map(item => ({...item, section:"Rent evidence"}))
  ];
  $("#method-content").innerHTML = `<div class="method-list">${weights.map(row => `<div class="method-row"><strong>${row[0]}</strong><span>${row[1]}</span><strong>${row[2]}%</strong></div>`).join("")}</div>
    <div class="method-warning"><strong>Hard gates override the score.</strong> A private full bathroom must be confirmed. Shared condos also require documented individual-room rental authority. Shared houses require zoning and occupancy confirmation.</div>
    <h3>Public planning assumptions</h3><div class="assumption-grid">
      <div class="assumption"><strong>${(a.purchase.downPaymentRate*100).toFixed(0)}% down</strong><small>Plus ${(a.purchase.buyerClosingCostRate*100).toFixed(0)}% buyer closing costs</small></div>
      <div class="assumption"><strong>${money(a.purchase.maximumOfferPrice)}</strong><small>Absolute maximum offer and modeled acquisition price</small></div>
      <div class="assumption"><strong>${percent(a.purchase.mortgageRate)}</strong><small>30-year planning mortgage rate</small></div>
      <div class="assumption"><strong>${money(a.operations.roomRentMonthly)}/room</strong><small>${(a.operations.vacancyRate*100).toFixed(0)}% vacancy; ${money(a.operations.roomRentLow)}–${money(a.operations.roomRentHigh)} sensitivity</small></div>
      <div class="assumption"><strong>${percent(a.operations.appreciationRate)}</strong><small>Annual property appreciation assumption</small></div>
      <div class="assumption"><strong>${percent(a.comparison.forwardHurdleRate)}</strong><small>Forward alternative-investment hurdle</small></div>
      <div class="assumption"><strong>${percent(a.comparison.sp500Trailing10YearAnnualized)}</strong><small>Trailing 10-year S&amp;P benchmark as of ${escapeHtml(a.comparison.sp500AsOf)}; historical context only</small></div>
    </div><p class="fine-print">${escapeHtml(a.tax.note)}</p>
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
