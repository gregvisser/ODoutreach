import { NextRequest, NextResponse } from "next/server";
import { isOutboundDispatchScope } from "@/lib/outbound-dispatch-scope";
import { jobOutcome, jobResponseBody } from "@/lib/alerts/job-outcome";
import { prisma } from "@/lib/db";
import { runAsSystem, runInOrganisation } from "@/lib/tenant/organisation-context";
import { processOutboundSendQueue } from "@/server/email/outbound/queue-processor";

export const runtime = "nodejs";

// Separate versioned route: older deployments return 404, never ignore scope.
export async function POST(req: NextRequest) {
  const secret = process.env.PROCESS_QUEUE_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Dispatcher not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (body?.dispatchProtocol !== 1 || !isOutboundDispatchScope(body)) return NextResponse.json({ error: "Explicit versioned email scope required" }, { status: 400 });
  try {
    const client = await runAsSystem(() =>
      prisma.client.findUnique({ where: { id: body.clientId }, select: { organisationId: true } }),
    );
    const drain = () =>
      processOutboundSendQueue({
        limit: body.outboundEmailIds.length,
        dispatchScope: { clientId: body.clientId, outboundEmailIds: body.outboundEmailIds },
      });
    const result = client
      ? await runInOrganisation(client.organisationId, drain)
      : await drain();
    return NextResponse.json({ dispatchProtocol: 1, ...jobResponseBody(result) }, { status: jobOutcome(result).status });
  } catch {
    return NextResponse.json({ dispatchProtocol: 1, ok: false, error: "Dispatch outcome unverified; inspect existing emails before retrying" }, { status: 500 });
  }
}
