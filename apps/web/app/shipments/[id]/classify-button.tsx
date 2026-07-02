"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ClassifyButton({ shipmentId }: { shipmentId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/shipments/${shipmentId}/classify`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Classification failed (${res.status})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Classification failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-3">
      <button
        onClick={run}
        disabled={busy}
        className="rounded-md border border-road px-3 py-1.5 text-sm text-road hover:bg-road/5 disabled:opacity-50"
      >
        {busy ? "Verifying…" : "Verify classification"}
      </button>
      {error && <span className="text-sm text-blocked">{error}</span>}
    </span>
  );
}
