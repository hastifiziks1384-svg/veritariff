"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ExtractButton({ shipmentId }: { shipmentId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/shipments/${shipmentId}/extract`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Extraction failed (${res.status})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-3">
      <button
        onClick={run}
        disabled={busy}
        className="rounded-md bg-road px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Extracting…" : "Run extraction"}
      </button>
      {error && <span className="text-sm text-blocked">{error}</span>}
    </span>
  );
}
