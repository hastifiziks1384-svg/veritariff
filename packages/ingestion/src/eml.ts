import { simpleParser } from "mailparser";
import type { IncomingDocument } from "./types";

export interface ParsedEmail {
  subject?: string;
  date?: Date;
  documents: IncomingDocument[];
}

/** Parses a raw RFC 822 email and returns its attachments as incoming documents. */
export async function parseEmlAttachments(bytes: Uint8Array): Promise<ParsedEmail> {
  const mail = await simpleParser(Buffer.from(bytes));
  return {
    subject: mail.subject ?? undefined,
    date: mail.date ?? undefined,
    documents: mail.attachments.map((a) => ({
      filename: a.filename ?? "attachment",
      mimeType: a.contentType || "application/octet-stream",
      bytes: new Uint8Array(a.content),
      source: "email" as const,
    })),
  };
}
