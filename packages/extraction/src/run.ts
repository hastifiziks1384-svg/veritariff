import { readFileSync } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@veritariff/db";
import { evaluateCompleteness, type FieldObservation } from "@veritariff/engine";
import type { DocumentType } from "@veritariff/shared";
import type { ExtractionService } from "./types";

export interface RunExtractionOptions {
  /** Directory that rawFileUrl paths (e.g. "storage/<id>/<file>") are relative to. */
  storageRoot: string;
  lowConfidenceThreshold?: number;
}

export interface ExtractionSummary {
  documentsProcessed: number;
  fieldsExtracted: number;
  flagsCreated: number;
}

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".csv": "text/csv",
};

/**
 * Runs extraction over every document in a shipment, persists per-field
 * results with source document + confidence, and turns the deterministic
 * completeness findings into Flags. Re-runnable: previous extraction output
 * and extraction-sourced flags are replaced, and everything is audited.
 */
export async function runShipmentExtraction(
  prisma: PrismaClient,
  service: ExtractionService,
  shipmentId: string,
  options: RunExtractionOptions,
): Promise<ExtractionSummary> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { documents: true },
  });
  if (!shipment) throw new Error(`Shipment ${shipmentId} not found`);

  const observations: FieldObservation[] = [];
  let fieldsExtracted = 0;

  for (const doc of shipment.documents) {
    const filename = doc.originalFilename ?? path.basename(doc.rawFileUrl);
    const bytes = new Uint8Array(
      readFileSync(path.join(options.storageRoot, doc.rawFileUrl)),
    );

    const result = await service.extract({
      documentId: doc.id,
      filename,
      documentType: doc.type as DocumentType,
      mimeType: MIME_BY_EXT[path.extname(filename).toLowerCase()] ?? "application/octet-stream",
      bytes,
    });

    await prisma.extractedField.deleteMany({ where: { documentId: doc.id } });
    for (const field of result.fields) {
      await prisma.extractedField.create({
        data: {
          documentId: doc.id,
          name: field.name,
          value: field.value,
          unit: field.unit,
          confidence: field.confidence,
          status: field.status,
        },
      });
      observations.push({
        documentId: doc.id,
        documentType: doc.type as DocumentType,
        name: field.name,
        value: field.value,
        unit: field.unit,
        confidence: field.confidence,
        status: field.status,
      });
      fieldsExtracted += 1;
    }
  }

  // Deterministic completeness check → Flags. Extraction-sourced flags are
  // replaced wholesale on re-run so they always reflect the current record.
  const findings = evaluateCompleteness(observations, {
    lowConfidenceThreshold: options.lowConfidenceThreshold,
  });
  await prisma.flag.deleteMany({ where: { shipmentId, source: "extraction" } });
  for (const finding of findings) {
    await prisma.flag.create({
      data: {
        shipmentId,
        field: finding.field,
        severity: finding.severity,
        source: "extraction",
        conflictingValues: JSON.stringify(
          finding.sourceDocumentIds.map((id) => ({ sourceDocumentId: id })),
        ),
        explanation: finding.explanation,
      },
    });
  }

  // Fill shipment header fields the record now knows (best-confidence value),
  // only where they are currently empty — never overwriting user data.
  const bestValue = (name: string): string | null => {
    const candidates = observations
      .filter((o) => o.name === name && o.value !== null && o.status === "extracted")
      .sort((a, b) => b.confidence - a.confidence);
    return candidates[0]?.value ?? null;
  };
  await prisma.shipment.update({
    where: { id: shipmentId },
    data: {
      shipperName: shipment.shipperName ?? bestValue("shipper"),
      consigneeName: shipment.consigneeName ?? bestValue("consignee"),
      originCountry: shipment.originCountry ?? bestValue("stated_origin"),
    },
  });

  await prisma.auditEvent.create({
    data: {
      shipmentId,
      actor: "system",
      action: "extraction.completed",
      detail: JSON.stringify({
        documentsProcessed: shipment.documents.length,
        fieldsExtracted,
        flagsCreated: findings.length,
        service: service.constructor.name,
      }),
    },
  });

  return {
    documentsProcessed: shipment.documents.length,
    fieldsExtracted,
    flagsCreated: findings.length,
  };
}
