import { readFileSync } from "node:fs";
import path from "node:path";
import type { DocumentType } from "@veritariff/shared";
import type {
  ExtractedFieldResult,
  ExtractionInput,
  ExtractionResult,
  ExtractionService,
} from "./types";

interface FixtureFieldEntry {
  value: string | null;
  unit?: string;
  confidence: number;
  status: "extracted" | "low_confidence" | "missing";
}

interface FixtureFile {
  documents: Record<
    string,
    { type: DocumentType; fields: Record<string, FixtureFieldEntry> }
  >;
}

/**
 * Deterministic ExtractionService backed by a fixture's ground-truth file
 * (expected-extraction.json). Used for tests and for running the demo
 * without an LLM API key. Matches documents by filename; unknown documents
 * yield an empty, honest result — never invented fields.
 */
export class FixtureExtractionService implements ExtractionService {
  private readonly fixture: FixtureFile;

  constructor(fixtureDir: string) {
    this.fixture = JSON.parse(
      readFileSync(path.join(fixtureDir, "expected-extraction.json"), "utf8"),
    ) as FixtureFile;
  }

  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    const entry = this.fixture.documents[path.basename(input.filename)];
    if (!entry) {
      return { documentId: input.documentId, detectedType: "unknown", fields: [] };
    }
    const fields: ExtractedFieldResult[] = Object.entries(entry.fields).map(
      ([name, f]) => ({
        name,
        value: f.value,
        unit: f.unit,
        confidence: f.confidence,
        status: f.status,
      }),
    );
    return { documentId: input.documentId, detectedType: entry.type, fields };
  }
}
