import type { CanonicalField, ConflictingValue, Severity } from "@veritariff/shared";
import type { FieldObservation } from "./completeness";
import { LOW_CONFIDENCE_THRESHOLD } from "./completeness";
import {
  normalizeCountry,
  normalizeDefault,
  normalizeHsCode,
  normalizeParty,
  parseNumeric,
} from "./normalize";
import {
  DEFAULT_TOLERANCES,
  FIELD_AUTHORITY_ORDER,
  FUZZY_MATCH_FIELDS,
  ZERO_TOLERANCE_FIELDS,
  type ToleranceConfig,
} from "./tolerances";

/**
 * The mismatch engine (§5.3): compares each field across the shipment's
 * documents and produces ranked findings. Pure and deterministic — decisions
 * come from the tolerance model and document-authority table, never from an
 * LLM. Where a defensible basis exists, a finding carries a recommended
 * value for the reviewer to accept or reject; hs_code never gets one (it
 * routes to classification verification, §5.4).
 */

export interface MismatchRecommendation {
  value: string;
  unit?: string;
  /** Always shown to the user — why this value is recommended. */
  basis: string;
}

export interface MismatchFinding {
  kind: "cross_document_mismatch" | "cannot_compare";
  field: string;
  severity: Severity;
  explanation: string;
  conflictingValues: ConflictingValue[];
  recommendation?: MismatchRecommendation;
}

export interface CompareConfig {
  tolerances?: Partial<ToleranceConfig>;
  /** Relative difference beyond which a tolerated-variance field escalates to block. */
  blockThresholdPct?: number;
}

const NUMERIC_FIELD_TOLERANCE: Partial<Record<CanonicalField, keyof ToleranceConfig>> = {
  gross_weight_kg: "weightPct",
  net_weight_kg: "weightPct",
  quantity: "quantityPct",
  invoice_value: "valuePct",
};

/** Weight/quantity are normally cross-checked between these document types. */
const CROSS_CHECK_PAIRS: Partial<Record<CanonicalField, [string, string]>> = {
  gross_weight_kg: ["commercial_invoice", "packing_list"],
  net_weight_kg: ["commercial_invoice", "packing_list"],
  quantity: ["commercial_invoice", "packing_list"],
};

/** Fields that are per-document by nature and never cross-compared
 * (wording naturally varies between documents). */
const NOT_COMPARED: readonly string[] = [
  "composition",
  "non_originating_materials",
  "product_description",
];

const DOC_LABELS: Record<string, string> = {
  commercial_invoice: "commercial invoice",
  packing_list: "packing list",
  bill_of_lading: "bill of lading",
  cmr: "CMR",
  mill_certificate: "mill certificate",
  suppliers_declaration: "supplier's declaration",
  other: "untyped document",
};

const label = (field: string) =>
  field.replace(/_kg$/, " (kg)").replaceAll("_", " ");
const docLabel = (type: string | undefined) => DOC_LABELS[type ?? "other"] ?? type ?? "document";

function normalizeFor(field: string, value: string): string {
  if (field === "hs_code") return normalizeHsCode(value);
  if (field === "stated_origin") return normalizeCountry(value);
  if (field === "currency") return normalizeDefault(value);
  if ((FUZZY_MATCH_FIELDS as readonly string[]).includes(field)) return normalizeParty(value);
  return normalizeDefault(value);
}

function toConflictingValue(o: FieldObservation): ConflictingValue {
  return {
    value: o.value ?? "",
    unit: o.unit,
    sourceDocumentId: o.documentId,
    documentType: o.documentType === "unknown" ? undefined : o.documentType,
  };
}

/**
 * Deterministic recommendation: majority across sources, else the
 * document-authority order. No defensible basis, or a low-confidence
 * source → no recommendation (flag, don't guess).
 */
function recommend(
  field: string,
  groups: Map<string, FieldObservation[]>,
): MismatchRecommendation | undefined {
  if (field === "hs_code") return undefined;

  const pick = (o: FieldObservation, basis: string): MismatchRecommendation | undefined =>
    o.confidence >= LOW_CONFIDENCE_THRESHOLD && o.status === "extracted"
      ? { value: o.value ?? "", unit: o.unit, basis }
      : undefined;

  // Majority: one value stated by strictly more documents than any other.
  const ranked = [...groups.values()].sort((a, b) => b.length - a.length);
  const total = ranked.reduce((n, g) => n + g.length, 0);
  if (ranked.length > 1 && ranked[0]!.length > (ranked[1]?.length ?? 0)) {
    const best = ranked[0]![0]!;
    return pick(
      best,
      `Stated by ${ranked[0]!.length} of the ${total} documents that state ${label(field)}.`,
    );
  }

  // Authority: the most authoritative document type present for this field.
  const order = FIELD_AUTHORITY_ORDER[field as CanonicalField];
  if (!order) return undefined;
  for (const docType of order) {
    for (const group of groups.values()) {
      const match = group.find((o) => o.documentType === docType);
      if (match) {
        return pick(
          match,
          `The ${docLabel(docType)} is the authoritative source for ${label(field)}.`,
        );
      }
    }
  }
  return undefined;
}

export function compareShipmentFields(
  observations: FieldObservation[],
  shipmentDocumentTypes: string[],
  config: CompareConfig = {},
): MismatchFinding[] {
  const tolerances = { ...DEFAULT_TOLERANCES, ...config.tolerances };
  const blockThreshold = config.blockThresholdPct ?? 0.1;
  const findings: MismatchFinding[] = [];

  const byField = new Map<string, FieldObservation[]>();
  for (const o of observations) {
    if (o.value === null || o.status === "missing" || NOT_COMPARED.includes(o.name)) continue;
    byField.set(o.name, [...(byField.get(o.name) ?? []), o]);
  }

  for (const [field, obs] of byField) {
    // "If it can't compare, it says so": the usual cross-check partner
    // document is missing from the shipment entirely.
    const pair = CROSS_CHECK_PAIRS[field as CanonicalField];
    if (pair && obs.length === 1) {
      const [a, b] = pair;
      const missingPartner = !shipmentDocumentTypes.includes(a)
        ? a
        : !shipmentDocumentTypes.includes(b)
          ? b
          : null;
      if (missingPartner) {
        findings.push({
          kind: "cannot_compare",
          field,
          severity: "info",
          explanation: `Cannot cross-check ${label(field)}: the shipment has no ${docLabel(missingPartner)} to compare against. Only the ${docLabel(obs[0]!.documentType)} states it.`,
          conflictingValues: obs.map(toConflictingValue),
        });
      }
      continue;
    }
    if (obs.length < 2) continue;

    // Group observations by normalised value.
    const groups = new Map<string, FieldObservation[]>();
    for (const o of obs) {
      const key = normalizeFor(field, o.value!);
      groups.set(key, [...(groups.get(key) ?? []), o]);
    }
    if (groups.size === 1) continue;

    // HS codes at different granularity are not a disagreement: "7318.15"
    // on one document and "7318159098" on another share a prefix.
    if (field === "hs_code") {
      const keys = [...groups.keys()].sort((a, b) => a.length - b.length);
      const allPrefixed = keys.every((k) => k.startsWith(keys[0]!) || keys[0]!.startsWith(k));
      if (allPrefixed && keys.every((k, i) => i === 0 || k.startsWith(keys[0]!))) continue;
    }

    const conflictingValues = obs.map(toConflictingValue);
    const statedAs = obs
      .map((o) => `the ${docLabel(o.documentType)} states ${o.value}${o.unit ? ` ${o.unit}` : ""}`)
      .join(", ");

    // Variance-tolerated numeric fields.
    const toleranceKey = NUMERIC_FIELD_TOLERANCE[field as CanonicalField];
    if (toleranceKey) {
      const numbers = obs.map((o) => parseNumeric(o.value!));
      if (numbers.every((n): n is number => n !== null)) {
        const max = Math.max(...numbers);
        const min = Math.min(...numbers);
        const relDiff = max === 0 ? 0 : (max - min) / max;
        const tolerance = tolerances[toleranceKey];
        if (relDiff <= tolerance) continue;

        findings.push({
          kind: "cross_document_mismatch",
          field,
          severity: relDiff > blockThreshold ? "block" : "warn",
          explanation: `The documents disagree on ${label(field)}: ${statedAs}. The difference is ${(relDiff * 100).toFixed(1)}%, beyond the ±${(tolerance * 100).toFixed(1)}% tolerance.`,
          conflictingValues,
          recommendation: recommend(field, groups),
        });
        continue;
      }
      // Not all values parse as numbers — fall through to exact comparison.
    }

    // Zero-tolerance and fuzzy/other fields: any surviving difference flags.
    const zeroTolerance = (ZERO_TOLERANCE_FIELDS as readonly string[]).includes(field);
    const fuzzy = (FUZZY_MATCH_FIELDS as readonly string[]).includes(field);
    findings.push({
      kind: "cross_document_mismatch",
      field,
      severity: zeroTolerance ? "block" : "warn",
      explanation: fuzzy
        ? `The documents name different parties for ${label(field)}: ${statedAs}. Name variants such as “Ltd”/“Limited” are treated as the same entity — these do not match.`
        : `The documents disagree on ${label(field)}: ${statedAs}. ${zeroTolerance ? `Any difference in ${label(field)} must be resolved before entry.` : "These should state the same value."}${field === "hs_code" ? " The declared code is also checked against the product description by classification verification." : ""}`,
      conflictingValues,
      recommendation: recommend(field, groups),
    });
  }

  const severityRank: Record<Severity, number> = { block: 0, warn: 1, info: 2 };
  return findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}
