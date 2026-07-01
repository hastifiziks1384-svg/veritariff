import { NextResponse } from "next/server";
import { prisma } from "@veritariff/db";
import { runShipmentExtraction } from "@veritariff/extraction";
import { buildExtractionService, storageRoot } from "../../../../../lib/extraction";

/** Runs (or re-runs) field extraction for a shipment (§5.2). */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const shipment = await prisma.shipment.findUnique({ where: { id } });
  if (!shipment) {
    return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
  }

  try {
    const summary = await runShipmentExtraction(prisma, buildExtractionService(), id, {
      storageRoot: storageRoot(),
    });
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Extraction failed." },
      { status: 500 },
    );
  }
}
