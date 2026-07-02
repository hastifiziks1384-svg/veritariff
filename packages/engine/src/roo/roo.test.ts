import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { selectOriginRule, type OriginRuleTable } from "./index";

// The engine is pure — the test loads the curated table just as the
// pipeline does, and passes it in.
const table = JSON.parse(
  readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../data/roo-rules/tca-ch72-73.json",
    ),
    "utf8",
  ),
) as OriginRuleTable;

describe("selectOriginRule (§5.5 acceptance criteria)", () => {
  it("surfaces the TCA rule for heading 7318, cited and explained", () => {
    const result = selectOriginRule("7318", table);
    expect(result).not.toBeNull();
    expect(result!.ruleType).toBe("CTH");
    expect(result!.citedArticle).toContain("73.18");
    expect(result!.citation.sourceType).toBe("fta_article");
    expect(result!.citation.url).toBeTruthy();
    expect(result!.plainEnglish).toContain("change of tariff heading");
  });

  it("is phrased so it cannot be read as a qualification claim", () => {
    const result = selectOriginRule("7318", table)!;
    expect(result.plainEnglish).toContain("does NOT assess or assert");
    expect(result.plainEnglish.toLowerCase()).not.toMatch(
      /goods (qualify|are originating|meet the rule)/,
    );
  });

  it("is marked illustrative until the advisor validates the table", () => {
    const result = selectOriginRule("7318", table)!;
    expect(result.isIllustrative).toBe(true);
    expect(result.rulesVersion).toContain("draft");
  });

  it("matches heading ranges (7213 falls in 7213-7216)", () => {
    const result = selectOriginRule("7213", table);
    expect(result).not.toBeNull();
    expect(result!.citedArticle).toContain("72.13");
    expect(result!.ruleType).toBe("combination");
  });

  it("returns null outside the curated chapters — flagged upstream, never guessed", () => {
    expect(selectOriginRule("8481", table)).toBeNull();
    expect(selectOriginRule("nope", table)).toBeNull();
  });
});
