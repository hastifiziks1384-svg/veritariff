/**
 * Shared domain types for Veritariff.
 *
 * Enum-like values are string unions (not Prisma enums) so the schema stays
 * portable between SQLite (dev) and PostgreSQL (prod). Database columns store
 * these as strings; JSON-shaped columns store serialized JSON strings and are
 * parsed through the helpers at the bottom of this file.
 */

export const DOCUMENT_TYPES = [
  "commercial_invoice",
  "packing_list",
  "bill_of_lading",
  "cmr",
  "mill_certificate",
  "suppliers_declaration",
  "other",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export type DocumentSource = "upload" | "email" | "connector";

export type FieldStatus = "extracted" | "low_confidence" | "missing";

export type Severity = "info" | "warn" | "block";

export type FlagResolution = "open" | "resolved" | "ignored" | "escalated";

/**
 * Lifecycle of a deterministic recommendation attached to a Flag.
 * A recommendation only exists when the engine has a defensible basis
 * (document-authority order or majority across sources) — otherwise the
 * flag ships without one. HS-code flags never carry a recommendation;
 * they route through the classification engine.
 */
export type RecommendationStatus = "none" | "proposed" | "accepted" | "rejected";

/** Canonical compliance fields extracted from documents (§5.2). */
export const CANONICAL_FIELDS = [
  "reference",
  "shipper",
  "consignee",
  "product_description",
  "invoice_value",
  "currency",
  "quantity",
  "gross_weight_kg",
  "net_weight_kg",
  "hs_code",
  "stated_origin",
  "incoterm",
  "composition",
  "melt_and_pour_country",
  "non_originating_materials",
] as const;
export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

/**
 * Every user-visible determination must carry at least one Citation.
 * No citation → it does not ship.
 */
export interface Citation {
  sourceType:
    | "tariff_commodity"
    | "section_note"
    | "chapter_note"
    | "gir"
    | "fta_article"
    | "ruling";
  /** e.g. "7318.15", "Section XV Note 2(a)", "GIR 1", "TCA Annex 3, heading 73.18" */
  reference: string;
  url?: string;
  quote?: string;
}

/** One side of a cross-document disagreement, always tied to its source. */
export interface ConflictingValue {
  value: string;
  unit?: string;
  sourceDocumentId: string;
  documentType?: DocumentType;
}

export type ClassificationStatus =
  | "verified"
  | "suggested"
  | "disagrees_with_declared"
  | "needs_input";

export type RuleType = "CTH" | "MaxNOM" | "wholly_obtained" | "combination";

/** Serialize a value for a JSON-shaped string column. */
export function toJson(value: unknown): string {
  return JSON.stringify(value);
}

/** Parse a JSON-shaped string column; throws on malformed content. */
export function fromJson<T>(serialized: string): T {
  return JSON.parse(serialized) as T;
}
