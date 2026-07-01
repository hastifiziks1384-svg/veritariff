import type { DocumentSource, DocumentType } from "@veritariff/shared";

/** A document arriving through any channel, before it belongs to a Shipment. */
export interface IncomingDocument {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  source: DocumentSource;
  /** Set when the channel already knows the type (rare). */
  declaredType?: DocumentType;
}

/**
 * Inbox connector interface (§5.1). The email-forward channel and the
 * (deferred) Gmail OAuth connector both implement this. The OAuth connector
 * stays a stub until Phases 1–5 are complete, per the spec.
 */
export interface InboxConnector {
  /** Pull any new messages' attachments as incoming documents. */
  fetchNewDocuments(): Promise<IncomingDocument[]>;
}
