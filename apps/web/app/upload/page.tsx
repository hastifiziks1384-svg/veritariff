"use client";

import Link from "next/link";
import { useRef, useState } from "react";

interface IngestedShipment {
  shipmentId: string;
  reference: string | null;
  created: boolean;
  documentIds: string[];
}

export default function UploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestedShipment[] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (list) setFiles((prev) => [...prev, ...Array.from(list)]);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      for (const f of files) form.append("files", f);
      const res = await fetch("/api/shipments/ingest", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Upload failed (${res.status})`);
      setResult(body.shipments);
      setFiles([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">Upload shipment documents</h1>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-md border-2 border-dashed p-10 text-center transition-colors ${
          dragOver ? "border-road bg-road/5" : "border-ink/20 bg-white"
        }`}
      >
        <p className="text-ink/70">
          Drag documents here, or <span className="text-road underline">browse</span>
        </p>
        <p className="mt-1 text-sm text-ink/50">
          Invoices, packing lists, bills of lading, CMRs, mill certificates,
          supplier&rsquo;s declarations — multiple files at once. They are grouped into
          shipments by shared reference.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div className="mt-4 rounded-md border border-ink/10 bg-white p-4">
          <ul className="space-y-1 text-sm">
            {files.map((f, i) => (
              <li key={i} className="flex justify-between">
                <span>{f.name}</span>
                <button
                  className="text-blocked hover:underline"
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={submit}
            disabled={busy}
            className="mt-4 rounded-md bg-road px-4 py-2 text-white disabled:opacity-50"
          >
            {busy ? "Ingesting…" : `Ingest ${files.length} document${files.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-md border border-blocked/30 bg-blocked/5 p-3 text-blocked">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-4 rounded-md border border-cleared/30 bg-cleared/5 p-4">
          {result.map((s) => (
            <p key={s.shipmentId}>
              {s.documentIds.length} document{s.documentIds.length === 1 ? "" : "s"}{" "}
              {s.created ? "created new shipment" : "attached to existing shipment"}{" "}
              <Link href={`/shipments/${s.shipmentId}`} className="text-road underline">
                {s.reference ?? s.shipmentId}
              </Link>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
