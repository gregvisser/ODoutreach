import { NextRequest, NextResponse } from "next/server";
import { jobOutcome, jobResponseBody } from "@/lib/alerts/job-outcome";
import { runDueRocketReachListRefills } from "@/server/prospect-research/auto-refill";

export const runtime = "nodejs";

/** List top-up only. This route does not enrol contacts and does not send email. */
export async function POST(req: NextRequest) {
  const secret = process.env.PROCESS_QUEUE_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Scheduler not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runDueRocketReachListRefills();
    return NextResponse.json(jobResponseBody(result), { status: jobOutcome(result).status });
  } catch {
    return NextResponse.json({ ok: false, error: "RocketReach list top-up could not complete" }, { status: 500 });
  }
}
