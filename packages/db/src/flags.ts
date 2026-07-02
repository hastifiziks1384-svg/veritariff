import type { PrismaClient } from "@prisma/client";

/**
 * Flag review actions (§5.3): every determination is presented for human
 * review; nothing is auto-applied. Each action is recorded on the Flag and
 * in the append-only audit trail.
 */
export type FlagAction =
  | "accept_recommendation"
  | "reject_recommendation"
  | "resolve"
  | "ignore"
  | "escalate";

export interface FlagActionOptions {
  note?: string;
  actor?: string;
}

export async function applyFlagAction(
  prisma: PrismaClient,
  flagId: string,
  action: FlagAction,
  options: FlagActionOptions = {},
) {
  const actor = options.actor ?? "reviewer";
  const flag = await prisma.flag.findUnique({ where: { id: flagId } });
  if (!flag) throw new Error(`Flag ${flagId} not found`);

  let data;
  switch (action) {
    case "accept_recommendation": {
      if (flag.recommendationStatus !== "proposed") {
        throw new Error("This flag has no open recommendation to accept.");
      }
      const value = `${flag.recommendedValue}${flag.recommendedValueUnit ? ` ${flag.recommendedValueUnit}` : ""}`;
      data = {
        recommendationStatus: "accepted",
        resolution: "resolved",
        resolvedBy: actor,
        resolvedNote:
          options.note ?? `Accepted recommended value ${value}. ${flag.recommendationBasis ?? ""}`.trim(),
        resolvedAt: new Date(),
      };
      break;
    }
    case "reject_recommendation": {
      if (flag.recommendationStatus !== "proposed") {
        throw new Error("This flag has no open recommendation to reject.");
      }
      // The flag stays open — the reviewer resolves it on their own terms.
      data = { recommendationStatus: "rejected" };
      break;
    }
    case "resolve":
      data = {
        resolution: "resolved",
        resolvedBy: actor,
        resolvedNote: options.note ?? null,
        resolvedAt: new Date(),
      };
      break;
    case "ignore":
      data = {
        resolution: "ignored",
        resolvedBy: actor,
        resolvedNote: options.note ?? null,
        resolvedAt: new Date(),
      };
      break;
    case "escalate":
      data = {
        resolution: "escalated",
        resolvedBy: actor,
        resolvedNote: options.note ?? null,
        resolvedAt: new Date(),
      };
      break;
  }

  const updated = await prisma.flag.update({ where: { id: flagId }, data });

  await prisma.auditEvent.create({
    data: {
      shipmentId: flag.shipmentId,
      actor,
      action: `flag.${action}`,
      detail: JSON.stringify({
        flagId: flag.id,
        field: flag.field,
        severity: flag.severity,
        recommendedValue: flag.recommendedValue,
        note: options.note ?? null,
      }),
    },
  });

  return updated;
}
