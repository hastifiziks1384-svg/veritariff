import type { DocumentType } from "@veritariff/shared";

/**
 * Deterministic document typing from content keywords, with a filename
 * fallback. Order matters: more specific document kinds are checked first
 * (a supplier's declaration mentions the word "invoice"; a packing list may
 * mention "invoice no"). Unrecognisable documents are honestly typed
 * "other" — never guessed — and surfaced for review downstream.
 */
const CONTENT_RULES: readonly [DocumentType, RegExp][] = [
  ["suppliers_declaration", /supplier'?s?\s+declaration/i],
  ["mill_certificate", /mill\s+(test\s+)?certificate|EN\s?10204|inspection\s+certificate/i],
  ["packing_list", /packing\s+list/i],
  ["bill_of_lading", /bill\s+of\s+lading/i],
  ["cmr", /\bCMR\b|international\s+carriage\s+of\s+goods\s+by\s+road/i],
  ["commercial_invoice", /commercial\s+invoice|proforma\s+invoice|invoice\s+no/i],
];

const FILENAME_RULES: readonly [DocumentType, RegExp][] = [
  ["suppliers_declaration", /supplier|declaration/i],
  ["mill_certificate", /mill|cert/i],
  ["packing_list", /packing|pl\b/i],
  ["bill_of_lading", /\bbol\b|lading/i],
  ["cmr", /(?<![a-z])cmr(?![a-z])/i],
  ["commercial_invoice", /invoice|\binv\b/i],
];

export function detectDocumentType(text: string, filename: string): DocumentType {
  for (const [type, pattern] of CONTENT_RULES) {
    if (pattern.test(text)) return type;
  }
  for (const [type, pattern] of FILENAME_RULES) {
    if (pattern.test(filename)) return type;
  }
  return "other";
}
