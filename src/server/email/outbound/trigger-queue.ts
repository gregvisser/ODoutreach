import "server-only";
import { isOutboundDispatchScope, type OutboundDispatchScope } from "@/lib/outbound-dispatch-scope";

let loggedAutoprocessIgnoredInProd = false;

/**
 * After enqueueing outbound mail, request one bounded dispatch of those exact emails.
 * - `AUTOPROCESS_OUTBOUND_QUEUE=true`: run processor in-process (local/dev only — **ignored when `NODE_ENV=production`** to avoid risky in-process draining in deployed environments).
 * - Else: POST to the versioned scoped dispatcher. Never fall back to a shared drain.
 */
export async function triggerOutboundQueueDrain(scope: OutboundDispatchScope): Promise<void> {
  if (!scope || !Array.isArray(scope.outboundEmailIds) || scope.outboundEmailIds.length === 0) return;
  // Validate every ID before requesting work, including IDs beyond the wake-up batch.
  if (new Set(scope.outboundEmailIds).size !== scope.outboundEmailIds.length) throw new Error("Invalid outbound dispatch scope");
  for (let i = 0; i < scope.outboundEmailIds.length; i += 50) {
    const part = { clientId: scope.clientId, outboundEmailIds: scope.outboundEmailIds.slice(i, i + 50) };
    if (!isOutboundDispatchScope(part)) throw new Error("Invalid outbound dispatch scope");
  }
  const batch = Math.min(
    Math.max(parseInt(process.env.OUTBOUND_QUEUE_BATCH_SIZE ?? "8", 10) || 8, 1),
    25,
  );
  const dispatchScope = { clientId: scope.clientId, outboundEmailIds: scope.outboundEmailIds.slice(0, batch) };

  const autoprocessRequested = process.env.AUTOPROCESS_OUTBOUND_QUEUE === "true";
  const isProduction = process.env.NODE_ENV === "production";

  if (autoprocessRequested && isProduction) {
    if (!loggedAutoprocessIgnoredInProd) {
      loggedAutoprocessIgnoredInProd = true;
      console.warn(
        "[outbound] AUTOPROCESS_OUTBOUND_QUEUE is ignored when NODE_ENV=production — use worker/cron + PROCESS_QUEUE_SECRET.",
      );
    }
  } else if (autoprocessRequested && !isProduction) {
    const { processOutboundSendQueue } = await import("./queue-processor");
    await processOutboundSendQueue({ limit: dispatchScope.outboundEmailIds.length, dispatchScope });
    return;
  }

  const secret = process.env.PROCESS_QUEUE_SECRET?.trim();
  const base =
    process.env.INTERNAL_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  if (!secret || !base) {
    return;
  }

  const url = `${base.replace(/\/$/, "")}/api/internal/outbound/dispatch/v1`;
  try {
    const response = await fetch(url, {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ dispatchProtocol: 1, ...dispatchScope }),
      signal: AbortSignal.timeout(8000),
    });
    const result = await response.json();
    if (response.status !== 200 || result?.dispatchProtocol !== 1 || result.ok !== true) {
      console.warn("[outbound] Scoped wake-up incomplete; inspect existing email status.");
      return;
    }
  } catch {
    console.warn("[outbound] Scoped wake-up outcome unverified; inspect existing email status.");
    return; // Work may already be committed. Never retry or fall back to a broader route.
  }
}
