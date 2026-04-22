import { NextResponse } from "next/server";

import { auth } from "@/auth";

function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith("/sign-in")) return true;
  if (pathname.startsWith("/api/auth")) return true;
  if (pathname === "/api/health") return true;
  if (pathname.startsWith("/api/inbound")) return true;
  if (pathname.startsWith("/api/dev/simulate-inbound")) return true;
  if (pathname.startsWith("/api/dev/process-outbound-queue")) return true;
  if (pathname.startsWith("/api/dev/simulate-provider-event")) return true;
  if (pathname.startsWith("/api/dev/simulate-webhook-replay")) return true;
  if (pathname.startsWith("/api/webhooks/resend")) return true;
  if (pathname.startsWith("/api/internal/outbound")) return true;
  // PR M — public one-click unsubscribe endpoints. The GET route shows
  // the confirmation page; the POST route (and /api variant) performs
  // the actual unsubscribe. No auth — the token itself is the proof.
  if (pathname.startsWith("/unsubscribe/")) return true;
  if (pathname.startsWith("/api/unsubscribe/")) return true;
  return false;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }
  if (!req.auth) {
    const signIn = new URL("/sign-in", req.nextUrl.origin);
    signIn.searchParams.set(
      "callbackUrl",
      `${pathname}${req.nextUrl.search}`,
    );
    return NextResponse.redirect(signIn);
  }
  return NextResponse.next();
});

export const config = {
  // Exclude Auth.js routes: middleware runs on Edge and must not run Auth() there — env/provider
  // resolution is incomplete vs Node, which surfaces as error=Configuration on sign-in/callback.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
