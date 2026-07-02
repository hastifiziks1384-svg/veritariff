import Link from "next/link";
import { prisma } from "@veritariff/db";

export const dynamic = "force-dynamic";

export default async function ShipmentsPage() {
  const shipments = await prisma.shipment.findMany({
    include: {
      documents: true,
      flags: { where: { resolution: "open" } },
      classifications: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Shipments</h1>
        <Link
          href="/upload"
          className="rounded-md bg-road px-4 py-2 text-sm text-white hover:opacity-90"
        >
          Upload documents
        </Link>
      </div>

      {shipments.length === 0 ? (
        <p className="rounded-md border border-ink/10 bg-white p-6 text-ink/70">
          No shipments yet. Seed the steel fixture with{" "}
          <code className="rounded bg-ground px-1.5 py-0.5 text-sm">npm run db:seed</code>.
        </p>
      ) : (
        <ul className="space-y-3">
          {shipments.map((s) => (
            <li key={s.id}>
              <Link
                href={`/shipments/${s.id}`}
                className="block rounded-md border border-ink/10 bg-white p-5 transition-colors hover:border-road/40"
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-medium">{s.reference ?? "(no reference)"}</span>
                  {s.flags.length > 0 && (
                    <span className="rounded bg-attention/10 px-2 py-0.5 text-xs text-attention">
                      {s.flags.length} open flag{s.flags.length === 1 ? "" : "s"}
                    </span>
                  )}
                  {s.classifications[0] && (
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        s.classifications[0].status === "verified"
                          ? "bg-cleared/10 text-cleared"
                          : "bg-road/10 text-road"
                      }`}
                    >
                      HS {s.classifications[0].status.replaceAll("_", " ")}
                    </span>
                  )}
                  <span className="ml-auto text-sm text-ink/60">{s.lane}</span>
                </div>
                {(s.shipperName || s.consigneeName) && (
                  <div className="mt-1 text-sm text-ink/70">
                    {s.shipperName ?? "—"} → {s.consigneeName ?? "—"}
                  </div>
                )}
                <div className="mt-2 text-sm text-ink/60">
                  {s.documents.length} document{s.documents.length === 1 ? "" : "s"}:{" "}
                  {s.documents.map((d) => d.type).join(", ")}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
