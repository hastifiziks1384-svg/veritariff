# Decision log

Decisions confirmed with the product owner, in force for V1.

## D1 — SQLite in dev, Postgres-ready schema (2026-07-01)

No local Postgres/Docker on the dev machine. Prisma + SQLite for dev; the
schema avoids engine-specific column types (enums → validated String unions
in `@veritariff/shared`; JSON → serialized String columns via
`toJson`/`fromJson`). Production switchover = datasource change + URL.

## D2 — The deterministic ↔ LLM boundary (spec §7)

- LLM allowed **only** in `packages/extraction` (document reading → strict
  schema with per-field confidence and "missing") and for phrasing
  plain-English explanations of already-made determinations.
- LLM forbidden in `packages/engine` (mismatch, classification, RoO, duty).
  Enforced mechanically: `scripts/check-engine-boundary.mjs` fails CI on any
  LLM-SDK, extraction-package, or network import inside the engine.
- `ANTHROPIC_API_KEY` is optional; `FixtureExtractionService` runs demo and
  tests without it.

## D3 — Flag recommendations with accept/reject (owner request, 2026-07-01)

Every mismatch flag **except `hs_code`** may carry a recommended value with
an accept/reject control. To honour "flag, don't guess":

- A recommendation exists only with a deterministic, defensible basis:
  1. majority value across ≥3 documents, or
  2. per-field document-authority order (`FIELD_AUTHORITY_ORDER` in
     `packages/engine/src/mismatch/tolerances.ts`) — e.g. packing list is
     authoritative for weights, invoice for value/currency/incoterm.
- The basis is always displayed with the recommendation.
- If the source field is itself low-confidence, or no basis applies: the flag
  ships with **no** recommendation.
- `hs_code` disagreements never get a recommendation — they route through the
  classification engine (§5.4).
- Accept/reject is recorded on the Flag (`recommendationStatus`) and in
  `AuditEvent` (who, when, what). Nothing is auto-applied: every
  determination is presented for human review.

## D4 — Fixture documents are plain text in Phase 0

The §10 fixture ships as realistic `.txt` renderings plus a ground-truth
`expected-extraction.json`. PDF versions are generated in Phase 2 when the
live extraction path needs them.

## D5 — Language rules (spec §1.5)

The product is described as "deterministic, codified legal logic". The term
"AI-powered" is never used. References to the LLM appear only in internal
notes about the extraction layer (like this file).

## D6 — Directory-name colon workaround

The repo path contains `:` which breaks POSIX PATH splitting in npm
run-scripts. All package scripts call tools via explicit `node <path-to-cli>`
so they work on both this path and clean paths (CI). Recommendation stands to
rename the folder eventually.
