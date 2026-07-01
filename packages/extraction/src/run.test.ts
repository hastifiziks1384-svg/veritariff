/**
 * Integration test for the extraction pipeline (§5.2 acceptance criteria),
 * using the deterministic FixtureExtractionService against the dev database.
 */
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@veritariff/db";
import { FixtureExtractionService } from "./fixture";
import { runShipmentExtraction } from "./run";

const fixtureDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../data/fixtures/steel-7318",
);

const TEST_REF_FULL = "TEST-EXTRACT-FULL";
const TEST_REF_PARTIAL = "TEST-EXTRACT-PARTIAL";

let storageRoot: string;
const service = new FixtureExtractionService(fixtureDir);

async function createShipment(reference: string, files: string[]) {
  const shipment = await prisma.shipment.create({ data: { reference } });
  mkdirSync(path.join(storageRoot, "storage", shipment.id), { recursive: true });
  for (const file of files) {
    const rel = path.join("storage", shipment.id, file);
    copyFileSync(path.join(fixtureDir, "documents", file), path.join(storageRoot, rel));
    await prisma.document.create({
      data: {
        shipmentId: shipment.id,
        type: file.replace(".txt", ""),
        format: "txt",
        source: "upload",
        rawFileUrl: rel,
        originalFilename: file,
      },
    });
  }
  return shipment;
}

beforeAll(async () => {
  storageRoot = mkdtempSync(path.join(tmpdir(), "veritariff-extract-"));
  await prisma.shipment.deleteMany({
    where: { reference: { in: [TEST_REF_FULL, TEST_REF_PARTIAL] } },
  });
});

afterAll(async () => {
  await prisma.shipment.deleteMany({
    where: { reference: { in: [TEST_REF_FULL, TEST_REF_PARTIAL] } },
  });
  rmSync(storageRoot, { recursive: true, force: true });
});

describe("runShipmentExtraction (§5.2 acceptance criteria)", () => {
  it("extracts fields with source document + confidence for the full fixture set", async () => {
    const shipment = await createShipment(TEST_REF_FULL, [
      "commercial_invoice.txt",
      "packing_list.txt",
      "suppliers_declaration.txt",
    ]);

    const summary = await runShipmentExtraction(prisma, service, shipment.id, {
      storageRoot,
    });
    expect(summary.documentsProcessed).toBe(3);
    expect(summary.fieldsExtracted).toBeGreaterThan(15);

    // Every field row carries its source document and a confidence value.
    const fields = await prisma.extractedField.findMany({
      where: { document: { shipmentId: shipment.id } },
      include: { document: true },
    });
    expect(fields.every((f) => f.documentId && f.confidence !== null)).toBe(true);

    // The deliberate gross-weight disagreement is captured per source.
    const grossWeights = fields.filter((f) => f.name === "gross_weight_kg");
    const byDoc = Object.fromEntries(grossWeights.map((f) => [f.document.type, f.value]));
    expect(byDoc["commercial_invoice"]).toBe("120");
    expect(byDoc["packing_list"]).toBe("95");

    // The packing list's absent fields are recorded as missing, not invented.
    const plOrigin = fields.find(
      (f) => f.document.type === "packing_list" && f.name === "stated_origin",
    );
    expect(plOrigin?.status).toBe("missing");
    expect(plOrigin?.value).toBeNull();

    // Full fixture record is complete at shipment level → no extraction flags.
    const flags = await prisma.flag.findMany({
      where: { shipmentId: shipment.id, source: "extraction" },
    });
    expect(flags).toHaveLength(0);

    // Shipment header enriched from extraction.
    const updated = await prisma.shipment.findUnique({ where: { id: shipment.id } });
    expect(updated?.shipperName).toBe("Müller Stahl GmbH");
  });

  it("flags missing required fields when only a packing list is provided", async () => {
    const shipment = await createShipment(TEST_REF_PARTIAL, ["packing_list.txt"]);

    const summary = await runShipmentExtraction(prisma, service, shipment.id, {
      storageRoot,
    });
    expect(summary.flagsCreated).toBeGreaterThan(0);

    const flags = await prisma.flag.findMany({
      where: { shipmentId: shipment.id, source: "extraction" },
    });
    const flaggedFields = flags.map((f) => f.field);
    for (const expected of ["hs_code", "stated_origin", "incoterm", "invoice_value", "currency"]) {
      expect(flaggedFields, expected).toContain(expected);
    }
    // Flags surface the gap; they never carry an invented value.
    expect(flags.every((f) => f.resolution === "open")).toBe(true);

    const audit = await prisma.auditEvent.findMany({
      where: { shipmentId: shipment.id, action: "extraction.completed" },
    });
    expect(audit).toHaveLength(1);
  });
});
