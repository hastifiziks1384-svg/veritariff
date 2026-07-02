/**
 * Reference data fetched from the UK Trade Tariff
 * (trade-tariff.service.gov.uk). The classification engine receives this as
 * input and stays pure — all I/O lives in this package.
 */
export interface TariffHeadingReference {
  heading: { code: string; description: string; url: string };
  /** HS-6 subheadings under the heading, from the tariff commodity tree. */
  subheadings: { code: string; description: string; url: string }[];
  chapter: { code: string; description: string; note: string; url: string };
  section: { numeral: string; title: string; note: string; url: string };
  retrievedAt: string;
  source: "live" | "recorded";
}

export interface TariffDataSource {
  getHeadingReference(heading4: string): Promise<TariffHeadingReference>;
}
