import { NextRequest, NextResponse } from "next/server";

import { performUnsubscribe } from "@/server/unsubscribe/unsubscribe-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PR M — Public one-click unsubscribe POST endpoint.
 *
 * Handles both:
 *   1. Browser `<form method="POST">` submissions from
 *      `/unsubscribe/[token]` (human-confirmed). After a successful
 *      redemption we 303 redirect back to the page with `?status=done`
 *      so the recipient sees the confirmation view.
 *   2. RFC 8058 one-click `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
 *      submissions from mail clients / mail providers. These do not
 *      follow 303s; we return a plain JSON 200 with a generic `ok`.
 *
 * Safety:
 *   * No authentication — the token IS the proof.
 *   * Any failure mode (bad shape, unknown token, invalid token hash)
 *     is collapsed into the same public-safe response so we never
 *     reveal whether an arbitrary email exists in our database.
 *   * Idempotent — repeated redemptions return `already_unsubscribed`
 *     without re-writing the audit log.
 */

type RouteContext = {
  params: Promise<{ token: string }>;
};

function isOneClickPost(req: NextRequest, body: string): boolean {
  // RFC 8058 one-click: `Content-Type: application/x-www-form-urlencoded`
  // with body `List-Unsubscribe=One-Click`.
  const contentType =
    req.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) return false;
  return /(^|&)List-Unsubscribe=One-Click(&|$)/i.test(body);
}

export async function POST(
  req: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { token } = await context.params;

  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch {
    rawBody = "";
  }

  const oneClick = isOneClickPost(req, rawBody);
  const result = await performUnsubscribe(token);

  if (oneClick) {
    // Mail providers following RFC 8058 expect a 2xx response with a
    // short body. We always respond the same way regardless of the
    // redemption outcome so providers cannot use the response to
    // probe our database.
    return NextResponse.json({ ok: true });
  }

  // Browser form path — redirect back to the confirmation page with a
  // status flag. The page turns that flag into the success view.
  const origin = new URL(req.url).origin;
  if (result.status === "invalid") {
    // Don't redirect to an invalid-token confirmation — render the
    // same generic "invalid / expired" page the GET route already
    // serves.
    return NextResponse.redirect(
      new URL(`/unsubscribe/${encodeURIComponent(token)}`, origin),
      { status: 303 },
    );
  }
  return NextResponse.redirect(
    new URL(
      `/unsubscribe/${encodeURIComponent(token)}?status=done`,
      origin,
    ),
    { status: 303 },
  );
}
