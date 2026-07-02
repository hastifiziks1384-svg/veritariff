"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RooButton({ shipmentId }: { shipmentId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/shipments/${shipmentId}/roo`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Lookup failed (${res.status})`);
      if (body.outcome !== "surfaced") setMessage(body.detail);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-3">
      <button
        onClick={run}
        disabled={busy}
        className="rounded-md border border-gold px-3 py-1.5 text-sm text-gold hover:bg-gold/5 disabled:opacity-50"
      >
        {busy ? "Looking up…" : "Origin rule"}
      </button>
      {message && <span className="text-sm text-attention">{message}</span>}
    </span>
  );
}
