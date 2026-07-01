/**
 * Deterministic extraction of shipment-reference candidates from document
 * text. Only label-anchored tokens are accepted (e.g. "Export Ref:",
 * "Invoice No:") to avoid picking up arbitrary codes; a candidate must
 * contain at least one digit.
 */
// Shipment-level labels rank ahead of document-local numbers (invoice no,
// packing list no): a shared export reference should name the shipment, not
// one document's own numbering.
const SHIPMENT_LEVEL_LABEL = new RegExp(
  String.raw`(?:export\s+ref(?:erence)?|reference|\bref\b|shipment\s+no|booking\s+no|order\s+no)\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/]{4,})`,
  "gi",
);
const DOCUMENT_LEVEL_LABEL = new RegExp(
  String.raw`(?:invoice\s+no|packing\s+list\s+no)\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/]{4,})`,
  "gi",
);

/** Returns unique candidates, shipment-level labels first. */
export function extractReferenceCandidates(text: string): string[] {
  const found = new Set<string>();
  for (const pattern of [SHIPMENT_LEVEL_LABEL, DOCUMENT_LEVEL_LABEL]) {
    for (const match of text.matchAll(pattern)) {
      const token = match[1]?.toUpperCase();
      if (token && /\d/.test(token)) found.add(token);
    }
  }
  return [...found];
}
