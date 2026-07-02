import { NextResponse } from "next/server";
import { prisma } from "@veritariff/db";
import { buildEvidenceBundle, renderBundlePdf } from "@veritariff/export";

/**
 * Exports the evidence bundle (§5.6): ?format=json (default) or ?format=pdf.
 * Each export snapshots the record into an EvidenceBundle row.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const shipment = await prisma.shipment.findUnique({ where: { id } });
  if (!shipment) {
    return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
  }

  const format = new URL(req.url).searchParams.get("format") ?? "json";
  const bundle = await buildEvidenceBundle(prisma, id);
  const filename = `veritariff-evidence-${shipment.reference ?? id}`;

  if (format === "pdf") {
    const pdf = await renderBundlePdf(bundle);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      },
    });
  }

  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}.json"`,
    },
  });
}
