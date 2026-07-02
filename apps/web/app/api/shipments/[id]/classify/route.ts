import { NextResponse } from "next/server";
import { prisma } from "@veritariff/db";
import { runShipmentClassification } from "@veritariff/extraction";
import { buildTariffClient } from "../../../../../lib/tariff";

/** Runs (or re-runs) HS classification verification for a shipment (§5.4). */
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
    const outcome = await runShipmentClassification(prisma, buildTariffClient(), id);
    return NextResponse.json(outcome);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Classification failed." },
      { status: 500 },
    );
  }
}
