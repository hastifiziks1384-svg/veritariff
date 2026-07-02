import type { Citation, RuleType } from "@veritariff/shared";

/**
 * Rules of origin, Levels 1–2 (§5.5): looks up the applicable TCA
 * product-specific rule for a heading from the curated Ch 72–73 table and
 * explains it in plain English. VERIFICATION/EXPLANATION ONLY — this module
 * must never assert that goods qualify, and its output is phrased so it
 * cannot be read as a qualification claim. Pure function: the caller loads
 * the curated table (data/roo-rules) and passes it in.
 */

export interface OriginRuleEntry {
  /** "7318" or an inclusive range "7213-7216". */
  headings: string;
  ruleText: string;
  ruleType: RuleType;
  article: string;
  draftNote?: string;
}

export interface OriginRuleTable {
  version: string;
  agreement: string;
  instrument: string;
  instrumentUrl: string;
  isIllustrative: boolean;
  note: string;
  rules: OriginRuleEntry[];
}

export interface OriginRuleContextResult {
  agreement: string;
  hsHeading: string;
  ruleText: string;
  ruleType: RuleType;
  citedArticle: string;
  citation: Citation;
  plainEnglish: string;
  isIllustrative: boolean;
  rulesVersion: string;
}

const RULE_TYPE_EXPLANATIONS: Record<RuleType, (heading: string) => string> = {
  CTH: (heading) =>
    `This is a “change of tariff heading” (CTH) rule: every non-originating material used to make the goods must be classified in a different HS heading than ${heading.slice(0, 2)}.${heading.slice(2)} itself. In other words, non-originating inputs must be transformed enough that their tariff heading changes.`,
  MaxNOM: () =>
    `This is a maximum non-originating material (MaxNOM) rule: the value of non-originating materials used may not exceed the stated percentage of the product's ex-works price.`,
  wholly_obtained: () =>
    `This is a “wholly obtained” rule: the goods must be entirely obtained or produced in the exporting party, with no non-originating materials.`,
  combination: () =>
    `This rule sets specific production conditions (which materials or processing stages the goods must be produced from), rather than a simple heading change or value limit.`,
};

const NO_ASSERTION =
  "This shows the rule that applies to this shipment and what it means. It does NOT assess or assert whether these goods actually meet the rule — origin qualification is not determined here.";

/** Match "7318" against an entry's "7318" or "7213-7216" range. */
function headingMatches(heading4: string, entryHeadings: string): boolean {
  const h = Number(heading4);
  if (entryHeadings.includes("-")) {
    const [from, to] = entryHeadings.split("-").map(Number);
    return h >= from! && h <= to!;
  }
  return h === Number(entryHeadings);
}

export function selectOriginRule(
  heading4: string,
  table: OriginRuleTable,
): OriginRuleContextResult | null {
  if (!/^\d{4}$/.test(heading4)) return null;
  const entry = table.rules.find((r) => headingMatches(heading4, r.headings));
  if (!entry) return null;

  const formattedHeading = `${heading4.slice(0, 2)}.${heading4.slice(2)}`;
  const explanation = RULE_TYPE_EXPLANATIONS[entry.ruleType](heading4);

  return {
    agreement: table.agreement,
    hsHeading: heading4,
    ruleText: entry.ruleText,
    ruleType: entry.ruleType,
    citedArticle: entry.article,
    citation: {
      sourceType: "fta_article",
      reference: entry.article,
      url: table.instrumentUrl,
      quote: entry.ruleText,
    },
    plainEnglish: `Under the ${table.agreement}, the product-specific rule of origin for heading ${formattedHeading} is: “${entry.ruleText}” ${explanation} ${NO_ASSERTION}`,
    isIllustrative: table.isIllustrative,
    rulesVersion: table.version,
  };
}
