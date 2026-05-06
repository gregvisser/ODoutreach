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
  // Public one-click unsubscribe endpoints. The token itself is the proof.
  if (pathname.startsWith("/unsubscribe/")) return true;
  if (pathname.startsWith("/api/unsubscribe/")) return true;
  return false;
}
