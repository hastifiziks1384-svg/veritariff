import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@veritariff/db";
import { CANONICAL_FIELDS, type Citation, type ConflictingValue } from "@veritariff/shared";
import { ClassifyButton } from "./classify-button";
import { ExtractButton } from "./extract-button";
import { FlagCard, type FlagView } from "./flag-card";
import { RooButton } from "./roo-button";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  commercial_invoice: "Commercial invoice",
  packing_list: "Packing list",
  bill_of_lading: "Bill of lading",
  cmr: "CMR",
  mill_certificate: "Mill certificate",
  suppliers_declaration: "Supplier's declaration",
  other: "Untyped document",
};

const FIELD_LABELS: Record<string, string> = {
  reference: "Reference",
  shipper: "Shipper",
  consignee: "Consignee",
  product_description: "Product description",
  invoice_value: "Value",
  currency: "Currency",
  quantity: "Quantity",
  gross_weight_kg: "Gross weight (kg)",
  net_weight_kg: "Net weight (kg)",
  hs_code: "HS code",
  stated_origin: "Stated origin",
  incoterm: "Incoterm",
  composition: "Composition",
  melt_and_pour_country: "Melt & pour country",
  non_originating_materials: "Non-originating materials",
};

export default async function ShipmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const shipment = await prisma.shipment.findUnique({
    where: { id },
    include: {
      documents: { orderBy: { uploadedAt: "asc" }, include: { extractedFields: true } },
      flags: { orderBy: { createdAt: "asc" } },
      classifications: { orderBy: { createdAt: "desc" }, take: 1 },
      originRuleContexts: { orderBy: { createdAt: "desc" }, take: 1 },
      auditEvents: { orderBy: { at: "desc" } },
    },
  });
  if (!shipment) notFound();

  const originRule = shipment.originRuleContexts[0] ?? null;
  const nonOriginatingInputs = shipment.documents
    .flatMap((d) => d.extractedFields)
    .filter((f) => f.name === "non_originating_materials" && f.value)
    .map((f) => f.value as string);

  const classification = shipment.classifications[0] ?? null;
  const reasoningChain = classification
    ? (JSON.parse(classification.reasoningChain) as {
        kind: string;
        text: string;
        citation?: Citation;
      }[])
    : [];

  const hasExtraction = shipment.documents.some((d) => d.extractedFields.length > 0);

  const docTypeById = new Map(shipment.documents.map((d) => [d.id, d.type]));
  const severityRank: Record<string, number> = { block: 0, warn: 1, info: 2 };
  const toFlagView = (f: (typeof shipment.flags)[number]): FlagView => {
    const conflicting = JSON.parse(f.conflictingValues) as ConflictingValue[];
    return {
      id: f.id,
      field: f.field,
      fieldLabel: FIELD_LABELS[f.field] ?? f.field,
      severity: f.severity,
      source: f.source,
      explanation: f.explanation,
      conflictingValues: conflicting
        .filter((cv) => cv.value)
        .map((cv) => ({
          value: cv.value,
          unit: cv.unit,
          documentLabel:
            TYPE_LABELS[cv.documentType ?? docTypeById.get(cv.sourceDocumentId) ?? ""] ??
            "document",
        })),
      recommendedValue: f.recommendedValue,
      recommendedValueUnit: f.recommendedValueUnit,
      recommendationBasis: f.recommendationBasis,
      recommendationStatus: f.recommendationStatus,
      resolution: f.resolution,
      resolvedBy: f.resolvedBy,
      resolvedNote: f.resolvedNote,
    };
  };
  const openFlags = shipment.flags
    .filter((f) => f.resolution === "open")
    .sort((a, b) => (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3));
  const closedFlags = shipment.flags.filter((f) => f.resolution !== "open");

  // Field × document matrix over canonical fields that appear at least once.
  const fieldRows = CANONICAL_FIELDS.filter((name) =>
    shipment.documents.some((d) => d.extractedFields.some((f) => f.name === name)),
  );

  return (
    <div>
      <Link href="/" className="text-sm text-road hover:underline">
        ← Shipments
      </Link>
      <div className="mt-2 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">
          {shipment.reference ?? "Shipment (no reference detected)"}
        </h1>
        {shipment.lane && <span className="text-ink/60">{shipment.lane}</span>}
      </div>
      {(shipment.shipperName || shipment.consigneeName) && (
        <p className="mt-1 text-ink/70">
          {shipment.shipperName ?? "—"} → {shipment.consigneeName ?? "—"}
        </p>
      )}

      <div className="mt-6 flex items-center gap-4">
        <ExtractButton shipmentId={shipment.id} />
        {hasExtraction && <ClassifyButton shipmentId={shipment.id} />}
        {classification && <RooButton shipmentId={shipment.id} />}
        {hasExtraction && (
          <span className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-ink/50">Evidence bundle:</span>
            <a
              href={`/api/shipments/${shipment.id}/evidence?format=pdf`}
              className="text-road hover:underline"
            >
              PDF
            </a>
            <a
              href={`/api/shipments/${shipment.id}/evidence?format=json`}
              className="text-road hover:underline"
            >
              JSON
            </a>
          </span>
        )}
        {!hasExtraction && (
          <span className="text-sm text-ink/60">
            No extracted record yet — run extraction to read the documents.
          </span>
        )}
      </div>

      {openFlags.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-lg font-medium">
            Flags <span className="text-ink/50">({openFlags.length} open)</span>
          </h2>
          <ul className="space-y-2">
            {openFlags.map((f) => (
              <FlagCard key={f.id} flag={toFlagView(f)} />
            ))}
          </ul>
        </>
      )}

      {closedFlags.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-lg font-medium">
            Reviewed flags <span className="text-ink/50">({closedFlags.length})</span>
          </h2>
          <ul className="space-y-2">
            {closedFlags.map((f) => (
              <FlagCard key={f.id} flag={toFlagView(f)} />
            ))}
          </ul>
        </>
      )}

      {classification && (
        <>
          <h2 className="mt-8 mb-3 text-lg font-medium">Classification</h2>
          <div className="rounded-md border border-ink/10 bg-white p-4">
            <div className="flex items-center gap-3">
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${
                  classification.status === "verified"
                    ? "bg-cleared/10 text-cleared"
                    : classification.status === "suggested"
                      ? "bg-road/10 text-road"
                      : classification.status === "disagrees_with_declared"
                        ? "bg-blocked/10 text-blocked"
                        : "bg-attention/10 text-attention"
                }`}
              >
                {classification.status.replaceAll("_", " ")}
              </span>
              {classification.hsCode && (
                <span className="text-lg font-semibold">
                  {classification.hsCode.slice(0, 4)}.{classification.hsCode.slice(4)}
                </span>
              )}
              {classification.declaredHsCode && (
                <span className="text-sm text-ink/60">
                  declared: {classification.declaredHsCode}
                </span>
              )}
              {classification.confidence > 0 && (
                <span className="text-sm text-ink/50">
                  confidence {Math.round(classification.confidence * 100)}%
                </span>
              )}
            </div>

            <ol className="mt-4 space-y-3 border-l-2 border-road/20 pl-4">
              {reasoningChain.map((step, i) => (
                <li key={i} className="text-sm">
                  <p className="text-ink/90">{step.text}</p>
                  {step.citation && (
                    <p className="mt-1 text-xs text-ink/55">
                      {step.citation.url ? (
                        <a
                          href={step.citation.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-road hover:underline"
                        >
                          {step.citation.reference}
                        </a>
                      ) : (
                        <span className="text-gold">{step.citation.reference}</span>
                      )}
                      {step.citation.quote && (
                        <span className="text-ink/50"> — “{step.citation.quote}”</span>
                      )}
                    </p>
                  )}
                </li>
              ))}
            </ol>

            <p className="mt-4 text-xs text-ink/45">
              Rules data: {classification.rulesDataVersion}
              {classification.rulesDataVersion?.includes("draft") &&
                " — curated ruleset pending trade-law advisor validation"}
            </p>
          </div>
        </>
      )}

      {originRule && (
        <>
          <h2 className="mt-8 mb-3 text-lg font-medium">Rule of origin ({originRule.agreement})</h2>
          <div className="rounded-md border border-ink/10 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-gold/10 px-2 py-0.5 text-xs font-medium text-gold">
                {originRule.ruleType}
              </span>
              <span className="font-medium">
                Heading {originRule.hsHeading.slice(0, 2)}.{originRule.hsHeading.slice(2)}
              </span>
              {originRule.isIllustrative && (
                <span className="rounded bg-attention/10 px-2 py-0.5 text-xs font-medium text-attention">
                  Illustrative — pending trade-law advisor validation
                </span>
              )}
            </div>

            <blockquote className="mt-3 border-l-2 border-gold/40 pl-3 text-sm italic text-ink/85">
              “{originRule.ruleText}”
            </blockquote>
            <p className="mt-1 text-xs">
              <a
                href="https://www.gov.uk/government/publications/ukeu-and-eaec-trade-and-cooperation-agreement-ts-no82021"
                target="_blank"
                rel="noreferrer"
                className="text-road hover:underline"
              >
                {originRule.citedArticle}
              </a>
            </p>

            {originRule.plainEnglish && (
              <p className="mt-3 text-sm text-ink/80">{originRule.plainEnglish}</p>
            )}

            {nonOriginatingInputs.length > 0 && (
              <div className="mt-3 rounded-md bg-ground p-3 text-sm">
                <p className="font-medium text-ink/80">
                  Recorded non-originating inputs (from the supplier&rsquo;s declaration):
                </p>
                <ul className="mt-1 list-inside list-disc text-ink/70">
                  {nonOriginatingInputs.map((v, i) => (
                    <li key={i}>{v}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-ink/55">
                  Shown for context only. Whether the rule above is met is not assessed
                  here — origin qualification is out of scope for this record.
                </p>
              </div>
            )}

            <p className="mt-3 text-xs text-ink/45">Rules data: {originRule.rulesDataVersion}</p>
          </div>
        </>
      )}

      {hasExtraction && (
        <>
          <h2 className="mt-8 mb-3 text-lg font-medium">Extracted record</h2>
          <p className="mb-3 text-sm text-ink/60">
            Every value shows its source document and read confidence. “Missing” means
            the document does not state the field — nothing is ever defaulted.
          </p>
          <div className="overflow-x-auto rounded-md border border-ink/10 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-ink/60">
                  <th className="px-4 py-2 font-medium">Field</th>
                  {shipment.documents.map((d) => (
                    <th key={d.id} className="px-4 py-2 font-medium">
                      {TYPE_LABELS[d.type] ?? d.type}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fieldRows.map((name) => (
                  <tr key={name} className="border-b border-ink/5 last:border-0">
                    <td className="px-4 py-2 font-medium">{FIELD_LABELS[name] ?? name}</td>
                    {shipment.documents.map((d) => {
                      const field = d.extractedFields.find((f) => f.name === name);
                      if (!field || field.status === "missing") {
                        return (
                          <td key={d.id} className="px-4 py-2 text-ink/40">
                            {field ? "missing" : "—"}
                          </td>
                        );
                      }
                      const lowConfidence = (field.confidence ?? 0) < 0.7;
                      return (
                        <td key={d.id} className="px-4 py-2">
                          <span className={lowConfidence ? "text-attention" : ""}>
                            {field.value}
                            {field.unit ? ` ${field.unit}` : ""}
                          </span>{" "}
                          <span
                            className={`text-xs ${lowConfidence ? "text-attention" : "text-ink/40"}`}
                            title="Extraction confidence"
                          >
                            {Math.round((field.confidence ?? 0) * 100)}%
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 className="mt-8 mb-3 text-lg font-medium">Documents</h2>
      <div className="overflow-hidden rounded-md border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-ink/60">
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">File</th>
              <th className="px-4 py-2 font-medium">Source</th>
              <th className="px-4 py-2 font-medium">Received</th>
            </tr>
          </thead>
          <tbody>
            {shipment.documents.map((d) => (
              <tr key={d.id} className="border-b border-ink/5 last:border-0">
                <td className="px-4 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      d.type === "other"
                        ? "bg-attention/10 text-attention"
                        : "bg-road/10 text-road"
                    }`}
                  >
                    {TYPE_LABELS[d.type] ?? d.type}
                  </span>
                </td>
                <td className="px-4 py-2">{d.originalFilename ?? d.rawFileUrl}</td>
                <td className="px-4 py-2 text-ink/60">{d.source}</td>
                <td className="px-4 py-2 text-ink/60">
                  {d.uploadedAt.toISOString().slice(0, 16).replace("T", " ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 mb-3 text-lg font-medium">Audit trail</h2>
      <ul className="space-y-2">
        {shipment.auditEvents.map((e) => (
          <li key={e.id} className="rounded-md border border-ink/10 bg-white p-3 text-sm">
            <span className="text-ink/60">
              {e.at.toISOString().slice(0, 19).replace("T", " ")} · {e.actor}
            </span>{" "}
            <span className="font-medium">{e.action}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
