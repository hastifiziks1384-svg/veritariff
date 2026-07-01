/**
 * Seeds the database with the steel acceptance fixture (§10):
 * one EU→UK shipment of steel threaded fasteners (HS 7318.15) with a
 * commercial invoice, packing list, and supplier's declaration —
 * including the deliberate 120 kg vs 95 kg gross-weight mismatch.
 *
 * Idempotent: re-running replaces the fixture shipment.
 */
import "dotenv/config";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const fixtureDir = path.join(repoRoot, "data/fixtures/steel-7318");
const storageDir = path.join(repoRoot, "storage");

interface FixtureShipment {
  reference: string;
  shipperName: string;
  consigneeName: string;
  originCountry: string;
  destinationCountry: string;
  lane: string;
  shipmentDate: string;
  documents: { file: string; type: string; format: string; source: string }[];
}

async function main() {
  const fixture: FixtureShipment = JSON.parse(
    readFileSync(path.join(fixtureDir, "shipment.json"), "utf8"),
  );

  // Replace any previous seed of the same fixture (cascades to documents etc.)
  await prisma.shipment.deleteMany({ where: { reference: fixture.reference } });

  const shipment = await prisma.shipment.create({
    data: {
      reference: fixture.reference,
      shipperName: fixture.shipperName,
      consigneeName: fixture.consigneeName,
      originCountry: fixture.originCountry,
      destinationCountry: fixture.destinationCountry,
      lane: fixture.lane,
      shipmentDate: new Date(fixture.shipmentDate),
    },
  });

  mkdirSync(path.join(storageDir, shipment.id), { recursive: true });

  for (const doc of fixture.documents) {
    const filename = path.basename(doc.file);
    const storedRelPath = path.join("storage", shipment.id, filename);
    copyFileSync(path.join(fixtureDir, doc.file), path.join(repoRoot, storedRelPath));

    await prisma.document.create({
      data: {
        shipmentId: shipment.id,
        type: doc.type,
        format: doc.format,
        source: doc.source,
        rawFileUrl: storedRelPath,
        originalFilename: filename,
      },
    });
  }

  await prisma.auditEvent.create({
    data: {
      shipmentId: shipment.id,
      actor: "system",
      action: "shipment.seeded",
      detail: JSON.stringify({ fixture: "steel-7318", documents: fixture.documents.length }),
    },
  });

  console.log(
    `Seeded fixture shipment ${shipment.reference} (${shipment.id}) with ${fixture.documents.length} documents.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
