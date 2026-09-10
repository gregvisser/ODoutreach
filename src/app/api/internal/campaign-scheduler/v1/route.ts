import { NextRequest, NextResponse } from "next/server";
import { runSelectedCampaignFollowUps } from "@/server/email-sequences/selected-campaign-scheduler";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = process.env.PROCESS_QUEUE_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Scheduler not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || body.campaignSchedulerProtocol !== 1 || Object.keys(body).some(key => key !== "campaignSchedulerProtocol")) {
    return NextResponse.json({ error: "Use campaign scheduler protocol 1; selection is server-managed" }, { status: 400 });
  }
  try {
    const result = await runSelectedCampaignFollowUps(process.env.CAMPAIGN_SCHEDULER_SELECTION);
    return NextResponse.json({ campaignSchedulerProtocol: 1, ...result }, { status: result.ok ? 200 : 207 });
  } catch {
    return NextResponse.json({ campaignSchedulerProtocol: 1, ok: false, error: "Selected campaign run did not complete" }, { status: 500 });
  }
}
