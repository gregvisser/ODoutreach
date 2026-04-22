import { headers } from "next/headers";

import { resolveUnsubscribeToken } from "@/server/unsubscribe/unsubscribe-service";
import { maskEmailForDisplay } from "@/lib/unsubscribe/unsubscribe-token";

/**
 * PR M — Public one-click unsubscribe landing page.
 *
 * Safety:
 *   * No authentication required — the token IS the proof.
 *   * Invalid / unknown tokens render a generic error page; we never
 *     hint at whether a token would have resolved in a different
 *     tenant or for a different recipient.
 *   * GET renders a confirmation page (masked email + "Confirm
 *     unsubscribe" button). Actual suppression only happens after the
 *     POST, so an email-scanner that follows GET links cannot cause an
 *     unintended unsubscribe.
 *   * POST calls `performUnsubscribe`; repeated POSTs are idempotent
 *     (the second call renders the "You were already unsubscribed"
 *     state).
 *   * This page is also exposed as `/api/unsubscribe/[token]` (POST)
 *     for one-click-header compatibility; most mail clients either POST
 *     directly to that URL or follow the in-body link.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ status?: string }>;
};

function Shell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/15 via-background to-background px-4">
      <div className="relative z-10 w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            OpensDoors
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
        </div>
        {children}
      </div>
    </div>
  );
}

function InvalidTokenView() {
  return (
    <Shell title="Unsubscribe link is invalid or expired">
      <p className="text-sm text-muted-foreground">
        This unsubscribe link is invalid or expired. If you received a message
        you did not expect, please reply to the sender directly and ask them to
        stop contacting you.
      </p>
    </Shell>
  );
}

export default async function UnsubscribePage({
  params,
  searchParams,
}: PageProps) {
  const { token } = await params;
  const sp = (await searchParams) ?? {};

  // Read POST status from a query parameter the route action redirect
  // sets so the page stays a single server component.
  const status = typeof sp.status === "string" ? sp.status : null;

  const resolved = await resolveUnsubscribeToken(token);
  if (!resolved) {
    // Swallow all failure modes into the same generic copy.
    return <InvalidTokenView />;
  }

  const maskedEmail = maskEmailForDisplay(resolved.email);
  const clientName = resolved.clientName;

  if (status === "done" || resolved.usedAt) {
    return (
      <Shell title="You have been unsubscribed">
        <p className="text-sm text-muted-foreground">
          You will no longer receive outreach from{" "}
          <span className="font-medium text-foreground">{clientName}</span> at{" "}
          <span className="font-mono text-foreground">{maskedEmail}</span>.
        </p>
        <p className="text-xs text-muted-foreground">
          If you continue to receive outreach for any reason, please reply to
          the sender and let them know.
        </p>
      </Shell>
    );
  }

  // Build a POST URL that posts back to the same route. Next.js
  // supports server actions, but for a completely auth-free public
  // page we prefer a plain <form> POST to the sibling API endpoint so
  // email clients can also submit directly to that URL as a one-click
  // header target.
  const headerBag = await headers();
  const forwardedHost = headerBag.get("x-forwarded-host") ?? headerBag.get("host");
  const forwardedProto = headerBag.get("x-forwarded-proto") ?? "https";
  const origin =
    forwardedHost !== null ? `${forwardedProto}://${forwardedHost}` : "";
  const apiAction = `${origin}/api/unsubscribe/${encodeURIComponent(token)}`;

  return (
    <Shell title="Confirm unsubscribe">
      <p className="text-sm text-muted-foreground">
        You are about to unsubscribe{" "}
        <span className="font-mono text-foreground">{maskedEmail}</span> from
        outreach by{" "}
        <span className="font-medium text-foreground">{clientName}</span>. This
        cannot be undone automatically.
      </p>
      <form method="POST" action={apiAction} className="flex justify-center">
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-md border border-destructive/60 bg-destructive px-4 text-sm font-medium text-destructive-foreground shadow-sm transition hover:bg-destructive/90"
        >
          Confirm unsubscribe
        </button>
      </form>
      <p className="text-[11px] text-muted-foreground">
        Clicking the button suppresses this address for{" "}
        <span className="font-medium">{clientName}</span>&rsquo;s outreach in
        our system. Other clients are not affected.
      </p>
    </Shell>
  );
}
