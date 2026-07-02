import { describe, expect, it } from "vitest";
import { compareShipmentFields } from "./compare";
import type { FieldObservation } from "./completeness";

const INVOICE = "doc-inv";
const PACKING = "doc-pl";
const DECLARATION = "doc-sd";

function obs(
  documentType: FieldObservation["documentType"],
  name: string,
  value: string,
  extra: Partial<FieldObservation> = {},
): FieldObservation {
  return {
    documentId:
      documentType === "commercial_invoice"
        ? INVOICE
        : documentType === "packing_list"
          ? PACKING
          : DECLARATION,
    documentType,
    name,
    value,
    confidence: 0.95,
    status: "extracted",
    ...extra,
  };
}

const ALL_TYPES = ["commercial_invoice", "packing_list", "suppliers_declaration"];

describe("compareShipmentFields (§5.3)", () => {
  it("flags the fixture weight mismatch with both sources and severity", () => {
    const findings = compareShipmentFields(
      [
        obs("commercial_invoice", "gross_weight_kg", "120", { unit: "kg" }),
        obs("packing_list", "gross_weight_kg", "95", { unit: "kg" }),
      ],
      ALL_TYPES,
    );
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.field).toBe("gross_weight_kg");
    expect(["warn", "block"]).toContain(f.severity); // 20.8% diff → block
    expect(f.severity).toBe("block");
    expect(f.conflictingValues).toHaveLength(2);
    expect(f.conflictingValues.map((v) => v.sourceDocumentId).sort()).toEqual([
      INVOICE,
      PACKING,
    ]);
  });

  it("recommends the packing-list weight with its basis shown (accept/reject flow)", () => {
    const [f] = compareShipmentFields(
      [
        obs("commercial_invoice", "gross_weight_kg", "120", { unit: "kg" }),
        obs("packing_list", "gross_weight_kg", "95", { unit: "kg" }),
      ],
      ALL_TYPES,
    );
    expect(f?.recommendation).toMatchObject({ value: "95", unit: "kg" });
    expect(f?.recommendation?.basis).toContain("packing list");
    expect(f?.recommendation?.basis).toContain("authoritative");
  });

  it("does not flag weights within the ±0.5% tolerance", () => {
    const findings = compareShipmentFields(
      [
        obs("commercial_invoice", "gross_weight_kg", "100.0"),
        obs("packing_list", "gross_weight_kg", "100.4"),
      ],
      ALL_TYPES,
    );
    expect(findings).toHaveLength(0);
  });

  it("respects a configurable tolerance", () => {
    const findings = compareShipmentFields(
      [
        obs("commercial_invoice", "quantity", "100"),
        obs("packing_list", "quantity", "103"),
      ],
      ALL_TYPES,
      { tolerances: { quantityPct: 0.05 } },
    );
    expect(findings).toHaveLength(0);
  });

  it("treats currency as zero-tolerance (block) and recommends from the invoice", () => {
    const [f] = compareShipmentFields(
      [
        obs("commercial_invoice", "currency", "EUR"),
        obs("packing_list", "currency", "USD"),
      ],
      ALL_TYPES,
    );
    expect(f?.severity).toBe("block");
    expect(f?.recommendation?.value).toBe("EUR");
    expect(f?.recommendation?.basis).toContain("commercial invoice");
  });

  it("matches party-name legal-form variants without flagging", () => {
    const findings = compareShipmentFields(
      [
        obs("commercial_invoice", "consignee", "Sheffield Fastener Imports Ltd"),
        obs("packing_list", "consignee", "Sheffield Fastener Imports Limited"),
      ],
      ALL_TYPES,
    );
    expect(findings).toHaveLength(0);
  });

  it("flags genuinely different entities", () => {
    const [f] = compareShipmentFields(
      [
        obs("commercial_invoice", "consignee", "Sheffield Fastener Imports Ltd"),
        obs("packing_list", "consignee", "Acme Imports Ltd"),
      ],
      ALL_TYPES,
    );
    expect(f?.field).toBe("consignee");
    expect(f?.severity).toBe("warn");
  });

  it("treats 'Germany' and 'DE' as the same stated origin", () => {
    const findings = compareShipmentFields(
      [
        obs("commercial_invoice", "stated_origin", "Germany"),
        obs("suppliers_declaration", "stated_origin", "DE"),
      ],
      ALL_TYPES,
    );
    expect(findings).toHaveLength(0);
  });

  it("never recommends a value for an hs_code mismatch — that routes to classification", () => {
    const [f] = compareShipmentFields(
      [
        obs("commercial_invoice", "hs_code", "7318.15"),
        obs("suppliers_declaration", "hs_code", "7326.90"),
      ],
      ALL_TYPES,
    );
    expect(f?.severity).toBe("block");
    expect(f?.recommendation).toBeUndefined();
  });

  it("does not flag HS codes that differ only in granularity", () => {
    const findings = compareShipmentFields(
      [
        obs("commercial_invoice", "hs_code", "7318.15"),
        obs("suppliers_declaration", "hs_code", "7318159098"),
      ],
      ALL_TYPES,
    );
    expect(findings).toHaveLength(0);
  });

  it("uses majority across three or more sources, with the count in the basis", () => {
    const [f] = compareShipmentFields(
      [
        obs("commercial_invoice", "incoterm", "DAP Sheffield"),
        obs("packing_list", "incoterm", "DAP Sheffield"),
        obs("suppliers_declaration", "incoterm", "FOB Hamburg"),
      ],
      ALL_TYPES,
    );
    expect(f?.recommendation?.value).toBe("DAP Sheffield");
    expect(f?.recommendation?.basis).toContain("2 of the 3");
  });

  it("withholds the recommendation when the would-be source is low confidence", () => {
    const [f] = compareShipmentFields(
      [
        obs("commercial_invoice", "gross_weight_kg", "120"),
        obs("packing_list", "gross_weight_kg", "95", {
          confidence: 0.4,
          status: "low_confidence",
        }),
      ],
      ALL_TYPES,
    );
    expect(f?.kind).toBe("cross_document_mismatch");
    expect(f?.recommendation).toBeUndefined();
  });

  it("says so when it cannot compare because the packing list is missing", () => {
    const findings = compareShipmentFields(
      [obs("commercial_invoice", "gross_weight_kg", "120")],
      ["commercial_invoice", "suppliers_declaration"],
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "cannot_compare", severity: "info" });
    expect(findings[0]!.explanation).toContain("no packing list");
  });

  it("ranks findings block → warn → info", () => {
    const findings = compareShipmentFields(
      [
        obs("commercial_invoice", "consignee", "Sheffield Fastener Imports Ltd"),
        obs("packing_list", "consignee", "Acme Imports Ltd"),
        obs("commercial_invoice", "currency", "EUR"),
        obs("packing_list", "currency", "USD"),
      ],
      ALL_TYPES,
    );
    expect(findings.map((f) => f.severity)).toEqual(["block", "warn"]);
  });
});
