import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Liveness/readiness for load balancers and deploy scripts. No auth.
 * Does not expose secrets.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      service: "opensdoors-outreach",
      checks: { database: "ok" as const },
    });
  } catch {
    return NextResponse.json(
      { ok: false, service: "opensdoors-outreach", checks: { database: "error" as const } },
      { status: 503 },
    );
  }
}
