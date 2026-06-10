export function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith("/sign-in")) return true;
  if (pathname.startsWith("/api/auth")) return true;
  if (pathname === "/api/health") return true;
  if (pathname === "/api/build-info") return true;
  if (pathname.startsWith("/api/inbound")) return true;
  if (pathname.startsWith("/api/dev/simulate-inbound")) return true;
  if (pathname.startsWith("/api/dev/process-outbound-queue")) return true;
  if (pathname.startsWith("/api/dev/simulate-provider-event")) return true;
  if (pathname.startsWith("/api/dev/simulate-webhook-replay")) return true;
  if (pathname.startsWith("/api/webhooks/resend")) return true;
  if (pathname.startsWith("/api/internal/outbound")) return true;
  if (pathname.startsWith("/api/internal/replies")) return true;
  // Cron-driven follow-up advancer. The route enforces its own
  // PROCESS_QUEUE_SECRET bearer — "public" here only means the auth
  // middleware must not redirect the cron's token request to sign-in.
  if (pathname.startsWith("/api/internal/sequences")) return true;
  // Cron-driven do-not-contact sheet re-sync (same bearer model).
  if (pathname.startsWith("/api/internal/suppression")) return true;
  // Public one-click unsubscribe endpoints. The token itself is the proof.
  if (pathname.startsWith("/unsubscribe/")) return true;
  if (pathname.startsWith("/api/unsubscribe/")) return true;
  return false;
}
