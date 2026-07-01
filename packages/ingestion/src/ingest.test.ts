/**
 * Integration test against the dev SQLite database (schema must be pushed —
 * `npm run db:push` — which CI does before tests). Uses its own reference
 * namespace (TEST-INGEST-*) and cleans up after itself.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@veritariff/db";
import { ingestBatch } from "./ingest";
import type { IncomingDocument } from "./types";

const docsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../data/fixtures/steel-7318/documents",
);

const TEST_REF = "TEST-INGEST-0117";
// Every reference-like number in the test documents gets a test-only suffix so
// the test can never collide with seeded data or leftovers from failed runs.
const ALL_TEST_REFS = [TEST_REF, "MS-INV-2026-T117", "MS-PL-2026-T117"];

function fixtureDoc(file: string, source: "upload" | "email" = "upload"): IncomingDocument {
  const text = readFileSync(path.join(docsDir, file), "utf8")
    .replaceAll("MS-EXP-2026-0117", TEST_REF)
    .replaceAll("MS-INV-2026-0117", "MS-INV-2026-T117")
    .replaceAll("MS-PL-2026-0117", "MS-PL-2026-T117");
  return {
    filename: file,
    mimeType: "text/plain",
    bytes: new Uint8Array(Buffer.from(text, "utf8")),
    source,
  };
}

let storageDir: string;

beforeAll(async () => {
  storageDir = mkdtempSync(path.join(tmpdir(), "veritariff-ingest-"));
  await prisma.shipment.deleteMany({ where: { reference: { in: ALL_TEST_REFS } } });
});

afterAll(async () => {
  await prisma.shipment.deleteMany({ where: { reference: { in: ALL_TEST_REFS } } });
  rmSync(storageDir, { recursive: true, force: true });
});

describe("ingestBatch (§5.1 acceptance criteria)", () => {
  it("groups an uploaded mixed set into one shipment with typed documents", async () => {
    const result = await ingestBatch(
      prisma,
      [
        fixtureDoc("commercial_invoice.txt"),
        fixtureDoc("packing_list.txt"),
        fixtureDoc("suppliers_declaration.txt"),
      ],
      { storageDir },
    );

    expect(result.shipments).toHaveLength(1);
    const [shipment] = result.shipments;
    expect(shipment?.created).toBe(true);
    expect(shipment?.reference).toBe(TEST_REF);
    expect(shipment?.documentIds).toHaveLength(3);

    const docs = await prisma.document.findMany({
      where: { shipmentId: shipment!.shipmentId },
    });
    expect(docs.map((d) => d.type).sort()).toEqual([
      "commercial_invoice",
      "packing_list",
      "suppliers_declaration",
    ]);

    const audit = await prisma.auditEvent.findMany({
      where: { shipmentId: shipment!.shipmentId, action: "documents.ingested" },
    });
    expect(audit.length).toBeGreaterThan(0);
  });

  it("attaches a later email-forwarded document to the existing shipment by reference", async () => {
    const result = await ingestBatch(
      prisma,
      [fixtureDoc("packing_list.txt", "email")],
      { storageDir },
    );

    expect(result.shipments).toHaveLength(1);
    expect(result.shipments[0]?.created).toBe(false);
    expect(result.shipments[0]?.reference).toBe(TEST_REF);

    const shipments = await prisma.shipment.findMany({ where: { reference: TEST_REF } });
    expect(shipments).toHaveLength(1);
  });
});
