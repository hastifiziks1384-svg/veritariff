import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RecordedTariffClient } from "./recorded";

const fixtureDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../data/fixtures/tariff",
);

const client = new RecordedTariffClient(fixtureDir);

describe("UK Trade Tariff parsing (recorded real responses)", () => {
  it("parses heading 7318 with its HS-6 subheadings", async () => {
    const ref = await client.getHeadingReference("7318");
    expect(ref.heading.code).toBe("7318");
    expect(ref.heading.description).toContain("Screws, bolts, nuts");
    const codes = ref.subheadings.map((s) => s.code);
    expect(codes).toContain("731815");
    expect(codes).toContain("731816");
  });

  it("carries the chapter and section notes for citation", async () => {
    const ref = await client.getHeadingReference("7318");
    expect(ref.chapter.code).toBe("73");
    expect(ref.chapter.note.length).toBeGreaterThan(100);
    expect(ref.section.numeral).toBe("XV");
    expect(ref.section.note.toLowerCase()).toContain("parts of general use");
  });

  it("parses heading 7213 (wire rod) for the composition-gating flow", async () => {
    const ref = await client.getHeadingReference("7213");
    expect(ref.heading.description).toContain("irregularly wound coils");
    expect(ref.subheadings.map((s) => s.code)).toContain("721391");
    expect(ref.chapter.note).toContain("Non-alloy steel");
  });
});
