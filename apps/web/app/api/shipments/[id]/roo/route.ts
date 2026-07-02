import { NextResponse } from "next/server";
import { prisma } from "@veritariff/db";
import { loadOriginRuleTable, runShipmentRoo } from "@veritariff/extraction";
import { storageRoot } from "../../../../../lib/extraction";

/** Surfaces the applicable TCA origin rule for the shipment (§5.5, L1–2). */
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
    const table = loadOriginRuleTable(storageRoot());
    const result = await runShipmentRoo(prisma, id, table);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Origin-rule lookup failed." },
      { status: 500 },
    );
  }
}
