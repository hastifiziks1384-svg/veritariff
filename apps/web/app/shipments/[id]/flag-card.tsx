"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface FlagView {
  id: string;
  field: string;
  fieldLabel: string;
  severity: string;
  source: string;
  explanation: string;
  conflictingValues: { value: string; unit?: string; documentLabel: string }[];
  recommendedValue: string | null;
  recommendedValueUnit: string | null;
  recommendationBasis: string | null;
  recommendationStatus: string;
  resolution: string;
  resolvedBy: string | null;
  resolvedNote: string | null;
}

const SEVERITY_STYLES: Record<string, string> = {
  info: "bg-road/10 text-road",
  warn: "bg-attention/10 text-attention",
  block: "bg-blocked/10 text-blocked",
};

export function FlagCard({ flag }: { flag: FlagView }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [showResolve, setShowResolve] = useState(false);
  const router = useRouter();

  const act = async (action: string, actionNote?: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/flags/${flag.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: actionNote || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Action failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const open = flag.resolution === "open";

  return (
    <li className="rounded-md border border-ink/10 bg-white p-4">
      <div className="flex items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[flag.severity] ?? ""}`}
        >
          {flag.severity}
        </span>
        <span className="font-medium">{flag.fieldLabel}</span>
        <span className="text-xs text-ink/50">via {flag.source}</span>
        {!open && (
          <span className="ml-auto rounded bg-cleared/10 px-2 py-0.5 text-xs text-cleared">
            {flag.resolution}
            {flag.resolvedBy ? ` · ${flag.resolvedBy}` : ""}
          </span>
        )}
      </div>

      <p className="mt-2 text-sm text-ink/80">{flag.explanation}</p>

      {flag.conflictingValues.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {flag.conflictingValues.map((cv, i) => (
            <span
              key={i}
              className="rounded border border-ink/10 bg-ground px-2 py-1 text-sm"
            >
              <span className="font-medium">
                {cv.value}
                {cv.unit ? ` ${cv.unit}` : ""}
              </span>{" "}
              <span className="text-ink/50">— {cv.documentLabel}</span>
            </span>
          ))}
        </div>
      )}

      {flag.recommendationStatus === "proposed" && open && (
        <div className="mt-3 rounded-md border border-road/30 bg-road/5 p-3">
          <p className="text-sm">
            <span className="font-medium">
              Recommended: {flag.recommendedValue}
              {flag.recommendedValueUnit ? ` ${flag.recommendedValueUnit}` : ""}
            </span>
            {flag.recommendationBasis && (
              <span className="text-ink/70"> — {flag.recommendationBasis}</span>
            )}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => act("accept_recommendation")}
              disabled={busy}
              className="rounded-md bg-cleared px-3 py-1 text-sm text-white hover:opacity-90 disabled:opacity-50"
            >
              ✓ Accept
            </button>
            <button
              onClick={() => act("reject_recommendation")}
              disabled={busy}
              className="rounded-md border border-ink/20 px-3 py-1 text-sm text-ink/70 hover:border-blocked hover:text-blocked disabled:opacity-50"
            >
              ✗ Reject
            </button>
          </div>
        </div>
      )}

      {flag.recommendationStatus === "rejected" && open && (
        <p className="mt-2 text-xs text-ink/50">
          Recommendation rejected — resolve manually below.
        </p>
      )}

      {open && (
        <div className="mt-3 text-sm">
          {!showResolve ? (
            <div className="flex gap-3">
              <button
                onClick={() => setShowResolve(true)}
                className="text-road hover:underline"
              >
                Resolve…
              </button>
              <button
                onClick={() => act("ignore", note)}
                disabled={busy}
                className="text-ink/50 hover:underline"
              >
                Ignore
              </button>
              <button
                onClick={() => act("escalate", note)}
                disabled={busy}
                className="text-attention hover:underline"
              >
                Escalate
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Resolution note (what was decided and why)"
                className="w-full rounded-md border border-ink/20 px-2 py-1 text-sm"
              />
              <button
                onClick={() => act("resolve", note)}
                disabled={busy || note.trim() === ""}
                className="rounded-md bg-road px-3 py-1 text-sm text-white disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => setShowResolve(false)}
                className="text-sm text-ink/50 hover:underline"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {flag.resolvedNote && (
        <p className="mt-2 text-xs text-ink/60">Note: {flag.resolvedNote}</p>
      )}

      {error && <p className="mt-2 text-sm text-blocked">{error}</p>}
    </li>
  );
}
