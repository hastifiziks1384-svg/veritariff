/**
 * Integration test for classification verification (§5.4 AC) against the
 * dev database, using recorded UK Trade Tariff responses (real data,
 * frozen) so CI needs no network.
 */
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@veritariff/db";
import { RecordedTariffClient } from "@veritariff/tariff-client";
import { FixtureExtractionService } from "./fixture";
import { runShipmentClassification } from "./classification-run";
import { runShipmentExtraction } from "./run";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const fixtureDir = path.join(repoRoot, "data/fixtures/steel-7318");
const tariff = new RecordedTariffClient(path.join(repoRoot, "data/fixtures/tariff"));

const TEST_REF = "TEST-CLASSIFY-0117";
let storageRoot: string;
let shipmentId: string;

beforeAll(async () => {
  storageRoot = mkdtempSync(path.join(tmpdir(), "veritariff-classify-"));
  await prisma.shipment.deleteMany({ where: { reference: TEST_REF } });

  const shipment = await prisma.shipment.create({ data: { reference: TEST_REF } });
  shipmentId = shipment.id;
  mkdirSync(path.join(storageRoot, "storage", shipmentId), { recursive: true });
  for (const file of [
    "commercial_invoice.txt",
    "packing_list.txt",
    "suppliers_declaration.txt",
  ]) {
    const rel = path.join("storage", shipmentId, file);
    copyFileSync(path.join(fixtureDir, "documents", file), path.join(storageRoot, rel));
    await prisma.document.create({
      data: {
        shipmentId,
        type: file.replace(".txt", ""),
        format: "txt",
        source: "upload",
        rawFileUrl: rel,
        originalFilename: file,
      },
    });
  }
  await runShipmentExtraction(
    prisma,
    new FixtureExtractionService(fixtureDir),
    shipmentId,
    { storageRoot },
  );
});

afterAll(async () => {
  await prisma.shipment.deleteMany({ where: { reference: TEST_REF } });
  rmSync(storageRoot, { recursive: true, force: true });
});

describe("runShipmentClassification (§5.4 acceptance criteria)", () => {
  it("verifies the declared 7318.15 with a cited reasoning chain, persisted", async () => {
    const outcome = await runShipmentClassification(prisma, tariff, shipmentId);
    expect(outcome.status).toBe("verified");
    expect(outcome.hsCode).toBe("731815");

    const row = await prisma.classification.findFirst({ where: { shipmentId } });
    expect(row).toBeDefined();
    expect(row!.status).toBe("verified");
    expect(row!.declaredHsCode).toBe("7318.15");
    const citations = JSON.parse(row!.citations) as { reference: string }[];
    expect(citations.length).toBeGreaterThan(3);
    const chain = JSON.parse(row!.reasoningChain) as { kind: string }[];
    expect(chain.map((s) => s.kind)).toContain("gir6");
    expect(row!.rulesDataVersion).toContain("tariff:recorded");

    // Agreement → no classification flag.
    const flags = await prisma.flag.findMany({
      where: { shipmentId, source: "classification" },
    });
    expect(flags).toHaveLength(0);

    const audit = await prisma.auditEvent.findMany({
      where: { shipmentId, action: "classification.completed" },
    });
    expect(audit.length).toBeGreaterThan(0);
  });

  it("raises a block flag when the declared code disagrees", async () => {
    // Doctor the declared HS code on the invoice's extracted field.
    const invoice = await prisma.document.findFirst({
      where: { shipmentId, type: "commercial_invoice" },
    });
    await prisma.extractedField.updateMany({
      where: { documentId: invoice!.id, name: "hs_code" },
      data: { value: "7326.90" },
    });
    await prisma.extractedField.updateMany({
      where: { document: { shipmentId }, name: "hs_code", NOT: { documentId: invoice!.id } },
      data: { value: "7326.90" },
    });

    const outcome = await runShipmentClassification(prisma, tariff, shipmentId);
    expect(outcome.status).toBe("disagrees_with_declared");

    const flags = await prisma.flag.findMany({
      where: { shipmentId, source: "classification", resolution: "open" },
    });
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ field: "hs_code", severity: "block" });
    // HS flags never carry an auto-recommendation.
    expect(flags[0]!.recommendationStatus).toBe("none");
  });
});
