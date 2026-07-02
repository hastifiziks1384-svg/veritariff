/**
 * The §10 acceptance fixture, end-to-end through the same pipeline functions
 * the product's API routes call: ingest → extract → mismatch → classify →
 * origin rule → evidence bundle. Steel threaded fasteners (7318.15), EU→UK,
 * with the deliberate 120 kg vs 95 kg gross-weight mismatch.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@veritariff/db";
import { ingestBatch, type IncomingDocument } from "@veritariff/ingestion";
import {
  FixtureExtractionService,
  loadOriginRuleTable,
  runShipmentClassification,
  runShipmentExtraction,
  runShipmentRoo,
} from "@veritariff/extraction";
import { buildEvidenceBundle, renderBundlePdf } from "@veritariff/export";
import { RecordedTariffClient } from "@veritariff/tariff-client";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = path.join(repoRoot, "data/fixtures/steel-7318");

const TEST_REF = "TEST-E2E-0117";
const REF_MAP: [string, string][] = [
  ["MS-EXP-2026-0117", TEST_REF],
  ["MS-INV-2026-0117", "MS-INV-2026-E117"],
  ["MS-PL-2026-0117", "MS-PL-2026-E117"],
];
const ALL_REFS = [TEST_REF, "MS-INV-2026-E117", "MS-PL-2026-E117"];

function fixtureDoc(file: string): IncomingDocument {
  let text = readFileSync(path.join(fixtureDir, "documents", file), "utf8");
  for (const [from, to] of REF_MAP) text = text.replaceAll(from, to);
  return {
    filename: file,
    mimeType: "text/plain",
    bytes: new Uint8Array(Buffer.from(text, "utf8")),
    source: "upload",
  };
}

/** Fixture extractor keyed on ground truth, re-referenced like the documents. */
class E2eExtractionService extends FixtureExtractionService {
  override async extract(input: Parameters<FixtureExtractionService["extract"]>[0]) {
    const result = await super.extract(input);
    return {
      ...result,
      fields: result.fields.map((f) => {
        let value = f.value;
        if (value) for (const [from, to] of REF_MAP) value = value.replaceAll(from, to);
        return { ...f, value };
      }),
    };
  }
}

let storageRoot: string;
let shipmentId: string;

beforeAll(async () => {
  storageRoot = mkdtempSync(path.join(tmpdir(), "veritariff-e2e-"));
  await prisma.shipment.deleteMany({ where: { reference: { in: ALL_REFS } } });
});

afterAll(async () => {
  await prisma.shipment.deleteMany({ where: { reference: { in: ALL_REFS } } });
  rmSync(storageRoot, { recursive: true, force: true });
});

describe("§10 steel acceptance fixture, end-to-end in-product", () => {
  it("ingests a mixed upload into one shipment with typed documents", async () => {
    const result = await ingestBatch(
      prisma,
      [
        fixtureDoc("commercial_invoice.txt"),
        fixtureDoc("packing_list.txt"),
        fixtureDoc("suppliers_declaration.txt"),
      ],
      { storageDir: path.join(storageRoot, "storage") },
    );
    expect(result.shipments).toHaveLength(1);
    expect(result.shipments[0]!.created).toBe(true);
    expect(result.shipments[0]!.documentIds).toHaveLength(3);
    shipmentId = result.shipments[0]!.shipmentId;

    const docs = await prisma.document.findMany({ where: { shipmentId } });
    expect(docs.map((d) => d.type).sort()).toEqual([
      "commercial_invoice",
      "packing_list",
      "suppliers_declaration",
    ]);

    // Corridor set by the operator (V1: lane is not inferred from documents).
    await prisma.shipment.update({
      where: { id: shipmentId },
      data: { lane: "EU->UK", originCountry: "DE", destinationCountry: "GB" },
    });
  });

  it("extracts fields with confidence and flags the weight mismatch with a recommendation", async () => {
    const summary = await runShipmentExtraction(
      prisma,
      new E2eExtractionService(fixtureDir),
      shipmentId,
      { storageRoot },
    );
    expect(summary.documentsProcessed).toBe(3);
    expect(summary.fieldsExtracted).toBeGreaterThan(20);

    const weightFlag = await prisma.flag.findFirst({
      where: { shipmentId, source: "mismatch", field: "gross_weight_kg" },
    });
    expect(weightFlag).toBeDefined();
    expect(["warn", "block"]).toContain(weightFlag!.severity);
    const values = (JSON.parse(weightFlag!.conflictingValues) as { value: string }[]).map(
      (v) => v.value,
    );
    expect(values.sort()).toEqual(["120", "95"].sort());
    expect(weightFlag!.recommendedValue).toBe("95");
  });

  it("verifies 7318.15 with cited Section XV and tariff notes", async () => {
    const outcome = await runShipmentClassification(
      prisma,
      new RecordedTariffClient(path.join(repoRoot, "data/fixtures/tariff")),
      shipmentId,
    );
    expect(outcome.status).toBe("verified");
    expect(outcome.hsCode).toBe("731815");
    const refs = outcome.citations.map((c) => c.reference);
    expect(refs.some((r) => r.includes("Section XV"))).toBe(true);
    expect(refs).toContain("GIR 1");
    expect(refs).toContain("GIR 6");
  });

  it("surfaces the TCA rule for 7318 — illustrative, cited, no qualification claim", async () => {
    const result = await runShipmentRoo(prisma, shipmentId, loadOriginRuleTable(repoRoot));
    expect(result.outcome).toBe("surfaced");
    expect(result.context).toMatchObject({
      hsHeading: "7318",
      ruleType: "CTH",
      isIllustrative: true,
    });
    expect(result.context!.plainEnglish).toContain("does NOT assess or assert");
  });

  it("exports the evidence bundle with citations, timestamps, and rules versions", async () => {
    const bundle = await buildEvidenceBundle(prisma, shipmentId);

    expect(bundle.shipment.reference).toBe(TEST_REF);
    expect(bundle.documents).toHaveLength(3);
    expect(bundle.flags.some((f) => f.field === "gross_weight_kg")).toBe(true);
    expect(bundle.classification?.citations.length).toBeGreaterThan(3);
    expect(bundle.originRule?.isIllustrative).toBe(true);
    expect(bundle.originRule?.citedArticle).toContain("Annex 3");
    expect(bundle.classification?.rulesDataVersion).toBeTruthy();
    expect(bundle.auditTrail.map((e) => e.action)).toEqual(
      expect.arrayContaining([
        "documents.ingested",
        "extraction.completed",
        "classification.completed",
        "roo.completed",
      ]),
    );
    expect(bundle.disclaimers.join(" ")).toContain("not a customs declaration");

    // Persisted snapshot.
    const row = await prisma.evidenceBundle.findFirst({ where: { shipmentId } });
    expect(row).toBeDefined();
    expect(row!.rulesDataVersion).toContain("draft");

    // Printable PDF renders.
    const pdf = await renderBundlePdf(bundle);
    expect(pdf.length).toBeGreaterThan(2000);
    expect(String.fromCharCode(...pdf.slice(0, 5))).toBe("%PDF-");
  });
});
