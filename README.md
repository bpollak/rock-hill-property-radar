# Rock Hill Property Radar

A public, source-backed family decision dashboard for evaluating actual Rock Hill area housing options. It combines daily listing research with hard suitability gates, day-over-day changes, and deterministic 10- and 15-year financial comparisons.

## What it does

- Separates new, changed, previously reviewed, and inactive properties.
- Groups shared houses, shared condos, private purchases, and rental benchmarks.
- Blocks recommendations when the private bathroom or rental authority is unresolved.
- Shows monthly subsidy, IRR, estimated after-tax sale proceeds, and the wealth gap against a 7% alternative.
- Keeps the exact family anchor out of the site and repository.
- Publishes only after schema, privacy, calculation, and source checks pass.

## Local development

```bash
npm install
npm run check
npx serve dist
```

The generated site is in `dist/`.

## Daily research

The scheduled workflow runs at 7:17 AM Eastern. It requires two encrypted repository secrets:

- `OPENAI_API_KEY`: server-side key used by the research workflow.
- `FAMILY_ANCHOR_ADDRESS`: private distance anchor, never written to research output.

Run locally with the same environment variables:

```bash
npm run research
```

The workflow uses OpenAI Responses API web search, validates the result, writes a dated snapshot, commits only successful data, and deploys the validated build. A failed run leaves the current site and prior successful snapshot intact. Listings are archived only after two consecutive misses.

## Decision model

The numeric score weights living suitability 30%, monthly supportability 20%, investment return 20%, pricing and negotiation 15%, and risk and optionality 15%. Hard gates override the score.

The public planning assumptions are versioned in `config/public-assumptions.json`. Results are estimates, not tax, legal, lending, inspection, or investment advice.

## Evidence policy

No placeholder properties are permitted. Every published option requires at least one supporting URL. Unknown HOA and room-rental facts remain unknown until supported by governing documents or written confirmation.
