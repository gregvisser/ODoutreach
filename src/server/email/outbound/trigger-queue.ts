import "server-only";

let loggedAutoprocessIgnoredInProd = false;

/**
 * After enqueueing outbound mail, drain the queue without blocking the HTTP handler.
 * - `AUTOPROCESS_OUTBOUND_QUEUE=true`: run processor in-process (local/dev only — **ignored when `NODE_ENV=production`** to avoid risky in-process draining in deployed environments).
 * - Else: POST to `/api/internal/outbound/process-queue` when `INTERNAL_APP_URL` + `PROCESS_QUEUE_SECRET` are set (cron / secondary worker).
 */
export async function triggerOutboundQueueDrain(): Promise<void> {
  const batch = Math.min(
    Math.max(parseInt(process.env.OUTBOUND_QUEUE_BATCH_SIZE ?? "8", 10) || 8, 1),
    25,
  );

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
    void processOutboundSendQueue({ limit: batch }).catch(() => {});
    return;
  }

  const secret = process.env.PROCESS_QUEUE_SECRET?.trim();
  const base =
    process.env.INTERNAL_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  if (!secret || !base) {
    return;
  }

  const url = `${base.replace(/\/$/, "")}/api/internal/outbound/process-queue`;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ limit: batch }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    /* fire-and-forget */
  }
}
