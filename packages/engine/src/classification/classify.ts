import type { Citation } from "@veritariff/shared";
import { normalizeHsCode } from "../mismatch/normalize";
import {
  CLASSIFICATION_RULES_VERSION,
  matchHeadingRules,
  type HeadingRule,
} from "./rules";

/**
 * HS classification verification (§5.4) — the deterministic legal chain:
 * facts → Section/Chapter notes → heading (GIR 1–5) → HS-6 (GIR 6).
 * Reference data (heading text, notes, subheading list) is passed IN from
 * the tariff client; this module performs no I/O and never guesses: when
 * the facts don't determine an outcome it returns a guided question.
 */

export interface ClassificationFacts {
  productDescription: string | null;
  /** Declared HS code from the documents, if any. */
  declaredHsCode: string | null;
  /** Mill-certificate composition, when the shipment has one. */
  composition: string | null;
}

/** Tariff reference data for one candidate heading (from the tariff client). */
export interface HeadingReferenceData {
  heading: { code: string; description: string; url: string };
  subheadings: { code: string; description: string; url: string }[];
  chapter: { code: string; description: string; note: string; url: string };
  section: { numeral: string; title: string; note: string; url: string };
  source: "live" | "recorded";
  retrievedAt: string;
}

export interface ReasoningStep {
  kind: "facts" | "section_note" | "chapter_note" | "gir1" | "gir6" | "conclusion";
  text: string;
  citation?: Citation;
}

export type ClassificationStatus =
  | "verified"
  | "suggested"
  | "disagrees_with_declared"
  | "needs_input";

export interface ClassificationOutcome {
  status: ClassificationStatus;
  /** HS-6 (digits only) when determined; null when input is needed. */
  hsCode: string | null;
  headingCode: string | null;
  confidence: number;
  reasoningChain: ReasoningStep[];
  citations: Citation[];
  guidedQuestion?: string;
  rulesVersion: string;
}

/** Quote the first line of a legal note mentioning the given term. */
function quoteLine(note: string, pattern: RegExp): string | undefined {
  const line = note.split("\n").find((l) => pattern.test(l));
  return line?.trim().slice(0, 300);
}

function needsInput(
  question: string,
  reasoningChain: ReasoningStep[],
  citations: Citation[],
  headingCode: string | null = null,
): ClassificationOutcome {
  return {
    status: "needs_input",
    hsCode: null,
    headingCode,
    confidence: 0,
    reasoningChain: [
      ...reasoningChain,
      { kind: "conclusion", text: `Cannot conclude without more information. ${question}` },
    ],
    citations,
    guidedQuestion: question,
    rulesVersion: CLASSIFICATION_RULES_VERSION,
  };
}

export function classify(
  facts: ClassificationFacts,
  reference: HeadingReferenceData | null,
): ClassificationOutcome {
  const chain: ReasoningStep[] = [];
  const citations: Citation[] = [];

  if (!facts.productDescription || facts.productDescription.trim().length < 3) {
    return needsInput(
      "No product description was found in the shipment's documents. What are the goods? Describe the product, its material, and its form (e.g. “steel hex bolts M8, zinc plated”).",
      chain,
      citations,
    );
  }

  chain.push({
    kind: "facts",
    text: `Product description from the documents: “${facts.productDescription}”.`,
  });

  const candidates = matchHeadingRules(facts.productDescription);

  if (candidates.length === 0) {
    return needsInput(
      `The description “${facts.productDescription}” does not match the curated steel/metals rules (HS Chapters 72–73, rules version ${CLASSIFICATION_RULES_VERSION}). What is the product's material and form? If it is not an iron/steel product, its chapter is outside this ruleset and needs manual classification.`,
      chain,
      citations,
    );
  }

  if (candidates.length > 1) {
    const list = candidates.map((c) => `${c.heading} (${c.summary})`).join("; ");
    return needsInput(
      `The description matches more than one heading: ${list}. Which best describes the goods as presented?`,
      chain,
      citations,
    );
  }

  const rule = candidates[0]!;
  if (!reference || reference.heading.code !== rule.heading) {
    throw new Error(
      `Classification requires tariff reference data for heading ${rule.heading}.`,
    );
  }

  // Section note — context and hard exclusions for the section.
  const sectionQuote =
    quoteLine(reference.section.note, /parts of general use/i) ??
    quoteLine(reference.section.note, /this section does not cover/i);
  const sectionCitation: Citation = {
    sourceType: "section_note",
    reference: `Section ${reference.section.numeral} (${reference.section.title}), Notes`,
    url: reference.section.url,
    quote: sectionQuote,
  };
  citations.push(sectionCitation);
  chain.push({
    kind: "section_note",
    text: `Section ${reference.section.numeral} (${reference.section.title}) covers the goods; its notes state no exclusion moving them elsewhere.`,
    citation: sectionCitation,
  });

  // Chapter 72 Note 1 gating: non-alloy vs alloy needs the composition.
  if (rule.requiresComposition) {
    const chapterQuote = quoteLine(reference.chapter.note, /non-alloy steel/i);
    const chapterCitation: Citation = {
      sourceType: "chapter_note",
      reference: `Chapter ${reference.chapter.code}, Note 1`,
      url: reference.chapter.url,
      quote: chapterQuote,
    };
    citations.push(chapterCitation);

    if (!facts.composition) {
      chain.push({
        kind: "chapter_note",
        text: `Heading ${rule.heading} covers iron or NON-ALLOY steel only; alloy steel of this form falls under heading ${rule.alloyAlternativeHeading}. Chapter ${reference.chapter.code} Note 1 defines the alloy/non-alloy boundary by chemical composition — this requires the mill certificate.`,
        citation: chapterCitation,
      });
      return needsInput(
        `Provide the mill certificate: the chemical composition decides between heading ${rule.heading} (non-alloy) and ${rule.alloyAlternativeHeading} (alloy) under Chapter ${reference.chapter.code} Note 1.`,
        chain,
        citations,
        rule.heading,
      );
    }

    chain.push({
      kind: "chapter_note",
      text: `Mill-certificate composition provided (“${facts.composition}”). Assessed against Chapter ${reference.chapter.code} Note 1's alloy thresholds for the non-alloy/alloy split between headings ${rule.heading} and ${rule.alloyAlternativeHeading}.`,
      citation: chapterCitation,
    });
  }

  // GIR 1: classification by heading terms.
  const headingCitation: Citation = {
    sourceType: "tariff_commodity",
    reference: `Heading ${rule.heading}`,
    url: reference.heading.url,
    quote: reference.heading.description,
  };
  const gir1Citation: Citation = {
    sourceType: "gir",
    reference: "GIR 1",
    quote: "Classification shall be determined according to the terms of the headings and any relative section or chapter notes.",
  };
  citations.push(headingCitation, gir1Citation);
  chain.push({
    kind: "gir1",
    text: `GIR 1: the goods answer to the terms of heading ${rule.heading} — “${reference.heading.description}”.`,
    citation: headingCitation,
  });

  // GIR 6: subheading within the heading.
  const text = facts.productDescription.toLowerCase();
  const subMatches = rule.subheadings.filter((s) => s.match.some((m) => m.test(text)));
  // Prefer the most specific match: a description mentioning both "bolts"
  // and "nuts" ("bolts with their nuts") keeps the first-listed, most
  // specific subheading only if exactly one survives specificity ordering.
  const chosen =
    subMatches.length === 1
      ? subMatches[0]
      : subMatches.length > 1 &&
          subMatches.every((s) => s.code === subMatches[0]!.code)
        ? subMatches[0]
        : undefined;

  if (!chosen) {
    if (subMatches.length > 1) {
      return needsInput(
        `Within heading ${rule.heading}, the description matches more than one subheading (${subMatches.map((s) => s.code).join(", ")}). ${rule.subheadingQuestion}`,
        chain,
        citations,
        rule.heading,
      );
    }
    return needsInput(
      `The heading is ${rule.heading}, but the description does not determine the HS-6 subheading. ${rule.subheadingQuestion}`,
      chain,
      citations,
      rule.heading,
    );
  }

  const tariffSub = reference.subheadings.find((s) => s.code === chosen.code);
  if (!tariffSub) {
    return needsInput(
      `The curated rules point to subheading ${chosen.code}, but the UK Trade Tariff does not list it under heading ${rule.heading} — the ruleset needs review before this can be concluded.`,
      chain,
      citations,
      rule.heading,
    );
  }

  const subCitation: Citation = {
    sourceType: "tariff_commodity",
    reference: `Subheading ${chosen.code.slice(0, 4)}.${chosen.code.slice(4)}`,
    url: tariffSub.url,
    quote: tariffSub.description,
  };
  const gir6Citation: Citation = {
    sourceType: "gir",
    reference: "GIR 6",
    quote: "Classification in the subheadings of a heading shall be determined according to the terms of those subheadings and any related subheading notes.",
  };
  citations.push(subCitation, gir6Citation);
  chain.push({
    kind: "gir6",
    text: `GIR 6: within heading ${rule.heading}, the goods fall under subheading ${chosen.code.slice(0, 4)}.${chosen.code.slice(4)} — “${tariffSub.description}”.`,
    citation: subCitation,
  });

  // Compare with the declared code.
  const declared = facts.declaredHsCode ? normalizeHsCode(facts.declaredHsCode) : null;
  const agrees =
    declared !== null &&
    (declared.startsWith(chosen.code) || chosen.code.startsWith(declared));

  let status: ClassificationStatus;
  let confidence: number;
  if (declared === null) {
    status = "suggested";
    confidence = 0.8;
    chain.push({
      kind: "conclusion",
      text: `No HS code is declared on the documents; ${chosen.code.slice(0, 4)}.${chosen.code.slice(4)} is suggested for review.`,
    });
  } else if (agrees) {
    status = "verified";
    confidence = 0.9;
    chain.push({
      kind: "conclusion",
      text: `The declared code ${facts.declaredHsCode} agrees with this chain — classification verified at ${chosen.code.slice(0, 4)}.${chosen.code.slice(4)}.`,
    });
  } else {
    status = "disagrees_with_declared";
    confidence = 0.8;
    chain.push({
      kind: "conclusion",
      text: `The declared code ${facts.declaredHsCode} does NOT match the reasoned subheading ${chosen.code.slice(0, 4)}.${chosen.code.slice(4)} — review required before entry.`,
    });
  }

  return {
    status,
    hsCode: chosen.code,
    headingCode: rule.heading,
    confidence,
    reasoningChain: chain,
    citations,
    rulesVersion: CLASSIFICATION_RULES_VERSION,
  };
}

export type { HeadingRule };
