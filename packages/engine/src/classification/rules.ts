/**
 * Curated classification rules for the steel/metals beachhead (HS Chapters
 * 72–73). These are deterministic keyword rules that map product-description
 * facts onto candidate headings and HS-6 subheadings; the legal text itself
 * (heading wording, Section/Chapter notes) comes live from the UK Trade
 * Tariff and is cited on every determination. The rules only ever narrow —
 * when nothing matches, the outcome is a guided question, never a guess.
 *
 * DRAFT until reviewed by the trade-law advisor.
 */
export const CLASSIFICATION_RULES_VERSION = "ch72-73-draft-2026-07-02";

export interface SubheadingRule {
  /** HS-6 code, digits only. */
  code: string;
  match: RegExp[];
  /** Facts the rule needs; used to build the guided question when absent. */
  requiresMention?: string;
}

export interface HeadingRule {
  heading: string;
  /** Human summary used in explanations. */
  summary: string;
  match: RegExp[];
  subheadings: SubheadingRule[];
  /** The guided question when no subheading rule matches. */
  subheadingQuestion: string;
  /**
   * Chapter 72 Note 1 gating: the non-alloy/alloy split needs the mill-cert
   * composition. `alloyAlternativeHeading` is the heading the goods move to
   * when the composition shows alloy steel.
   */
  requiresComposition?: boolean;
  alloyAlternativeHeading?: string;
}

export const CH72_73_RULES: HeadingRule[] = [
  {
    heading: "7318",
    summary: "screws, bolts, nuts, washers and similar threaded/non-threaded fasteners of iron or steel",
    match: [/\bbolts?\b/, /\bscrews?\b/, /\bnuts?\b/, /washers?/, /rivets?/, /cotters?/, /threaded fasteners?/, /\bfasteners?\b/],
    subheadings: [
      { code: "731811", match: [/coach screws?/] },
      { code: "731812", match: [/wood screws?/] },
      { code: "731813", match: [/screw hooks?/, /screw rings?/] },
      { code: "731814", match: [/self-?tapping/] },
      {
        code: "731815",
        match: [/\bbolts?\b/, /machine screws?/, /hex(agon)?\s*(head\s*)?(bolts?|screws?)/],
        requiresMention: "that the article is a bolt or screw (other than coach/wood/self-tapping)",
      },
      { code: "731816", match: [/\bnuts?\b/] },
      { code: "731819", match: [/threaded .*(stud|rod)/] },
      { code: "731821", match: [/spring washers?/, /lock washers?/] },
      { code: "731822", match: [/washers?/] },
      { code: "731823", match: [/rivets?/] },
      { code: "731824", match: [/cotters?/, /cotter pins?/] },
    ],
    subheadingQuestion:
      "Which kind of fastener is it — bolt/machine screw, coach screw, wood screw, self-tapping screw, nut, washer (spring or plain), rivet, or cotter/cotter pin? And is it threaded?",
  },
  {
    heading: "7213",
    summary: "bars and rods of iron or non-alloy steel, hot-rolled, in irregularly wound coils (wire rod)",
    match: [/wire rods?/, /rods?,? hot-?rolled.*coils?/],
    requiresComposition: true,
    alloyAlternativeHeading: "7227",
    subheadings: [
      { code: "721310", match: [/indentations?|ribs?|grooves?|deformations?/] },
      { code: "721320", match: [/free-?cutting/] },
      {
        code: "721391",
        match: [/less than 14\s?mm|circular cross-?section.*(?:[0-9]|1[0-3])(\.\d+)?\s?mm/],
        requiresMention: "a circular cross-section under 14 mm",
      },
      { code: "721399", match: [/14\s?mm or more|other/] },
    ],
    subheadingQuestion:
      "What is the wire rod's cross-section — circular under 14 mm diameter, circular 14 mm or more, ribbed/indented, or of free-cutting steel?",
  },
  {
    heading: "7217",
    summary: "wire of iron or non-alloy steel",
    match: [/\bwire\b(?!\s*rods?)/],
    requiresComposition: true,
    alloyAlternativeHeading: "7229",
    subheadings: [
      { code: "721710", match: [/not plated|not coated|uncoated/] },
      { code: "721720", match: [/zinc|galvani[sz]ed/] },
      { code: "721730", match: [/plated|coated/] },
      { code: "721790", match: [/other/] },
    ],
    subheadingQuestion:
      "Is the wire uncoated, zinc-plated/galvanised, plated with another base metal, or otherwise coated?",
  },
  {
    heading: "7306",
    summary: "other tubes, pipes and hollow profiles of iron or steel (e.g. welded)",
    match: [/\btubes?\b/, /\bpipes?\b/, /hollow profiles?/],
    subheadings: [
      { code: "730630", match: [/welded.*circular.*(iron|non-?alloy)/] },
      { code: "730661", match: [/square|rectangular/] },
      { code: "730669", match: [/other non-?circular/] },
    ],
    subheadingQuestion:
      "Is the tube/pipe welded or seamless, circular or square/rectangular in cross-section, and of non-alloy, alloy or stainless steel? (Seamless tubes fall under 7304; line pipe/casing has its own headings.)",
  },
];

/** Find heading rules whose keywords match the product description. */
export function matchHeadingRules(description: string): HeadingRule[] {
  const text = description.toLowerCase();
  return CH72_73_RULES.filter((rule) => rule.match.some((m) => m.test(text)));
}
