/**
 * Integration test for the rules-of-origin pipeline (§5.5 AC) against the
 * dev database, on top of extraction + classification with recorded data.
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
import { loadOriginRuleTable, runShipmentRoo } from "./roo-run";
import { runShipmentExtraction } from "./run";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const fixtureDir = path.join(repoRoot, "data/fixtures/steel-7318");
const table = loadOriginRuleTable(repoRoot);

const TEST_REF = "TEST-ROO-0117";
let storageRoot: string;
let shipmentId: string;

beforeAll(async () => {
  storageRoot = mkdtempSync(path.join(tmpdir(), "veritariff-roo-"));
  await prisma.shipment.deleteMany({ where: { reference: TEST_REF } });

  const shipment = await prisma.shipment.create({
    data: { reference: TEST_REF, lane: "EU->UK", originCountry: "DE", destinationCountry: "GB" },
  });
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
  await runShipmentClassification(
    prisma,
    new RecordedTariffClient(path.join(repoRoot, "data/fixtures/tariff")),
    shipmentId,
  );
});

afterAll(async () => {
  await prisma.shipment.deleteMany({ where: { reference: TEST_REF } });
  rmSync(storageRoot, { recursive: true, force: true });
});

describe("runShipmentRoo (§5.5 acceptance criteria)", () => {
  it("surfaces the TCA rule for the steel shipment, cited and illustrative-flagged", async () => {
    const result = await runShipmentRoo(prisma, shipmentId, table);
    expect(result.outcome).toBe("surfaced");
    expect(result.context?.hsHeading).toBe("7318");

    const row = await prisma.originRuleContext.findFirst({ where: { shipmentId } });
    expect(row).toMatchObject({
      agreement: "TCA",
      hsHeading: "7318",
      ruleType: "CTH",
      isIllustrative: true,
    });
    expect(row!.citedArticle).toContain("Annex 3");
    expect(row!.rulesDataVersion).toContain("draft");

    const audit = await prisma.auditEvent.findMany({
      where: { shipmentId, action: "roo.completed" },
    });
    expect(audit.length).toBeGreaterThan(0);
  });

  it("stores an explanation that cannot be read as a qualification claim", async () => {
    const row = await prisma.originRuleContext.findFirst({ where: { shipmentId } });
    expect(row!.plainEnglish).toContain("does NOT assess or assert");
    expect(row!.plainEnglish!.toLowerCase()).not.toMatch(
      /goods (qualify|are originating|meet the rule)/,
    );
  });

  it("declines to surface a rule for a non-UK/EU corridor", async () => {
    const other = await prisma.shipment.create({
      data: { reference: TEST_REF, lane: "CN->UK", originCountry: "CN", destinationCountry: "GB" },
    });
    const result = await runShipmentRoo(prisma, other.id, table);
    expect(result.outcome).toBe("not_uk_eu_lane");
    const rows = await prisma.originRuleContext.findMany({ where: { shipmentId: other.id } });
    expect(rows).toHaveLength(0);
  });
});
