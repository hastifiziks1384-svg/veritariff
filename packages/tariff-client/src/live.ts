import { parseChapter, parseHeading } from "./parse";
import type { TariffDataSource, TariffHeadingReference } from "./types";

const API_BASE = "https://www.trade-tariff.service.gov.uk/api/v2";

/**
 * Live client for the UK Trade Tariff API (free, unauthenticated).
 * Two requests per heading: the heading (with its commodity tree) and its
 * chapter (which embeds the section, including the section note).
 */
export class UkTradeTariffClient implements TariffDataSource {
  constructor(private readonly baseUrl: string = API_BASE) {}

  private async get(path: string): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`UK Trade Tariff API ${path} responded ${res.status}`);
    }
    return res.json();
  }

  async getHeadingReference(heading4: string): Promise<TariffHeadingReference> {
    if (!/^\d{4}$/.test(heading4)) {
      throw new Error(`Invalid heading code: ${heading4}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [headingDoc, chapterDoc] = (await Promise.all([
      this.get(`/headings/${heading4}`),
      this.get(`/chapters/${heading4.slice(0, 2)}`),
    ])) as [any, any];

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
      source: "live",
    };
  }
}
