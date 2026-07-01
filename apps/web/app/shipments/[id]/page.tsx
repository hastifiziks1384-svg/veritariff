import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@veritariff/db";

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

export default async function ShipmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const shipment = await prisma.shipment.findUnique({
    where: { id },
    include: {
      documents: { orderBy: { uploadedAt: "asc" } },
      auditEvents: { orderBy: { at: "desc" } },
    },
  });
  if (!shipment) notFound();

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
