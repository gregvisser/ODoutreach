import { NextResponse } from "next/server";

import { createBuildInfo } from "@/lib/build-info";

export const runtime = "nodejs";

/**
 * Non-secret build marker for deploy and routing verification.
 */
export async function GET() {
  return NextResponse.json(createBuildInfo());
}
