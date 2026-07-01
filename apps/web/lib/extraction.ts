import path from "node:path";
import {
  AnthropicExtractionService,
  FixtureExtractionService,
  type ExtractionService,
} from "@veritariff/extraction";

/** Repo root: rawFileUrl paths ("storage/…") are relative to it. */
export function storageRoot(): string {
  return process.env.VERITARIFF_ROOT ?? path.resolve(process.cwd(), "../..");
}

/**
 * Live LLM extraction when ANTHROPIC_API_KEY is configured; otherwise the
 * deterministic fixture extractor (demo/tests run end-to-end without a key).
 */
export function buildExtractionService(): ExtractionService {
  if (process.env.ANTHROPIC_API_KEY) {
    return new AnthropicExtractionService();
  }
  return new FixtureExtractionService(path.join(storageRoot(), "data/fixtures/steel-7318"));
}
