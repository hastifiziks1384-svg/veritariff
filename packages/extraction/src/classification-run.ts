import type { PrismaClient } from "@veritariff/db";
import {
  classify,
  matchHeadingRules,
  type ClassificationFacts,
  type ClassificationOutcome,
  type HeadingReferenceData,
} from "@veritariff/engine";
import type { TariffDataSource } from "@veritariff/tariff-client";

/**
 * Classification verification pipeline (§5.4): assembles the facts from the
 * extracted record, fetches tariff reference data for the candidate heading
 * (live UK Trade Tariff, or recorded fallback), runs the deterministic
 * engine, persists the Classification with its reasoning chain + citations,
 * and raises flags for disagreements and guided questions.
 */
export async function runShipmentClassification(
  prisma: PrismaClient,
  tariff: TariffDataSource,
  shipmentId: string,
): Promise<ClassificationOutcome> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { documents: { include: { extractedFields: true } } },
  });
  if (!shipment) throw new Error(`Shipment ${shipmentId} not found`);

  const best = (name: string): string | null => {
    const candidates = shipment.documents
      .flatMap((d) => d.extractedFields)
      .filter((f) => f.name === name && f.value !== null && f.status === "extracted")
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    return candidates[0]?.value ?? null;
  };

  const facts: ClassificationFacts = {
    productDescription: best("product_description"),
    declaredHsCode: best("hs_code"),
    composition: best("composition"),
  };

  // The engine is pure; fetch reference data only when exactly one curated
  // heading matches (the 0- and multi-candidate paths need no reference).
  let reference: HeadingReferenceData | null = null;
  const candidates = facts.productDescription
    ? matchHeadingRules(facts.productDescription)
    : [];
  if (candidates.length === 1) {
    reference = await tariff.getHeadingReference(candidates[0]!.heading);
  }

  const outcome = classify(facts, reference);

  // Latest classification only; the evidence bundle snapshots history.
  await prisma.classification.deleteMany({ where: { shipmentId } });
  await prisma.classification.create({
    data: {
      shipmentId,
      hsCode: outcome.hsCode ?? "",
      declaredHsCode: facts.declaredHsCode,
      confidence: outcome.confidence,
      reasoningChain: JSON.stringify(outcome.reasoningChain),
      citations: JSON.stringify(outcome.citations),
      status: outcome.status,
      rulesDataVersion: reference
        ? `${outcome.rulesVersion}; tariff:${reference.source}@${reference.retrievedAt}`
        : outcome.rulesVersion,
    },
  });

  // Reconcile classification flags: replace open ones, keep reviewed history.
  await prisma.flag.deleteMany({
    where: { shipmentId, source: "classification", resolution: "open" },
  });
  if (outcome.status === "disagrees_with_declared") {
    const formatted = outcome.hsCode
      ? `${outcome.hsCode.slice(0, 4)}.${outcome.hsCode.slice(4)}`
      : "";
    await prisma.flag.create({
      data: {
        shipmentId,
        field: "hs_code",
        severity: "block",
        source: "classification",
        conflictingValues: JSON.stringify([]),
        explanation: `The declared HS code ${facts.declaredHsCode} does not match the reasoned classification ${formatted}. Review the classification reasoning chain and its citations, then correct the declared code or record why the declared code stands. No value is auto-recommended for HS codes.`,
      },
    });
  } else if (outcome.status === "needs_input" && outcome.guidedQuestion) {
    await prisma.flag.create({
      data: {
        shipmentId,
        field: "hs_code",
        severity: "warn",
        source: "classification",
        conflictingValues: JSON.stringify([]),
        explanation: `Classification cannot conclude — ${outcome.guidedQuestion}`,
      },
    });
  }

  await prisma.auditEvent.create({
    data: {
      shipmentId,
      actor: "system",
      action: "classification.completed",
      detail: JSON.stringify({
        status: outcome.status,
        hsCode: outcome.hsCode,
        declaredHsCode: facts.declaredHsCode,
        rulesVersion: outcome.rulesVersion,
        tariffSource: reference?.source ?? null,
      }),
    },
  });

  return outcome;
}
