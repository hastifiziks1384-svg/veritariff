import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CANONICAL_FIELDS, DOCUMENT_TYPES } from "@veritariff/shared";
import type {
  ExtractionInput,
  ExtractionResult,
  ExtractionService,
} from "./types";

/**
 * The hosted-LLM implementation of ExtractionService — the only place in
 * Veritariff where an LLM runs (spec §7). It reads a document and returns
 * fields against a strict schema with per-field confidence, and it is
 * REQUIRED to return status "missing" (value null) rather than guess.
 * It makes no legal determinations; those live in @veritariff/engine.
 */

const ExtractedFieldSchema = z.object({
  name: z.string(),
  value: z.string().nullable(),
  unit: z.string().nullable(),
  confidence: z.number(),
  status: z.enum(["extracted", "low_confidence", "missing"]),
});

const ExtractionOutputSchema = z.object({
  detectedType: z.enum([...DOCUMENT_TYPES, "unknown"] as const),
  fields: z.array(ExtractedFieldSchema),
});

const SYSTEM_PROMPT = `You extract compliance fields from international trade documents (commercial invoices, packing lists, bills of lading, CMRs, mill certificates, supplier's declarations).

Rules — these are absolute:
- You ONLY read and transcribe what the document states. You never classify goods, never judge compliance, never decide whether values are correct — that is done elsewhere by deterministic logic.
- For every canonical field listed below, return one entry. If the document does not state a field, return it with value null, confidence 0, and status "missing". NEVER infer, compute, or guess a value that is not stated.
- confidence is 0–1: how certain you are the transcribed value is what the document states. Use status "low_confidence" below 0.7.
- Normalise units: weights in kg (unit "kg"), quantities with their stated unit (e.g. "pcs"). Keep monetary values as plain numbers in "value" with the currency code in "unit". Country fields use ISO 3166-1 alpha-2 codes when the country is unambiguous, otherwise transcribe the stated text.
- "reference" is the shipment-level reference (export ref / shipment ref), not a document's own number.
- For mill certificates, also fill "composition" (chemical composition summary) and "melt_and_pour_country".
- For supplier's declarations, fill "non_originating_materials" with what is declared non-originating (material, HS heading, origin).

Canonical fields: ${CANONICAL_FIELDS.join(", ")}.`;

export interface AnthropicExtractionOptions {
  apiKey?: string;
  model?: string;
}

export class AnthropicExtractionService implements ExtractionService {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: AnthropicExtractionOptions = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "AnthropicExtractionService requires ANTHROPIC_API_KEY. Without a key, use FixtureExtractionService.",
      );
    }
    this.client = new Anthropic({ apiKey });
    this.model = options.model ?? "claude-opus-4-8";
  }

  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    const content: Anthropic.ContentBlockParam[] = [];

    if (input.mimeType === "application/pdf") {
      content.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: Buffer.from(input.bytes).toString("base64"),
        },
      });
      content.push({
        type: "text",
        text: `Extract the canonical fields from this document (filename: ${input.filename}).`,
      });
    } else {
      const text = Buffer.from(input.bytes).toString("utf8");
      content.push({
        type: "text",
        text: `Extract the canonical fields from this document (filename: ${input.filename}).\n\n---\n${text}\n---`,
      });
    }

    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
      output_config: {
        format: zodOutputFormat(ExtractionOutputSchema, "document_extraction"),
      },
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      throw new Error(
        `Extraction returned no parseable output for ${input.filename} (stop_reason: ${response.stop_reason}).`,
      );
    }

    return {
      documentId: input.documentId,
      detectedType: parsed.detectedType,
      fields: parsed.fields.map((f) => ({
        name: f.name,
        value: f.value,
        unit: f.unit ?? undefined,
        confidence: f.confidence,
        status: f.status,
      })),
    };
  }
}
