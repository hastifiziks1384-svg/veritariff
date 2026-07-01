/**
 * Guards the steel acceptance fixture (§10): if anyone edits the fixture in a
 * way that removes the deliberate mismatch or the RoO-relevant facts, later
 * phase tests would silently lose their meaning. This test pins the ground
 * truth.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const fixtureDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../data/fixtures/steel-7318",
);

const shipment = JSON.parse(readFileSync(path.join(fixtureDir, "shipment.json"), "utf8"));
const expected = JSON.parse(
  readFileSync(path.join(fixtureDir, "expected-extraction.json"), "utf8"),
);

describe("steel-7318 fixture integrity", () => {
  it("has all referenced document files on disk", () => {
    for (const doc of shipment.documents) {
      expect(existsSync(path.join(fixtureDir, doc.file)), doc.file).toBe(true);
    }
  });

  it("is an EU→UK corridor shipment", () => {
    expect(shipment.originCountry).toBe("DE");
    expect(shipment.destinationCountry).toBe("GB");
    expect(shipment.lane).toBe("EU->UK");
  });

  it("keeps the deliberate gross-weight mismatch: invoice 120 kg vs packing list 95 kg", () => {
    const invoice = expected.documents["commercial_invoice.txt"].fields;
    const packing = expected.documents["packing_list.txt"].fields;
    expect(invoice.gross_weight_kg.value).toBe("120");
    expect(packing.gross_weight_kg.value).toBe("95");
  });

  it("declares HS 7318.15 on the invoice", () => {
    expect(expected.documents["commercial_invoice.txt"].fields.hs_code.value).toBe("7318.15");
  });

  it("states the wire rod (heading 7213) as non-originating in the supplier's declaration", () => {
    const declarationText = readFileSync(
      path.join(fixtureDir, "documents/suppliers_declaration.txt"),
      "utf8",
    );
    expect(declarationText).toContain("7213");
    expect(declarationText).toContain("NON-ORIGINATING");
    const field =
      expected.documents["suppliers_declaration.txt"].fields.non_originating_materials;
    expect(field.value).toContain("7213");
  });

  it("matches the document text for the mismatch values (ground truth is honest)", () => {
    const invoiceText = readFileSync(
      path.join(fixtureDir, "documents/commercial_invoice.txt"),
      "utf8",
    );
    const packingText = readFileSync(
      path.join(fixtureDir, "documents/packing_list.txt"),
      "utf8",
    );
    expect(invoiceText).toContain("Gross Weight: 120 kg");
    expect(packingText).toContain("Gross Weight: 95 kg");
  });
});
