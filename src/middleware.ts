import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/api/health",
  // ESP / tooling webhooks — auth via token in path + optional INBOUND_WEBHOOK_SECRET
  "/api/inbound(.*)",
  "/api/dev/simulate-inbound(.*)",
  "/api/dev/process-outbound-queue(.*)",
  "/api/dev/simulate-provider-event(.*)",
  "/api/dev/simulate-webhook-replay(.*)",
  "/api/webhooks/resend(.*)",
  // Worker/cron — Bearer PROCESS_QUEUE_SECRET
  "/api/internal/outbound(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!.+\\.[\\w]+$|_next).*)",
    "/",
    "/(api|trpc)(.*)",
  ],
};
