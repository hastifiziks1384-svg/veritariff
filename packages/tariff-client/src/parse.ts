/**
 * Parsers for the UK Trade Tariff API's JSON:API responses. Shared by the
 * live client and the recorded (fixture) client so tests exercise the exact
 * same parsing as production.
 */

interface JsonApiResource {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
}

interface JsonApiDocument {
  data: JsonApiResource;
  included?: JsonApiResource[];
}

const SITE = "https://www.trade-tariff.service.gov.uk";

export interface ParsedHeading {
  code: string;
  description: string;
  url: string;
  subheadings: { code: string; description: string; url: string }[];
}

export function parseHeading(doc: JsonApiDocument): ParsedHeading {
  const attrs = doc.data.attributes;
  const code = String(attrs.goods_nomenclature_item_id ?? "").slice(0, 4);

  // HS-6 subheadings: commodity rows whose item id ends in "0000". Grouping
  // rows share the id of their first child at a lower indent — keep the
  // deepest (most specific) description per 6-digit code.
  const byCode6 = new Map<string, { description: string; indents: number }>();
  for (const item of doc.included ?? []) {
    if (item.type !== "commodity") continue;
    const itemId = String(item.attributes.goods_nomenclature_item_id ?? "");
    if (!itemId.endsWith("0000") || itemId.length !== 10) continue;
    const code6 = itemId.slice(0, 6);
    const indents = Number(item.attributes.number_indents ?? 0);
    const existing = byCode6.get(code6);
    if (!existing || indents > existing.indents) {
      byCode6.set(code6, {
        description: String(item.attributes.description ?? ""),
        indents,
      });
    }
  }

  return {
    code,
    description: String(attrs.description ?? ""),
    url: `${SITE}/headings/${code}`,
    subheadings: [...byCode6.entries()].map(([code6, v]) => ({
      code: code6,
      description: v.description,
      url: `${SITE}/subheadings/${code6}000000-80`,
    })),
  };
}

export interface ParsedChapter {
  code: string;
  description: string;
  note: string;
  url: string;
  section: { numeral: string; title: string; note: string; url: string };
}

export function parseChapter(doc: JsonApiDocument): ParsedChapter {
  const attrs = doc.data.attributes;
  const code = String(attrs.goods_nomenclature_item_id ?? "").slice(0, 2);
  const section = (doc.included ?? []).find((i) => i.type === "section");
  const sectionAttrs = section?.attributes ?? {};
  return {
    code,
    description: String(attrs.description ?? ""),
    note: String(attrs.chapter_note ?? ""),
    url: `${SITE}/chapters/${code}`,
    section: {
      numeral: String(sectionAttrs.numeral ?? ""),
      title: String(sectionAttrs.title ?? ""),
      note: String(sectionAttrs.section_note ?? ""),
      url: `${SITE}/sections/${String(sectionAttrs.position ?? "")}`,
    },
  };
}
