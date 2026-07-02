import type { CanonicalField, DocumentType, FieldStatus, Severity } from "@veritariff/shared";

/**
 * Record-completeness rules (§5.2): a missing or low-confidence compliance
 * field is surfaced as a finding — never silently defaulted. Pure function;
 * the extraction pipeline persists findings as Flags.
 */
export interface FieldObservation {
  documentId: string;
  documentType: DocumentType | "unknown";
  name: string;
  value: string | null;
  unit?: string;
  confidence: number;
  status: FieldStatus;
}

export interface CompletenessFinding {
  kind: "missing_required_field" | "low_confidence_field";
  field: string;
  severity: Severity;
  explanation: string;
  sourceDocumentIds: string[];
}

/** Fields the shipment record needs from at least one document. */
export const SHIPMENT_REQUIRED_FIELDS: readonly CanonicalField[] = [
  "reference",
  "shipper",
  "consignee",
  "product_description",
  "invoice_value",
  "currency",
  "quantity",
  "gross_weight_kg",
  "hs_code",
  "stated_origin",
  "incoterm",
] as const;

/** Below this, a value is surfaced for review rather than trusted. */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

export function evaluateCompleteness(
  observations: FieldObservation[],
  options: { lowConfidenceThreshold?: number } = {},
): CompletenessFinding[] {
  const threshold = options.lowConfidenceThreshold ?? LOW_CONFIDENCE_THRESHOLD;
  const findings: CompletenessFinding[] = [];

  const required: string[] = [...SHIPMENT_REQUIRED_FIELDS];
  // Country of melt & pour is a metals-specific requirement: only demanded
  // when the shipment actually carries a mill certificate to state it.
  if (observations.some((o) => o.documentType === "mill_certificate")) {
    required.push("melt_and_pour_country");
  }

  for (const field of required) {
    const present = observations.filter((o) => o.name === field && o.value !== null);

    if (present.length === 0) {
      findings.push({
        kind: "missing_required_field",
        field,
        severity: "warn",
        explanation: `No document in this shipment states ${field.replaceAll("_", " ")}. The record cannot be completed without it — provide a document that states it, or record it manually with a note.`,
        sourceDocumentIds: [],
      });
      continue;
    }

    const bestConfidence = Math.max(...present.map((o) => o.confidence));
    if (bestConfidence < threshold) {
      findings.push({
        kind: "low_confidence_field",
        field,
        severity: "warn",
        explanation: `${field.replaceAll("_", " ")} was read from the documents with low confidence (${Math.round(bestConfidence * 100)}%). Review the source document and confirm the value.`,
        sourceDocumentIds: present.map((o) => o.documentId),
      });
    }
  }

  return findings;
}
