import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOLERANCES,
  FIELD_AUTHORITY_ORDER,
  ZERO_TOLERANCE_FIELDS,
} from "./tolerances";

describe("tolerance model (§5.3)", () => {
  it("defaults weight/quantity tolerance to ±0.5%", () => {
    expect(DEFAULT_TOLERANCES.weightPct).toBe(0.005);
    expect(DEFAULT_TOLERANCES.quantityPct).toBe(0.005);
  });

  it("treats HS code, stated origin, and currency as zero-tolerance", () => {
    expect(ZERO_TOLERANCE_FIELDS).toContain("hs_code");
    expect(ZERO_TOLERANCE_FIELDS).toContain("stated_origin");
    expect(ZERO_TOLERANCE_FIELDS).toContain("currency");
  });

  it("never defines a recommendation authority for hs_code", () => {
    expect(FIELD_AUTHORITY_ORDER).not.toHaveProperty("hs_code");
  });

  it("makes the packing list authoritative for gross weight", () => {
    expect(FIELD_AUTHORITY_ORDER.gross_weight_kg?.[0]).toBe("packing_list");
  });
});
