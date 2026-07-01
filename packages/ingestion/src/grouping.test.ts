import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { groupByReference } from "./grouping";
import { extractReferenceCandidates } from "./references";

const docsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../data/fixtures/steel-7318/documents",
);
const read = (f: string) => readFileSync(path.join(docsDir, f), "utf8");

describe("extractReferenceCandidates", () => {
  it("finds the shared export reference on every fixture document", () => {
    for (const f of [
      "commercial_invoice.txt",
      "packing_list.txt",
      "suppliers_declaration.txt",
    ]) {
      expect(extractReferenceCandidates(read(f)), f).toContain("MS-EXP-2026-0117");
    }
  });

  it("ignores label-less codes and tokens without digits", () => {
    expect(extractReferenceCandidates("random text ABC-DEF-GHI and DAP Sheffield")).toEqual(
      [],
    );
  });
});

describe("groupByReference (§5.1 AC: mixed set → correctly grouped)", () => {
  it("groups the three fixture documents into one shipment group", () => {
    const docs = [
      "commercial_invoice.txt",
      "packing_list.txt",
      "suppliers_declaration.txt",
    ].map((f) => ({ file: f, references: extractReferenceCandidates(read(f)) }));

    const groups = groupByReference(docs);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.docs).toHaveLength(3);
    expect(groups[0]?.reference).toBe("MS-EXP-2026-0117");
  });

  it("separates documents with a different reference into their own group", () => {
    const groups = groupByReference([
      { references: ["MS-EXP-2026-0117"] },
      { references: ["MS-EXP-2026-0117", "MS-INV-2026-0117"] },
      { references: ["OTHER-2026-0555"] },
    ]);
    expect(groups).toHaveLength(2);
  });

  it("keeps reference-less documents together as a batch fallback group", () => {
    const groups = groupByReference([{ references: [] }, { references: [] }]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.reference).toBeNull();
  });
});
