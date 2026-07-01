import type { DocumentType, FieldStatus } from "@veritariff/shared";

/**
 * The ONLY place an LLM is permitted in Veritariff: reading a document and
 * extracting fields to this strict schema. Implementations must return
 * per-field confidence and are explicitly allowed (required) to return
 * "missing" rather than invent a value. Implementations never make legal
 * determinations — those belong to @veritariff/engine, which cannot import
 * this package (enforced in CI).
 */
export interface ExtractionService {
  extract(input: ExtractionInput): Promise<ExtractionResult>;
}

export interface ExtractionInput {
  documentId: string;
  filename: string;
  /** Best-known document type, if the ingestion layer already typed it. */
  documentType?: DocumentType;
  mimeType: string;
  bytes: Uint8Array;
}

export interface ExtractionResult {
  documentId: string;
  /** Document type as read from the document itself. */
  detectedType: DocumentType | "unknown";
  fields: ExtractedFieldResult[];
}

export interface ExtractedFieldResult {
  /** A CanonicalField name, or a document-specific extra. */
  name: string;
  /** null when the field is not present in the document. */
  value: string | null;
  unit?: string;
  /** 0–1. Low values must surface as low_confidence, never silently accepted. */
  confidence: number;
  status: FieldStatus;
}
