import { describe, expect, it } from "vitest";
import { classify, type HeadingReferenceData } from "./classify";

const REF_7318: HeadingReferenceData = {
  heading: {
    code: "7318",
    description:
      "Screws, bolts, nuts, coach screws, screw hooks, rivets, cotters, cotter pins, washers (including spring washers) and similar articles, of iron or steel",
    url: "https://www.trade-tariff.service.gov.uk/headings/7318",
  },
  subheadings: [
    { code: "731811", description: "Coach screws", url: "u" },
    { code: "731815", description: "Other screws and bolts, whether or not with their nuts or washers", url: "u" },
    { code: "731816", description: "Nuts", url: "u" },
    { code: "731822", description: "Other washers", url: "u" },
  ],
  chapter: {
    code: "73",
    description: "Articles of iron or steel",
    note: "1. In this chapter, the expression 'cast iron' applies to products obtained by casting...",
    url: "https://www.trade-tariff.service.gov.uk/chapters/73",
  },
  section: {
    numeral: "XV",
    title: "Base metals and articles of base metal",
    note: "2. Throughout the classification, the expression 'parts of general use' means: a. articles of heading 7307, 7312, 7315, 7317 or 7318...",
    url: "https://www.trade-tariff.service.gov.uk/sections/15",
  },
  source: "recorded",
  retrievedAt: "2026-07-02T00:00:00Z",
};

const REF_7213: HeadingReferenceData = {
  ...REF_7318,
  heading: {
    code: "7213",
    description:
      "Bars and rods, hot-rolled, in irregularly wound coils, of iron or non-alloy steel",
    url: "https://www.trade-tariff.service.gov.uk/headings/7213",
  },
  subheadings: [
    { code: "721391", description: "Of circular cross-section measuring less than 14 mm in diameter", url: "u" },
    { code: "721399", description: "Other", url: "u" },
  ],
  chapter: {
    code: "72",
    description: "Iron and steel",
    note: "1. In this chapter... f. Non-alloy steel containing, by weight, one or more of the following elements in the specified proportions...",
    url: "https://www.trade-tariff.service.gov.uk/chapters/72",
  },
};

const FIXTURE_DESCRIPTION =
  "Steel hex bolts M8 x 40 mm, zinc plated — threaded fasteners of iron or steel";

describe("classify (§5.4 acceptance criteria)", () => {
  it("verifies the fixture: description → 7318.15 with GIR chain and cited notes", () => {
    const outcome = classify(
      { productDescription: FIXTURE_DESCRIPTION, declaredHsCode: "7318.15", composition: null },
      REF_7318,
    );
    expect(outcome.status).toBe("verified");
    expect(outcome.hsCode).toBe("731815");
    expect(outcome.confidence).toBeGreaterThan(0.8);

    const kinds = outcome.reasoningChain.map((s) => s.kind);
    expect(kinds).toContain("section_note");
    expect(kinds).toContain("gir1");
    expect(kinds).toContain("gir6");
    expect(kinds[kinds.length - 1]).toBe("conclusion");

    // Every output is cited: heading, subheading, section note, GIR 1 & 6.
    const refs = outcome.citations.map((c) => c.reference);
    expect(refs).toContain("Heading 7318");
    expect(refs).toContain("Subheading 7318.15");
    expect(refs).toContain("GIR 1");
    expect(refs).toContain("GIR 6");
    expect(outcome.citations.some((c) => c.sourceType === "section_note")).toBe(true);
  });

  it("suggests when no code is declared", () => {
    const outcome = classify(
      { productDescription: FIXTURE_DESCRIPTION, declaredHsCode: null, composition: null },
      REF_7318,
    );
    expect(outcome.status).toBe("suggested");
    expect(outcome.hsCode).toBe("731815");
  });

  it("raises a disagreement when the declared code contradicts the chain", () => {
    const outcome = classify(
      { productDescription: FIXTURE_DESCRIPTION, declaredHsCode: "7326.90", composition: null },
      REF_7318,
    );
    expect(outcome.status).toBe("disagrees_with_declared");
    expect(outcome.hsCode).toBe("731815");
    expect(outcome.reasoningChain.at(-1)?.text).toContain("does NOT match");
  });

  it("accepts a more specific declared code (7318159098 vs reasoned 731815)", () => {
    const outcome = classify(
      { productDescription: FIXTURE_DESCRIPTION, declaredHsCode: "7318159098", composition: null },
      REF_7318,
    );
    expect(outcome.status).toBe("verified");
  });

  it("asks a guided question for a vague description — never a silent best-guess", () => {
    const outcome = classify(
      { productDescription: "assorted steel goods", declaredHsCode: "7318.15", composition: null },
      null,
    );
    expect(outcome.status).toBe("needs_input");
    expect(outcome.hsCode).toBeNull();
    expect(outcome.guidedQuestion).toBeTruthy();
  });

  it("asks a guided question when no product description exists at all", () => {
    const outcome = classify(
      { productDescription: null, declaredHsCode: "7318.15", composition: null },
      null,
    );
    expect(outcome.status).toBe("needs_input");
    expect(outcome.guidedQuestion).toContain("What are the goods");
  });

  it("asks which subheading when the description matches several (bolts AND nuts)", () => {
    const outcome = classify(
      {
        productDescription: "steel bolts and nuts assortment, threaded fasteners",
        declaredHsCode: null,
        composition: null,
      },
      REF_7318,
    );
    expect(outcome.status).toBe("needs_input");
    expect(outcome.headingCode).toBe("7318");
    expect(outcome.guidedQuestion).toContain("Which kind of fastener");
  });

  it("requires the mill-cert composition where it gates the chapter (7213 vs 7227)", () => {
    const outcome = classify(
      {
        productDescription: "steel wire rod in irregularly wound coils",
        declaredHsCode: "7213.91",
        composition: null,
      },
      REF_7213,
    );
    expect(outcome.status).toBe("needs_input");
    expect(outcome.guidedQuestion).toContain("mill certificate");
    expect(outcome.guidedQuestion).toContain("7227");
    expect(outcome.citations.some((c) => c.sourceType === "chapter_note")).toBe(true);
  });

  it("concludes wire rod at HS-6 once composition and cross-section are stated", () => {
    const outcome = classify(
      {
        productDescription:
          "non-alloy steel wire rod, circular cross-section 5.5 mm, in coils",
        declaredHsCode: "7213.91",
        composition: "C 0.08%, Mn 0.45%, Si 0.18%",
      },
      REF_7213,
    );
    expect(outcome.status).toBe("verified");
    expect(outcome.hsCode).toBe("721391");
    expect(outcome.reasoningChain.some((s) => s.kind === "chapter_note")).toBe(true);
  });
});
