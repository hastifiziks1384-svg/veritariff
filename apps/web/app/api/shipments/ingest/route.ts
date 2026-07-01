import { NextResponse } from "next/server";
import { prisma } from "@veritariff/db";
import { ingestBatch, type IncomingDocument } from "@veritariff/ingestion";
import { storageDir } from "../../../../lib/storage";

/** Manual upload channel (§5.1): multipart form with one or more `files`. */
export async function POST(req: Request) {
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return NextResponse.json(
      { error: "No files provided. Send multipart form data with a `files` field." },
      { status: 400 },
    );
  }

  const incoming: IncomingDocument[] = await Promise.all(
    files.map(async (file) => ({
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      bytes: new Uint8Array(await file.arrayBuffer()),
      source: "upload" as const,
    })),
  );

  const result = await ingestBatch(prisma, incoming, { storageDir: storageDir() });
  return NextResponse.json(result, { status: 201 });
}
