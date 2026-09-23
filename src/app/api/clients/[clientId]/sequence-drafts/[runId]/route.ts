import { NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { readSequenceDraftRun } from "@/server/ai/sequence-draft-run";
import { requireClientAccess } from "@/server/tenant/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  clientId: z.string().trim().min(1).max(128),
  runId: z.string().trim().min(1).max(128),
});

const AUTH_FAILURES = new Set([
  "Unauthorized",
  "STAFF_INACTIVE",
  "STAFF_EMAIL_NOT_ALLOWED",
  "FORBIDDEN_CLIENT",
]);

type RouteContext = {
  params: Promise<{ clientId: string; runId: string }>;
};

/**
 * Poll target for a detached sequence draft. Reads one run for one client.
 * It never starts or repeats a model call.
 */
export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const staff = await requireOpensDoorsStaff();
    await requireClientAccess(staff, parsed.data.clientId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (AUTH_FAILURES.has(message)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    logger.error(
      { err, scope: "ai.sequence-draft-status", clientId: parsed.data.clientId },
      "Could not authorise a sequence draft status read",
    );
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }

  let view;
  try {
    view = await readSequenceDraftRun({
      clientId: parsed.data.clientId,
      runId: parsed.data.runId,
    });
  } catch (err) {
    logger.error(
      { err, scope: "ai.sequence-draft-status", clientId: parsed.data.clientId },
      "Could not read a sequence draft run",
    );
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
  if (!view) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(
    { status: view.status, message: view.message },
    { headers: { "cache-control": "no-store" } },
  );
}
