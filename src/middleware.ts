import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { isPublicPath } from "@/lib/public-paths";

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
