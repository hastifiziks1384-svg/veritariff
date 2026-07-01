import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { detectDocumentType } from "./typing";

const docsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../data/fixtures/steel-7318/documents",
);
const read = (f: string) => readFileSync(path.join(docsDir, f), "utf8");

describe("detectDocumentType (§5.1 AC: documents are typed)", () => {
  it("types the fixture documents from content", () => {
    expect(detectDocumentType(read("commercial_invoice.txt"), "a.txt")).toBe(
      "commercial_invoice",
    );
    expect(detectDocumentType(read("packing_list.txt"), "b.txt")).toBe("packing_list");
    expect(detectDocumentType(read("suppliers_declaration.txt"), "c.txt")).toBe(
      "suppliers_declaration",
    );
  });

  it("falls back to filename keywords for non-text formats", () => {
    expect(detectDocumentType("", "MS-INV-2026-0117_invoice.pdf")).toBe("commercial_invoice");
    expect(detectDocumentType("", "cmr_scan.pdf")).toBe("cmr");
  });

  it("honestly types unrecognisable documents as other — never guesses", () => {
    expect(detectDocumentType("quarterly newsletter about steel prices", "notes.txt")).toBe(
      "other",
    );
  });
});
