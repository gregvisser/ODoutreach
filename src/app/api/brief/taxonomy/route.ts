import { NextRequest, NextResponse } from "next/server";
import { searchBriefTaxonomyAction } from "@/app/(app)/clients/client-brief-actions";

export async function GET(request: NextRequest) {
  try {
    const result = await searchBriefTaxonomyAction({
      kind: request.nextUrl.searchParams.get("kind") as Parameters<typeof searchBriefTaxonomyAction>[0]["kind"],
      q: request.nextUrl.searchParams.get("q") ?? "",
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Suggestions unavailable." }, { status: 503 });
  }
}
