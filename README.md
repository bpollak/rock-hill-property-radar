# Rock Hill Property Radar

A public, source-backed family decision dashboard for evaluating actual Rock Hill area housing options. It combines daily listing research with hard suitability gates, day-over-day changes, and deterministic 10- and 15-year financial comparisons.

## What it does

- Shows all currently marketed properties on one page, separating listings first seen in the latest research day from listings found on previous days.
- Groups shared houses, shared condos, and private purchases as candidate strategies.
- Keeps rental-market benchmarks in the underlying financial assumptions and evidence, but excludes them from the property-candidate list and candidate counts.
- Blocks recommendations when the private bathroom or rental authority is unresolved.
- Explains every qualified candidate with six explicit eligibility gates: active listing, private living arrangement, distance, offer ceiling, room-rental dependency, and layout. Qualification is kept separate from subsidy and return performance.
- Shows monthly subsidy, IRR, estimated after-tax sale proceeds, and the wealth gap against a 7% alternative.
- Enforces a $275,000 maximum offer in research, scoring, and every purchase calculation. Listings above it are shown only as negotiation candidates and modeled at the ceiling.
- Excludes purchase properties built before 1980 in both daily research and the published application.
- Keeps the exact family anchor out of the site and repository.
- Lists fastest-route mileage and approximate drive time from the private family reference property for every purchase candidate, without publishing the reference address, coordinates, or route URL.
- Publishes only after schema, privacy, calculation, and source checks pass.
- Audits the source categories in `config/source-policy.json`, including public portals and a user-authorized OneHome / Canopy MLS saved-search snapshot. The OneHome access token is never stored; only sanitized listing facts enter the repository through a tested import contract.

## Local development

```bash
npm install
npm run check
npx serve dist
```

The generated site is in `dist/`.

## OneHome saved-search source

OneHome is a durable, supported manual source. During a user-authorized interactive browser session, collect listing facts into a temporary JSON snapshot using the `onehome-snapshot-v1` contract described by `config/onehome-source.json`. Include the token-free `/en-US/property/aotf~<id>~CANOPY` path when it is available. Never put the OneHome token, token-bearing URL, family anchor, coordinates, route URL, or private contact information in that file.

Import a sanitized snapshot with:

```bash
npm run import:onehome -- /absolute/path/to/sanitized-onehome-snapshot.json
npm run check
```

The importer deduplicates by MLS number first and normalized address second, retains a prior pending or contingent status when a newer source only says active, withholds records missing required construction-year or route evidence, and writes the current dataset plus the dated history snapshot. The dashboard keeps the token-free property path in public data. A user can paste a current OneHome URL into the dashboard's connection dialog; all of its query parameters are then added to property links in page memory only and shared through `BroadcastChannel` with other open Property Radar tabs on the same origin. A private URL fragment in the form `#onehome=<encoded full OneHome URL>` can initialize the same connection and is immediately removed from the address bar after loading. Closing all connected Property Radar tabs clears the connection. The repository and browser storage never persist the bearer token.

## Research automation

The live project is refreshed by a daily Codex research automation at 7:17 AM Eastern. It researches with web access, validates the dataset, commits only material successful changes, waits for the Pages deployment, and verifies production. Its exact distance anchor is held in an ignored local environment file and is never committed or published.

The repository also includes an on-demand GitHub Actions research workflow for future server-side use. It requires two encrypted repository secrets:

- `OPENAI_API_KEY`: server-side key used by the research workflow.
- `FAMILY_ANCHOR_ADDRESS`: private distance anchor, never written to research output.

Run locally with the same environment variables:

```bash
npm run research
```

The on-demand workflow uses OpenAI Responses API web search, validates the result, writes a dated snapshot, commits only successful data, and deploys the validated build. A failed run leaves the current site and prior successful snapshot intact. Previously found listings remain available until a public source confirms they are sold, withdrawn, expired, or otherwise off market.

## Decision model

The numeric score weights living suitability 25%, monthly supportability 20%, investment return 20%, pricing and negotiation 10%, room-rental viability 15%, and risk and optionality 10%. For shared-house and shared-condo strategies, room-rental viability combines legal/HOA authority, bedroom and bathroom capacity, demand fit, parking and operating readiness, and condition. Market rent is estimated separately for each property from current private-bedroom asking rents, weighted by regional zone, ZIP code, bathroom access, furnishing, utilities, property type, lease length, listing freshness, and source status. Property size, age/condition, parking, entrance, and layout evidence then make bounded adjustments. Vacancy is applied to scheduled rent, followed by a separate legal/HOA authorization haircut. Property age affects both monthly supportability and investment return through age-adjusted maintenance and capital reserves, and it deducts points inside risk and optionality. These are planning proxies until governing documents, local approvals, permits, system ages, inspections, invoices, signed leases, and contractor bids provide property-specific evidence. Hard gates override the score.

The public planning assumptions are versioned in `config/public-assumptions.json`. Results are estimates, not tax, legal, lending, inspection, or investment advice.

## Evidence policy

No placeholder properties are permitted. Every published option requires at least one supporting URL. Unknown HOA and room-rental facts remain unknown until supported by governing documents or written confirmation.
