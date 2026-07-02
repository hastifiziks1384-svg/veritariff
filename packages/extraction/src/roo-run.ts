import { readFileSync } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@veritariff/db";
import {
  selectOriginRule,
  type OriginRuleContextResult,
  type OriginRuleTable,
} from "@veritariff/engine";

/**
 * Rules-of-origin pipeline, Levels 1–2 (§5.5): surfaces the applicable TCA
 * product-specific rule for the shipment's heading, in context, cited and
 * illustrative-flagged. Explanation only — nothing here asserts (or stores
 * anything that could be read as asserting) that the goods qualify.
 */
export interface RooRunResult {
  outcome: "surfaced" | "no_heading" | "outside_curated_rules" | "not_uk_eu_lane";
  context?: OriginRuleContextResult;
  detail: string;
}

const EU_COUNTRIES = new Set([
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT",
  "LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE",
]);

export function loadOriginRuleTable(repoRoot: string): OriginRuleTable {
  return JSON.parse(
    readFileSync(path.join(repoRoot, "data/roo-rules/tca-ch72-73.json"), "utf8"),
  ) as OriginRuleTable;
}

export async function runShipmentRoo(
  prisma: PrismaClient,
  shipmentId: string,
  table: OriginRuleTable,
): Promise<RooRunResult> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: {
      classifications: { orderBy: { createdAt: "desc" }, take: 1 },
      documents: { include: { extractedFields: true } },
    },
  });
  if (!shipment) throw new Error(`Shipment ${shipmentId} not found`);

  const record = async (result: RooRunResult) => {
    await prisma.auditEvent.create({
      data: {
        shipmentId,
        actor: "system",
        action: "roo.completed",
        detail: JSON.stringify({
          outcome: result.outcome,
          heading: result.context?.hsHeading ?? null,
          rulesVersion: table.version,
        }),
      },
    });
    return result;
  };

  // TCA scope: the corridor must be UK↔EU.
  const lane = shipment.lane ?? "";
  const ukEuLane =
    /EU.*(UK|GB)|(UK|GB).*EU/i.test(lane) ||
    (EU_COUNTRIES.has(shipment.originCountry ?? "") && shipment.destinationCountry === "GB") ||
    (shipment.originCountry === "GB" && EU_COUNTRIES.has(shipment.destinationCountry ?? ""));
  if (!ukEuLane) {
    return record({
      outcome: "not_uk_eu_lane",
      detail:
        "The shipment's corridor is not UK↔EU, so the TCA does not apply. No origin rule is surfaced.",
    });
  }

  // Heading: reasoned classification first, declared code as fallback.
  const classification = shipment.classifications[0];
  const declared = shipment.documents
    .flatMap((d) => d.extractedFields)
    .find((f) => f.name === "hs_code" && f.value)?.value;
  const heading =
    (classification?.hsCode || null)?.slice(0, 4) ??
    declared?.replace(/\D/g, "").slice(0, 4) ??
    null;

  if (!heading || heading.length < 4) {
    return record({
      outcome: "no_heading",
      detail:
        "No HS heading is available yet — run classification verification first. The origin rule is looked up by heading.",
    });
  }

  const context = selectOriginRule(heading, table);
  if (!context) {
    return record({
      outcome: "outside_curated_rules",
      detail: `Heading ${heading} is outside the curated TCA rules table (Chapters 72–73, version ${table.version}). The applicable rule must be looked up manually in TCA Annex 3.`,
    });
  }

  await prisma.originRuleContext.deleteMany({ where: { shipmentId } });
  await prisma.originRuleContext.create({
    data: {
      shipmentId,
      hsHeading: context.hsHeading,
      agreement: context.agreement,
      ruleText: context.ruleText,
      ruleType: context.ruleType,
      citedArticle: context.citedArticle,
      plainEnglish: context.plainEnglish,
      isIllustrative: context.isIllustrative,
      rulesDataVersion: context.rulesVersion,
    },
  });

  return record({
    outcome: "surfaced",
    context,
    detail: `Surfaced the ${context.agreement} rule for heading ${heading}.`,
  });
}
