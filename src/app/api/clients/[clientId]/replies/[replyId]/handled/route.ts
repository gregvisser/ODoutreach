import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { resolveReplyClaimSubject } from "@/lib/inbox/reply-claim";
import { tryGetOpensDoorsStaff } from "@/server/auth/staff";
import { markInboundReplyHandled } from "@/server/inbox/mark-reply-handled";
import { loadClientLinkedReplyDetail, loadClientOrphanReplyDetail } from "@/server/queries/client-linked-reply-detail";
import { canAccessClient } from "@/server/tenant/access";

/** A JSON acknowledgement must not wait for a client-side page transition. */
export async function POST(request: NextRequest, context: { params: Promise<{ clientId: string; replyId: string }> }) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? request.nextUrl.protocol.replace(":", "");
  let sameOrigin = false;
  try { sameOrigin = Boolean(origin && host && new URL(origin).origin === `${protocol}://${host}`); } catch {}
  if (!sameOrigin) return NextResponse.json({ ok: false, reason: "This request did not come from this site." }, { status: 403 });

  try {
    const staff = await tryGetOpensDoorsStaff();
    if (!staff) return NextResponse.json({ ok: false, reason: "Sign in again before updating this reply." }, { status: 401 });
    const { clientId, replyId } = await context.params;
    if (!await canAccessClient(staff, clientId)) return NextResponse.json({ ok: false, reason: "This workspace is unavailable." }, { status: 404 });
    const detail = await loadClientLinkedReplyDetail({ clientId, replyId }) ?? await loadClientOrphanReplyDetail({ clientId, replyId });
    if (!detail) return NextResponse.json({ ok: false, reason: "That reply is not available in this workspace." }, { status: 404 });
    // Resolve the claim from the scoped stored reply, never from a request body.
    const subject = resolveReplyClaimSubject({ replyId, inboundMailboxMessageId: detail.inboundMailboxMessageId });
    const result = await markInboundReplyHandled({ staff, clientId, replyId, ...subject });
    if (!result.ok) return NextResponse.json(result, { status: 422 });
    revalidatePath(`/clients/${clientId}/activity/replies/${replyId}`);
    revalidatePath(`/clients/${clientId}/activity`);
    revalidatePath("/replies");
    return NextResponse.json({ ok: true, label: result.handledByStaffUserId === staff.id ? "Handled by you" : "Handled by another staff member" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, uncertain: true, reason: "We could not confirm the update. Check the saved status before trying again." }, { status: 503 });
  }
}
