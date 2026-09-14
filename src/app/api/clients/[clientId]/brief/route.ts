import { NextRequest, NextResponse } from "next/server";
import { saveClientBriefAction } from "@/app/(app)/clients/client-brief-actions";

/** Stable save URL: long-lived forms must not depend on a deployment's action ID. */
export async function POST(request: NextRequest, context: { params: Promise<{ clientId: string }> }) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  let sameOrigin = false;
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? request.nextUrl.protocol.replace(":", "");
  try { sameOrigin = Boolean(origin && host && new URL(origin).origin === `${protocol}://${host}`); } catch {}
  if (!sameOrigin) return NextResponse.json({ ok: false, error: "This save request did not come from this site." }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ ok: false, error: "Invalid brief format." }, { status: 415 });
  try {
    const reader = request.body?.getReader();
    const decoder = new TextDecoder();
    let raw = "";
    let bytes = 0;
    if (reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 250_000) { await reader.cancel(); return NextResponse.json({ ok: false, error: "The brief is too large. Shorten the text and try again." }, { status: 413 }); }
        raw += decoder.decode(chunk.value, { stream: true });
      }
      raw += decoder.decode();
    }
    let input;
    try { input = JSON.parse(raw); } catch { return NextResponse.json({ ok: false, error: "Invalid brief format." }, { status: 400 }); }
    if (!input || typeof input !== "object" || Array.isArray(input)) return NextResponse.json({ ok: false, error: "Invalid brief format." }, { status: 400 });
    const { clientId } = await context.params;
    // Existing action authenticates active staff, checks client access and saves atomically.
    const result = await saveClientBriefAction({ ...input, clientId });
    if (!result.ok && result.error === "Could not save brief.") return NextResponse.json({ ...result, uncertain: true }, { status: 503 });
    return NextResponse.json(result, { status: result.ok ? 200 : 422, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, uncertain: true, error: "We could not confirm the save. Your entries are still on this page. Open the saved brief to check before trying again." }, { status: 503 });
  }
}
