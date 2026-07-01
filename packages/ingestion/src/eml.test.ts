import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseEmlAttachments } from "./eml";

const emlPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../data/fixtures/steel-7318/email/forwarded.eml",
);

describe("parseEmlAttachments (§5.1 email-forward channel)", () => {
  it("extracts the three fixture documents from the forwarded email", async () => {
    const parsed = await parseEmlAttachments(new Uint8Array(readFileSync(emlPath)));
    expect(parsed.subject).toContain("MS-EXP-2026-0117");
    expect(parsed.documents).toHaveLength(3);
    expect(parsed.documents.map((d) => d.filename).sort()).toEqual([
      "commercial_invoice.txt",
      "packing_list.txt",
      "suppliers_declaration.txt",
    ]);
    expect(parsed.documents.every((d) => d.source === "email")).toBe(true);

    const invoice = parsed.documents.find((d) => d.filename === "commercial_invoice.txt");
    expect(Buffer.from(invoice!.bytes).toString("utf8")).toContain("Gross Weight: 120 kg");
  });
});
