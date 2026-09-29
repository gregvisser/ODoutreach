import { NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { readCampaignReviewAttempt } from "@/server/ai/review-campaign";
import { requireClientAccess } from "@/server/tenant/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  clientId: z.string().trim().min(1).max(128),
});

const querySchema = z.object({
  sequenceId: z.string().trim().min(1).max(128),
  since: z.string().regex(/^\d{10,16}$/),
});

const AUTH_FAILURES = new Set([
  "Unauthorized",
  "STAFF_INACTIVE",
  "STAFF_EMAIL_NOT_ALLOWED",
  "FORBIDDEN_CLIENT",
]);

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

/**
 * Poll target for a detached campaign review. Reads one attempt. It never
 * starts or repeats a model call.
 */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const url = new URL(request.url);
  const parsedQuery = querySchema.safeParse({
    sequenceId: url.searchParams.get("sequenceId"),
    since: url.searchParams.get("since"),
  });
  if (!parsedQuery.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const sinceMs = Number(parsedQuery.data.since);
  if (!Number.isSafeInteger(sinceMs)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const staff = await requireOpensDoorsStaff();
    await requireClientAccess(staff, parsedParams.data.clientId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (AUTH_FAILURES.has(message)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    logger.error(
      { err, scope: "ai.review-campaign-status", clientId: parsedParams.data.clientId },
      "Could not authorise a campaign review status read",
    );
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }

  let view;
  try {
    view = await readCampaignReviewAttempt({
      clientId: parsedParams.data.clientId,
      sequenceId: parsedQuery.data.sequenceId,
      since: new Date(sinceMs),
    });
  } catch (err) {
    logger.error(
      { err, scope: "ai.review-campaign-status", clientId: parsedParams.data.clientId },
      "Could not read a campaign review attempt",
    );
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }

  return NextResponse.json(
    {
      state: view.state,
      message: view.state === "pending" ? null : view.message,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
