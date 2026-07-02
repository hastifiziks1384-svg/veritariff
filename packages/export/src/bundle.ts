import type { PrismaClient } from "@veritariff/db";
import type { Citation, ConflictingValue } from "@veritariff/shared";

/**
 * Evidence/audit export (§5.6): a self-contained snapshot of the shipment
 * record — flags with their resolutions, classification reasoning, the
 * surfaced origin rule, every citation, timestamps, and the rules-data
 * versions the determinations were made against.
 */
export interface EvidenceBundleContents {
  bundleFormatVersion: string;
  generatedAt: string;
  disclaimers: string[];
  shipment: {
    id: string;
    reference: string | null;
    shipper: string | null;
    consignee: string | null;
    originCountry: string | null;
    destinationCountry: string | null;
    lane: string | null;
    createdAt: string;
  };
  documents: {
    id: string;
    type: string;
    filename: string | null;
    source: string;
    uploadedAt: string;
    extractedFields: {
      name: string;
      value: string | null;
      unit: string | null;
      confidence: number | null;
      status: string;
    }[];
  }[];
  flags: {
    field: string;
    severity: string;
    source: string;
    explanation: string;
    conflictingValues: ConflictingValue[];
    recommendedValue: string | null;
    recommendedValueUnit: string | null;
    recommendationBasis: string | null;
    recommendationStatus: string;
    resolution: string;
    resolvedBy: string | null;
    resolvedNote: string | null;
    resolvedAt: string | null;
    createdAt: string;
  }[];
  classification: {
    status: string;
    hsCode: string | null;
    declaredHsCode: string | null;
    confidence: number;
    reasoningChain: unknown[];
    citations: Citation[];
    rulesDataVersion: string | null;
    createdAt: string;
  } | null;
  originRule: {
    agreement: string;
    hsHeading: string;
    ruleText: string;
    ruleType: string;
    citedArticle: string;
    plainEnglish: string | null;
    isIllustrative: boolean;
    rulesDataVersion: string;
    createdAt: string;
  } | null;
  auditTrail: { at: string; actor: string; action: string; detail: unknown }[];
}

const DISCLAIMERS = [
  "Prepared with Veritariff V1 — deterministic, codified legal logic; every determination is cited to its source and presented for human review.",
  "This bundle assists entry preparation only. Nothing in it has been filed with HMRC/CDS, and it is not a customs declaration.",
  "The rules-of-origin section explains the applicable rule only; it does not assess or assert that the goods qualify for preferential origin.",
  "Content marked 'illustrative' is pending validation by a trade-law advisor and must not be relied on for a preference claim.",
];

export async function buildEvidenceBundle(
  prisma: PrismaClient,
  shipmentId: string,
): Promise<EvidenceBundleContents> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: {
      documents: { orderBy: { uploadedAt: "asc" }, include: { extractedFields: true } },
      flags: { orderBy: { createdAt: "asc" } },
      classifications: { orderBy: { createdAt: "desc" }, take: 1 },
      originRuleContexts: { orderBy: { createdAt: "desc" }, take: 1 },
      auditEvents: { orderBy: { at: "asc" } },
    },
  });
  if (!shipment) throw new Error(`Shipment ${shipmentId} not found`);

  const classification = shipment.classifications[0] ?? null;
  const originRule = shipment.originRuleContexts[0] ?? null;

  const contents: EvidenceBundleContents = {
    bundleFormatVersion: "veritariff-evidence-1",
    generatedAt: new Date().toISOString(),
    disclaimers: DISCLAIMERS,
    shipment: {
      id: shipment.id,
      reference: shipment.reference,
      shipper: shipment.shipperName,
      consignee: shipment.consigneeName,
      originCountry: shipment.originCountry,
      destinationCountry: shipment.destinationCountry,
      lane: shipment.lane,
      createdAt: shipment.createdAt.toISOString(),
    },
    documents: shipment.documents.map((d) => ({
      id: d.id,
      type: d.type,
      filename: d.originalFilename,
      source: d.source,
      uploadedAt: d.uploadedAt.toISOString(),
      extractedFields: d.extractedFields.map((f) => ({
        name: f.name,
        value: f.value,
        unit: f.unit,
        confidence: f.confidence,
        status: f.status,
      })),
    })),
    flags: shipment.flags.map((f) => ({
      field: f.field,
      severity: f.severity,
      source: f.source,
      explanation: f.explanation,
      conflictingValues: JSON.parse(f.conflictingValues) as ConflictingValue[],
      recommendedValue: f.recommendedValue,
      recommendedValueUnit: f.recommendedValueUnit,
      recommendationBasis: f.recommendationBasis,
      recommendationStatus: f.recommendationStatus,
      resolution: f.resolution,
      resolvedBy: f.resolvedBy,
      resolvedNote: f.resolvedNote,
      resolvedAt: f.resolvedAt?.toISOString() ?? null,
      createdAt: f.createdAt.toISOString(),
    })),
    classification: classification
      ? {
          status: classification.status,
          hsCode: classification.hsCode || null,
          declaredHsCode: classification.declaredHsCode,
          confidence: classification.confidence,
          reasoningChain: JSON.parse(classification.reasoningChain) as unknown[],
          citations: JSON.parse(classification.citations) as Citation[],
          rulesDataVersion: classification.rulesDataVersion,
          createdAt: classification.createdAt.toISOString(),
        }
      : null,
    originRule: originRule
      ? {
          agreement: originRule.agreement,
          hsHeading: originRule.hsHeading,
          ruleText: originRule.ruleText,
          ruleType: originRule.ruleType,
          citedArticle: originRule.citedArticle,
          plainEnglish: originRule.plainEnglish,
          isIllustrative: originRule.isIllustrative,
          rulesDataVersion: originRule.rulesDataVersion,
          createdAt: originRule.createdAt.toISOString(),
        }
      : null,
    auditTrail: shipment.auditEvents.map((e) => ({
      at: e.at.toISOString(),
      actor: e.actor,
      action: e.action,
      detail: JSON.parse(e.detail) as unknown,
    })),
  };

  const rulesDataVersion = [
    classification?.rulesDataVersion,
    originRule?.rulesDataVersion,
  ]
    .filter(Boolean)
    .join("; ");

  await prisma.evidenceBundle.create({
    data: {
      shipmentId,
      contents: JSON.stringify(contents),
      rulesDataVersion: rulesDataVersion || null,
    },
  });
  await prisma.auditEvent.create({
    data: {
      shipmentId,
      actor: "system",
      action: "evidence.exported",
      detail: JSON.stringify({ bundleFormatVersion: contents.bundleFormatVersion }),
    },
  });

  return contents;
}
