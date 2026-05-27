/**
 * Server error observability.
 *
 * Next.js calls `onRequestError` for every server-side error (server actions,
 * RSC renders, route handlers). Previously these errors had no stack trace in
 * production — App Insights existed but the app reported no Node telemetry.
 *
 * This reports each server error two ways, both best-effort and fully guarded
 * so they can NEVER throw inside the error path:
 *   1. A structured console line → captured in the Azure App Service log stream.
 *   2. A lightweight POST to the App Insights ingestion endpoint → shows up as
 *      an Exception in Application Insights (no heavy SDK / bundling).
 *
 * The App Insights POST is a no-op when APPLICATIONINSIGHTS_CONNECTION_STRING
 * is unset (e.g. local dev).
 */

type RequestInfo = { path?: string; method?: string };
type ErrorContext = {
  routerKind?: string;
  routePath?: string;
  routeType?: string;
  renderSource?: string;
};

/** Parse `InstrumentationKey=...;IngestionEndpoint=https://...;` connection strings. */
function parseConnectionString(
  raw: string,
): { iKey: string; ingestionEndpoint: string } | null {
  const parts = Object.fromEntries(
    raw
      .split(";")
      .map((kv) => kv.split("="))
      .filter((pair) => pair.length === 2)
      .map(([k, v]) => [k.trim().toLowerCase(), v.trim()]),
  );
  const iKey = parts["instrumentationkey"];
  const ingestionEndpoint =
    parts["ingestionendpoint"] || "https://dc.services.visualstudio.com/";
  if (!iKey) return null;
  return {
    iKey,
    ingestionEndpoint: ingestionEndpoint.endsWith("/")
      ? ingestionEndpoint
      : `${ingestionEndpoint}/`,
  };
}

async function reportToAppInsights(
  err: Error,
  request: RequestInfo,
  context: ErrorContext,
): Promise<void> {
  const raw = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING?.trim();
  if (!raw) return;
  const parsed = parseConnectionString(raw);
  if (!parsed) return;

  const envelope = {
    name: "Microsoft.ApplicationInsights.Exception",
    time: new Date().toISOString(),
    iKey: parsed.iKey,
    tags: { "ai.cloud.role": "odoutreach-web" },
    data: {
      baseType: "ExceptionData",
      baseData: {
        ver: 2,
        exceptions: [
          {
            typeName: err.name || "Error",
            message: err.message || "Unknown server error",
            hasFullStack: Boolean(err.stack),
            stack: err.stack ?? "",
            parsedStack: [],
          },
        ],
        severityLevel: 3,
        properties: {
          path: request?.path ?? "",
          method: request?.method ?? "",
          routerKind: context?.routerKind ?? "",
          routePath: context?.routePath ?? "",
          routeType: context?.routeType ?? "",
          renderSource: context?.renderSource ?? "",
        },
      },
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    await fetch(`${parsed.ingestionEndpoint}v2/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function onRequestError(
  error: unknown,
  request: RequestInfo,
  context: ErrorContext,
): Promise<void> {
  const err = error instanceof Error ? error : new Error(String(error));

  // 1) Structured log — always lands in the App Service log stream.
  console.error(
    "[onRequestError]",
    JSON.stringify({
      message: err.message,
      stack: err.stack,
      path: request?.path,
      method: request?.method,
      routerKind: context?.routerKind,
      routePath: context?.routePath,
      routeType: context?.routeType,
      renderSource: context?.renderSource,
    }),
  );

  // 2) Best-effort App Insights exception — never throws.
  try {
    await reportToAppInsights(err, request, context);
  } catch {
    /* telemetry must never break the error path */
  }
}
