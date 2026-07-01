import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FixtureExtractionService } from "./fixture.js";

const fixtureDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../data/fixtures/steel-7318",
);

const service = new FixtureExtractionService(fixtureDir);

describe("FixtureExtractionService (steel-7318 fixture)", () => {
  it("extracts invoice fields with per-field confidence", async () => {
    const result = await service.extract({
      documentId: "doc-1",
      filename: "commercial_invoice.txt",
      mimeType: "text/plain",
      bytes: new Uint8Array(),
    });
    expect(result.detectedType).toBe("commercial_invoice");
    const gross = result.fields.find((f) => f.name === "gross_weight_kg");
    expect(gross?.value).toBe("120");
    expect(gross?.confidence).toBeGreaterThan(0.5);
    expect(result.fields.every((f) => typeof f.confidence === "number")).toBe(true);
  });

  it("reports the deliberately missing field as missing, never invented", async () => {
    const result = await service.extract({
      documentId: "doc-2",
      filename: "packing_list.txt",
      mimeType: "text/plain",
      bytes: new Uint8Array(),
    });
    const origin = result.fields.find((f) => f.name === "stated_origin");
    expect(origin?.status).toBe("missing");
    expect(origin?.value).toBeNull();
  });

  it("returns an empty honest result for an unknown document", async () => {
    const result = await service.extract({
      documentId: "doc-x",
      filename: "mystery.pdf",
      mimeType: "application/pdf",
      bytes: new Uint8Array(),
    });
    expect(result.detectedType).toBe("unknown");
    expect(result.fields).toHaveLength(0);
  });
});
