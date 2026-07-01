import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@veritariff/db";
import type { DocumentSource } from "@veritariff/shared";
import { groupByReference } from "./grouping";
import { extractReferenceCandidates } from "./references";
import { detectDocumentType } from "./typing";
import type { IncomingDocument } from "./types";

export interface IngestOptions {
  /** Root directory for raw file storage (repo-root /storage in dev). */
  storageDir: string;
}

export interface IngestedShipment {
  shipmentId: string;
  reference: string | null;
  /** false when documents were attached to an existing shipment. */
  created: boolean;
  documentIds: string[];
}

export interface IngestResult {
  shipments: IngestedShipment[];
}

const TEXT_LIKE = /^text\/|\.(txt|csv|eml)$/i;

function decodeText(doc: IncomingDocument): string {
  if (TEXT_LIKE.test(doc.mimeType) || TEXT_LIKE.test(doc.filename)) {
    return Buffer.from(doc.bytes).toString("utf8");
  }
  return "";
}

function safeFilename(filename: string): string {
  return path.basename(filename).replace(/[^\w.\-]+/g, "_");
}

/**
 * Ingests a batch of documents from any channel: types each document,
 * clusters them into shipments by shared reference (batch fallback when no
 * references are detectable), attaches to an existing shipment when the
 * reference matches one, stores raw files, and records audit events.
 */
export async function ingestBatch(
  prisma: PrismaClient,
  incoming: IncomingDocument[],
  options: IngestOptions,
): Promise<IngestResult> {
  const prepared = incoming.map((doc) => {
    const text = decodeText(doc);
    return {
      doc,
      text,
      type: doc.declaredType ?? detectDocumentType(text, doc.filename),
      references: extractReferenceCandidates(text),
    };
  });

  const result: IngestResult = { shipments: [] };

  for (const group of groupByReference(prepared)) {
    // Match against ANY reference seen in the group: a follow-up document may
    // lead with its own local number but still carry the shipment reference.
    const existing =
      group.references.length > 0
        ? await prisma.shipment.findFirst({
            where: { reference: { in: group.references } },
          })
        : null;

    const shipment =
      existing ??
      (await prisma.shipment.create({ data: { reference: group.reference } }));

    const shipmentStorage = path.join(options.storageDir, shipment.id);
    mkdirSync(shipmentStorage, { recursive: true });

    const documentIds: string[] = [];
    let source: DocumentSource = "upload";
    for (const item of group.docs) {
      source = item.doc.source;
      const stored = `${Date.now()}-${safeFilename(item.doc.filename)}`;
      writeFileSync(path.join(shipmentStorage, stored), item.doc.bytes);

      const record = await prisma.document.create({
        data: {
          shipmentId: shipment.id,
          type: item.type,
          format: path.extname(item.doc.filename).replace(".", "") || "bin",
          source: item.doc.source,
          rawFileUrl: `storage/${shipment.id}/${stored}`,
          originalFilename: item.doc.filename,
        },
      });
      documentIds.push(record.id);
    }

    await prisma.auditEvent.create({
      data: {
        shipmentId: shipment.id,
        actor: "system",
        action: "documents.ingested",
        detail: JSON.stringify({
          source,
          createdShipment: !existing,
          reference: group.reference,
          files: group.docs.map((d) => ({
            filename: d.doc.filename,
            detectedType: d.type,
          })),
        }),
      },
    });

    result.shipments.push({
      shipmentId: shipment.id,
      reference: shipment.reference,
      created: !existing,
      documentIds,
    });
  }

  return result;
}
