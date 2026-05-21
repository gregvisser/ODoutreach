import { type NextRequest } from "next/server";

import { prisma } from "@/lib/db";

/**
 * Open-tracking pixel endpoint.
 *
 * GET /api/track/open/<correlationId> — embedded as a hidden 1×1 image in
 * outgoing HTML emails. On first load it records `openedAt` on the matching
 * OutboundEmail, then always returns a transparent GIF. It must never error
 * to the client (a broken image would be visible to recipients) and never
 * leak whether a given id exists.
 */

// 43-byte transparent 1×1 GIF.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

export const dynamic = "force-dynamic";

function pixelResponse(): Response {
  return new Response(new Uint8Array(PIXEL), {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  try {
    const { token } = await context.params;
    const correlationId = token?.trim();
    if (correlationId) {
      // Record only the FIRST open (openedAt: null guard keeps it idempotent
      // across repeated pixel loads / Apple MPP pre-fetches of the same mail).
      await prisma.outboundEmail.updateMany({
        where: { correlationId, openedAt: null },
        data: { openedAt: new Date() },
      });
    }
  } catch {
    // Never fail the pixel — always return the GIF.
  }
  return pixelResponse();
}
