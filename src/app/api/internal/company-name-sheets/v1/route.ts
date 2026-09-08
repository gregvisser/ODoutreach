import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncCompanyNameSheet } from "@/server/integrations/google-sheets/company-name-sheet-sync";

export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const secret = process.env.PROCESS_QUEUE_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Company sheet sync not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || body.protocol !== 1) return NextResponse.json({ error: "Use company-sheet protocol 1" }, { status: 409 });
  try {
    if (body.planOnly === true) {
      const sources = await prisma.companyDncSheetSource.findMany({ where: { client: { deletedAt: null } }, orderBy: { id: "asc" }, take: 1001, select: { id: true } });
      if (sources.length > 1000) return NextResponse.json({ protocol: 1, ok: false, error: "Too many company sources for one plan" }, { status: 503 });
      return NextResponse.json({ protocol: 1, ok: true, sourceIds: sources.map(source => source.id) });
    }
    if (typeof body.sourceId !== "string" || !body.sourceId.trim() || body.sourceId.length > 200) return NextResponse.json({ error: "A source from the plan is required" }, { status: 400 });
    const result = await syncCompanyNameSheet(body.sourceId);
    return NextResponse.json({ protocol: 1, ...result }, { status: result.ok ? 200 : 207 });
  } catch {
    return NextResponse.json({ protocol: 1, ok: false, error: "Company sheet sync could not be confirmed" }, { status: 500 });
  }
}
