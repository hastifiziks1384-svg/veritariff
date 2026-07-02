import { NextResponse } from "next/server";
import { applyFlagAction, prisma, type FlagAction } from "@veritariff/db";

const ACTIONS: FlagAction[] = [
  "accept_recommendation",
  "reject_recommendation",
  "resolve",
  "ignore",
  "escalate",
];

/** Review/resolve action on a flag (§5.3) — recorded in the audit trail. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    note?: string;
  };

  if (!body.action || !ACTIONS.includes(body.action as FlagAction)) {
    return NextResponse.json(
      { error: `action must be one of: ${ACTIONS.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const flag = await applyFlagAction(prisma, id, body.action as FlagAction, {
      note: body.note,
    });
    return NextResponse.json(flag);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Action failed." },
      { status: 400 },
    );
  }
}
