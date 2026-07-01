import { describe, expect, it } from "vitest";
import {
  evaluateCompleteness,
  type FieldObservation,
} from "./completeness";

function obs(partial: Partial<FieldObservation> & { name: string }): FieldObservation {
  return {
    documentId: "doc-1",
    documentType: "commercial_invoice",
    value: "x",
    confidence: 0.95,
    status: "extracted",
    ...partial,
  };
}

const completeSet: FieldObservation[] = [
  obs({ name: "reference", value: "REF-1" }),
  obs({ name: "shipper", value: "A GmbH" }),
  obs({ name: "consignee", value: "B Ltd" }),
  obs({ name: "invoice_value", value: "1000" }),
  obs({ name: "currency", value: "EUR" }),
  obs({ name: "quantity", value: "100" }),
  obs({ name: "gross_weight_kg", value: "50" }),
  obs({ name: "hs_code", value: "7318.15" }),
  obs({ name: "stated_origin", value: "DE" }),
  obs({ name: "incoterm", value: "DAP" }),
];

describe("evaluateCompleteness (§5.2: flag, never invent)", () => {
  it("produces no findings for a complete, confident record", () => {
    expect(evaluateCompleteness(completeSet)).toEqual([]);
  });

  it("flags a deliberately missing field instead of inventing it", () => {
    const withoutIncoterm = completeSet.filter((o) => o.name !== "incoterm");
    const findings = evaluateCompleteness(withoutIncoterm);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "missing_required_field",
      field: "incoterm",
      severity: "warn",
    });
  });

  it("treats a null-valued observation as missing, not as a value", () => {
    const set = [
      ...completeSet.filter((o) => o.name !== "stated_origin"),
      obs({ name: "stated_origin", value: null, confidence: 0, status: "missing" }),
    ];
    const findings = evaluateCompleteness(set);
    expect(findings.map((f) => f.field)).toContain("stated_origin");
  });

  it("flags low-confidence values for review with their source documents", () => {
    const set = [
      ...completeSet.filter((o) => o.name !== "invoice_value"),
      obs({ name: "invoice_value", value: "1O00", confidence: 0.4, documentId: "doc-9" }),
    ];
    const findings = evaluateCompleteness(set);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "low_confidence_field",
      field: "invoice_value",
      sourceDocumentIds: ["doc-9"],
    });
  });

  it("requires country of melt & pour only when a mill certificate is present", () => {
    expect(evaluateCompleteness(completeSet).map((f) => f.field)).not.toContain(
      "melt_and_pour_country",
    );

    const withMillCert = [
      ...completeSet,
      obs({ name: "composition", documentType: "mill_certificate", documentId: "doc-mc" }),
    ];
    expect(evaluateCompleteness(withMillCert).map((f) => f.field)).toContain(
      "melt_and_pour_country",
    );
  });
});
