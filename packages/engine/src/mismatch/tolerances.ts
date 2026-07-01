import type { CanonicalField } from "@veritariff/shared";

/**
 * Per-field tolerance model (§5.3).
 * - zero-tolerance fields flag on any difference;
 * - variance-tolerated fields flag beyond a configurable relative tolerance;
 * - party-name fields use fuzzy matching (legal-form variants are equal).
 */
export interface ToleranceConfig {
  /** Relative tolerance for weights, e.g. 0.005 = ±0.5%. */
  weightPct: number;
  /** Relative tolerance for quantities. */
  quantityPct: number;
  /** Relative tolerance for monetary values (rounding/FX noise). */
  valuePct: number;
}

export const DEFAULT_TOLERANCES: ToleranceConfig = {
  weightPct: 0.005,
  quantityPct: 0.005,
  valuePct: 0.01,
};

/** Any difference at all raises a flag for these fields. */
export const ZERO_TOLERANCE_FIELDS: readonly CanonicalField[] = [
  "hs_code",
  "stated_origin",
  "currency",
] as const;

/** Fields compared with fuzzy matching of legal-entity name variants. */
export const FUZZY_MATCH_FIELDS: readonly CanonicalField[] = [
  "shipper",
  "consignee",
] as const;

/**
 * Document-authority order per field: when documents disagree, the engine may
 * recommend the value from the most authoritative document type for that
 * field — with the basis always shown, and always subject to user
 * accept/reject. hs_code deliberately has NO entry: HS disagreements are
 * never auto-recommended; they route through the classification engine.
 */
export const FIELD_AUTHORITY_ORDER: Partial<Record<CanonicalField, readonly string[]>> = {
  gross_weight_kg: ["packing_list", "bill_of_lading", "cmr", "commercial_invoice"],
  net_weight_kg: ["packing_list", "bill_of_lading", "cmr", "commercial_invoice"],
  quantity: ["packing_list", "commercial_invoice"],
  invoice_value: ["commercial_invoice"],
  currency: ["commercial_invoice"],
  incoterm: ["commercial_invoice"],
  stated_origin: ["suppliers_declaration", "commercial_invoice"],
};
