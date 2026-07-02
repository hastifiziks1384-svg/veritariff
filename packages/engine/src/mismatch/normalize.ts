/**
 * Deterministic value normalisation for cross-document comparison.
 * Normalisation only removes representation noise (case, punctuation,
 * common legal-form variants, country-name spellings) — it never changes
 * the stated fact.
 */

/** Legal-form and connective variants treated as the same token. */
const PARTY_TOKEN_SYNONYMS: Record<string, string> = {
  limited: "ltd",
  incorporated: "inc",
  corporation: "corp",
  company: "co",
  and: "&",
};

/** Fuzzy-match key for party names: "Ltd" vs "Limited" compare equal. */
export function normalizeParty(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,()]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => PARTY_TOKEN_SYNONYMS[token] ?? token)
    .join(" ");
}

const COUNTRY_TO_ISO2: Record<string, string> = {
  germany: "DE",
  "united kingdom": "GB",
  "great britain": "GB",
  uk: "GB",
  france: "FR",
  italy: "IT",
  spain: "ES",
  netherlands: "NL",
  "the netherlands": "NL",
  belgium: "BE",
  poland: "PL",
  austria: "AT",
  sweden: "SE",
  ireland: "IE",
  portugal: "PT",
  "czech republic": "CZ",
  czechia: "CZ",
  china: "CN",
  "people's republic of china": "CN",
  turkey: "TR",
  türkiye: "TR",
  india: "IN",
  "united states": "US",
  "united states of america": "US",
  usa: "US",
};

/** "Germany" and "DE" compare equal; unknown names compare as stated. */
export function normalizeCountry(value: string): string {
  const trimmed = value.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return COUNTRY_TO_ISO2[trimmed.toLowerCase()] ?? trimmed.replace(/\s+/g, " ").toUpperCase();
}

/** "7318.15" and "7318 15" compare equal; keeps digits only. */
export function normalizeHsCode(value: string): string {
  return value.replace(/\D/g, "");
}

/** Parses "4,000" / "120" / "4850.00"; returns null when not numeric. */
export function parseNumeric(value: string): number | null {
  const cleaned = value.replace(/[\s,]/g, "");
  if (cleaned === "" || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** Default comparison key: case- and whitespace-insensitive. */
export function normalizeDefault(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}
