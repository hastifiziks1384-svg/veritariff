import { readFileSync } from "node:fs";
import path from "node:path";
import { parseChapter, parseHeading } from "./parse";
import type { TariffDataSource, TariffHeadingReference } from "./types";

/**
 * Reads raw UK Trade Tariff API responses recorded under
 * data/fixtures/tariff (heading<code>.json, chapter<code>.json) and parses
 * them with the same parsers as the live client — used by tests and as an
 * offline fallback. Data is real but frozen at recording time.
 */
export class RecordedTariffClient implements TariffDataSource {
  constructor(private readonly fixtureDir: string) {}

  private read(name: string): unknown {
    return JSON.parse(readFileSync(path.join(this.fixtureDir, name), "utf8"));
  }

  async getHeadingReference(heading4: string): Promise<TariffHeadingReference> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const headingDoc = this.read(`heading${heading4}.json`) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chapterDoc = this.read(`chapter${heading4.slice(0, 2)}.json`) as any;

    const heading = parseHeading(headingDoc);
    const chapter = parseChapter(chapterDoc);
    return {
      heading: { code: heading.code, description: heading.description, url: heading.url },
      subheadings: heading.subheadings,
      chapter: {
        code: chapter.code,
        description: chapter.description,
        note: chapter.note,
        url: chapter.url,
      },
      section: chapter.section,
      retrievedAt: new Date().toISOString(),
      source: "recorded",
    };
  }
}
