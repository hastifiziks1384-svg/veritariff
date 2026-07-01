# Veritariff

Per-shipment customs compliance records for UK–EU steel/metals importers and
brokers: document cross-checking, HS classification verification, and
rules-of-origin context — built on **deterministic, codified legal logic**,
with **every output cited to its legal source** and a first-class audit trail.

V1 assists preparation only. It never files anything to HMRC/CDS, and it never
asserts that goods qualify for preferential origin.

## Architecture in one paragraph

All legal determinations (mismatch decisions, classification reasoning,
origin-rule selection) are pure TypeScript functions in `packages/engine`,
computed over reference data — no LLM calls, no network, enforced in CI by
`scripts/check-engine-boundary.mjs`. A hosted LLM is used in exactly one
place, `packages/extraction`, to read documents into structured fields with
per-field confidence (it is allowed — required — to answer "missing" rather
than guess). Anything not pulled live from an official source is labelled
*illustrative* in both data and UI.

## Layout

- `apps/web` — Next.js UI + API route handlers
- `packages/engine` — deterministic engine: `mismatch/`, `classification/`, `roo/`
- `packages/extraction` — ExtractionService interface + implementations
- `packages/ingestion` — upload/email channels, shipment grouping
- `packages/db` — Prisma schema, client, seed
- `packages/shared` — domain types, citation model
- `data/roo-rules` — curated TCA Ch 72–73 rules (illustrative until advisor-validated)
- `data/fixtures/steel-7318` — the end-to-end acceptance fixture
- `docs/inbound` — drop real sample documents / advisor material here

## Setup

```sh
npm install
cp .env.example .env
npm run db:generate
npm run db:push
npm run db:seed     # loads the steel fixture shipment
npm run dev         # http://localhost:3000
```

`ANTHROPIC_API_KEY` in `.env` is optional: without it the fixture extractor
runs the demo end-to-end; with it, real uploaded documents can be parsed.

## Checks

```sh
npm run verify      # boundary check + typecheck + tests
npm test
npm run check:boundary
```

Note: package scripts invoke tools via explicit `node <path>` rather than
PATH lookup because this repository's directory name contains a colon, which
breaks POSIX `PATH` splitting. The scripts work identically on clean paths
(CI). Renaming the folder to remove the `:` would allow conventional scripts.

Dev database is SQLite (no local Postgres needed); the schema is written
Postgres-ready — see `packages/db/prisma/schema.prisma` and
`docs/DECISIONS.md`.
