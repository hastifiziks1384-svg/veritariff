import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { Citation } from "@veritariff/shared";
import type { EvidenceBundleContents } from "./bundle";

/** Printable A4 rendering of the evidence bundle. */

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 50;
const INK = rgb(0.094, 0.149, 0.204); // #182634
const ROAD = rgb(0, 0.659, 0.549); // #00A88C
const MUTED = rgb(0.45, 0.48, 0.52);
const ATTENTION = rgb(0.753, 0.471, 0.047);
const BLOCKED = rgb(0.725, 0.227, 0.18);

/** Helvetica is WinAnsi-encoded; swap characters it cannot encode. */
function sanitize(text: string): string {
  return text
    .replaceAll("→", "->")
    .replaceAll("↔", "<->")
    .replaceAll("✓", "OK")
    .replaceAll("…", "...")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\xFF–—‘’“”±]/g, "?");
}

class PdfWriter {
  page!: PDFPage;
  y = 0;
  constructor(
    private readonly doc: PDFDocument,
    private readonly font: PDFFont,
    private readonly bold: PDFFont,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage(A4);
    this.y = A4[1] - MARGIN;
  }

  ensure(height: number) {
    if (this.y - height < MARGIN) this.newPage();
  }

  wrap(text: string, size: number, font: PDFFont, width: number): string[] {
    const words = sanitize(text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > width && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines.length > 0 ? lines : [""];
  }

  text(
    content: string,
    options: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number; gapAfter?: number } = {},
  ) {
    const size = options.size ?? 9.5;
    const font = options.bold ? this.bold : this.font;
    const indent = options.indent ?? 0;
    const width = A4[0] - 2 * MARGIN - indent;
    const lineHeight = size * 1.35;
    for (const line of this.wrap(content, size, font, width)) {
      this.ensure(lineHeight);
      this.page.drawText(line, {
        x: MARGIN + indent,
        y: this.y - size,
        size,
        font,
        color: options.color ?? INK,
      });
      this.y -= lineHeight;
    }
    this.y -= options.gapAfter ?? 2;
  }

  heading(content: string) {
    this.ensure(30);
    this.y -= 10;
    this.text(content, { size: 12.5, bold: true, color: ROAD, gapAfter: 4 });
  }

  rule() {
    this.ensure(8);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: A4[0] - MARGIN, y: this.y },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.83),
    });
    this.y -= 8;
  }
}

function citationLine(c: Citation): string {
  return `[${c.reference}]${c.quote ? ` — “${c.quote}”` : ""}${c.url ? ` <${c.url}>` : ""}`;
}

export async function renderBundlePdf(bundle: EvidenceBundleContents): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new PdfWriter(doc, font, bold);

  // Title
  w.text("Veritariff — Evidence bundle", { size: 18, bold: true, gapAfter: 2 });
  w.text(
    `Shipment ${bundle.shipment.reference ?? bundle.shipment.id} · generated ${bundle.generatedAt} · format ${bundle.bundleFormatVersion}`,
    { size: 9, color: MUTED, gapAfter: 6 },
  );
  w.rule();

  // Shipment
  w.heading("Shipment record");
  w.text(`Reference: ${bundle.shipment.reference ?? "—"}`);
  w.text(`Shipper: ${bundle.shipment.shipper ?? "—"}`);
  w.text(`Consignee: ${bundle.shipment.consignee ?? "—"}`);
  w.text(
    `Corridor: ${bundle.shipment.lane ?? "—"} (${bundle.shipment.originCountry ?? "?"} -> ${bundle.shipment.destinationCountry ?? "?"})`,
  );
  w.text(`Record created: ${bundle.shipment.createdAt}`);

  // Documents + extracted record
  w.heading("Documents and extracted record");
  for (const d of bundle.documents) {
    w.text(`${d.type} — ${d.filename ?? d.id} (via ${d.source}, received ${d.uploadedAt})`, {
      bold: true,
      gapAfter: 1,
    });
    for (const f of d.extractedFields) {
      const value =
        f.status === "missing"
          ? "MISSING (not stated by this document)"
          : `${f.value}${f.unit ? ` ${f.unit}` : ""} (confidence ${Math.round((f.confidence ?? 0) * 100)}%)`;
      w.text(`${f.name}: ${value}`, { indent: 14, size: 8.5, color: f.status === "missing" ? MUTED : INK });
    }
    w.y -= 4;
  }

  // Flags
  w.heading(`Flags (${bundle.flags.length})`);
  if (bundle.flags.length === 0) w.text("No flags were raised for this record.");
  for (const f of bundle.flags) {
    const color = f.severity === "block" ? BLOCKED : f.severity === "warn" ? ATTENTION : MUTED;
    w.text(`${f.severity.toUpperCase()} · ${f.field} · via ${f.source} · raised ${f.createdAt}`, {
      bold: true,
      color,
      gapAfter: 1,
    });
    w.text(f.explanation, { indent: 14, size: 9 });
    for (const cv of f.conflictingValues) {
      if (cv.value) {
        w.text(
          `- ${cv.value}${cv.unit ? ` ${cv.unit}` : ""} (source document: ${cv.documentType ?? cv.sourceDocumentId})`,
          { indent: 14, size: 8.5, color: MUTED },
        );
      }
    }
    if (f.recommendedValue) {
      w.text(
        `Recommendation (${f.recommendationStatus}): ${f.recommendedValue}${f.recommendedValueUnit ? ` ${f.recommendedValueUnit}` : ""} — ${f.recommendationBasis ?? ""}`,
        { indent: 14, size: 8.5 },
      );
    }
    w.text(
      `Resolution: ${f.resolution}${f.resolvedBy ? ` by ${f.resolvedBy}` : ""}${f.resolvedAt ? ` at ${f.resolvedAt}` : ""}${f.resolvedNote ? ` — ${f.resolvedNote}` : ""}`,
      { indent: 14, size: 8.5, color: MUTED, gapAfter: 5 },
    );
  }

  // Classification
  w.heading("HS classification verification");
  if (!bundle.classification) {
    w.text("Classification has not been run for this shipment.");
  } else {
    const c = bundle.classification;
    w.text(
      `Status: ${c.status.replaceAll("_", " ")} · HS ${c.hsCode ? `${c.hsCode.slice(0, 4)}.${c.hsCode.slice(4)}` : "—"} · declared ${c.declaredHsCode ?? "—"} · confidence ${Math.round(c.confidence * 100)}% · ${c.createdAt}`,
      { bold: true, gapAfter: 3 },
    );
    for (const [i, step] of (c.reasoningChain as { text: string; citation?: Citation }[]).entries()) {
      w.text(`${i + 1}. ${step.text}`, { indent: 8, size: 9 });
      if (step.citation) {
        w.text(citationLine(step.citation), { indent: 22, size: 8, color: MUTED });
      }
    }
    w.text(`Rules data: ${c.rulesDataVersion ?? "—"}`, { indent: 8, size: 8, color: MUTED });
  }

  // Origin rule
  w.heading("Rule of origin (verification/explanation only)");
  if (!bundle.originRule) {
    w.text("No origin rule has been surfaced for this shipment.");
  } else {
    const r = bundle.originRule;
    w.text(
      `${r.agreement} · heading ${r.hsHeading.slice(0, 2)}.${r.hsHeading.slice(2)} · rule type ${r.ruleType}${r.isIllustrative ? " · ILLUSTRATIVE — pending trade-law advisor validation" : ""}`,
      { bold: true, color: r.isIllustrative ? ATTENTION : INK, gapAfter: 3 },
    );
    w.text(`Rule: “${r.ruleText}”`, { indent: 8 });
    w.text(`Cited: ${r.citedArticle}`, { indent: 8, size: 8.5, color: MUTED });
    if (r.plainEnglish) w.text(r.plainEnglish, { indent: 8, size: 9 });
    w.text(`Rules data: ${r.rulesDataVersion}`, { indent: 8, size: 8, color: MUTED });
  }

  // Audit trail
  w.heading(`Audit trail (${bundle.auditTrail.length} events)`);
  for (const e of bundle.auditTrail) {
    w.text(`${e.at} · ${e.actor} · ${e.action}`, { size: 8.5, color: MUTED });
  }

  // Disclaimers
  w.heading("Notices");
  for (const d of bundle.disclaimers) {
    w.text(`• ${d}`, { size: 8.5, color: MUTED });
  }

  return doc.save();
}
