import { NextResponse } from "next/server";
import { prisma } from "@veritariff/db";
import { ingestBatch, parseEmlAttachments } from "@veritariff/ingestion";
import { storageDir } from "../../../lib/storage";

/**
 * Email-forward channel (§5.1): accepts a raw RFC 822 message
 * (Content-Type: message/rfc822, e.g. from an inbound-email provider
 * webhook) and ingests its attachments. Auto-creates a Shipment, or attaches
 * to an existing one when the documents carry a known reference.
 */
export async function POST(req: Request) {
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length === 0) {
    return NextResponse.json({ error: "Empty request body." }, { status: 400 });
  }

  const email = await parseEmlAttachments(bytes);
  if (email.documents.length === 0) {
    // Flag, don't guess: an email without attachments is surfaced, not invented around.
    return NextResponse.json(
      { error: "Email contains no attachments to ingest.", subject: email.subject ?? null },
      { status: 422 },
    );
  }

  const result = await ingestBatch(prisma, email.documents, { storageDir: storageDir() });
  return NextResponse.json({ subject: email.subject ?? null, ...result }, { status: 201 });
}
