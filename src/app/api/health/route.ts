import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { resolveAutonomousRelayState } from "@/server/safety/autonomous-mode";

export const runtime = "nodejs";

/**
 * Liveness/readiness for load balancers and deploy scripts. No auth.
 * Does not expose secrets.
 *
 * Also reports whether the autonomous-relay send gate is live. `relay-watch.ps1`
 * reads this and REFUSES to run a cycle unless it says `active: true`. That is
 * the fail-closed link: the dangerous state is not "gate off while nobody is
 * running", it is "agent running while the gate is off", and this is how the
 * watcher can tell the difference from outside the app.
 *
 * It reports the COUNT of allowlisted clients, never their slugs — this
 * endpoint is unauthenticated and which client an agent may send for is not
 * the public's business.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const relay = resolveAutonomousRelayState();
    return NextResponse.json({
      ok: true,
      service: "opensdoors-outreach",
      checks: { database: "ok" as const },
      autonomousRelay: {
        active: relay.active,
        allowlistedClients: relay.allowlist.length,
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, service: "opensdoors-outreach", checks: { database: "error" as const } },
      { status: 503 },
    );
  }
}
