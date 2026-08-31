import { notFound } from "next/navigation";

import { ClientLinkedReplyDetail } from "@/components/activity/client-linked-reply-detail";
import { ReplyClaimNotice } from "@/components/activity/reply-claim-notice";
import { ReplyOwnershipCard } from "@/components/activity/reply-ownership-card";
import { AddToDoNotContactButtons } from "@/components/suppression/add-to-dnc";
import { replyClaimSubjectKey, resolveReplyClaimSubject } from "@/lib/inbox/reply-claim";
import { replyOwnershipLabel, resolveReplyOwnershipState } from "@/lib/inbox/reply-ownership";
import { detectRemovalIntent } from "@/lib/unsubscribe/detect-removal-intent";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { loadDisplayClaimsForSubjects, loadVisibleReplyClaim } from "@/server/inbox/reply-claim";
import { loadClientLinkedReplyDetail } from "@/server/queries/client-linked-reply-detail";
import { loadClientWorkspaceBundle } from "@/server/queries/client-workspace-bundle";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ clientId: string; replyId: string }>;
};

export default async function ClientLinkedReplyDetailPage({ params }: Props) {
  const staff = await requireOpensDoorsStaff();
  const accessible = await getAccessibleClientIds(staff);
  const { clientId, replyId } = await params;

  const bundle = await loadClientWorkspaceBundle(clientId, accessible, staff);
  if (!bundle.client) notFound();

  const detail = await loadClientLinkedReplyDetail({ clientId, replyId });
  if (!detail) notFound();

  // Advisory claiming. This page and the inbound-message detail page are two
  // routes to the same prospect conversation, so both key the claim on the
  // correlated mailbox message where one exists — open it either way and you
  // see the same "somebody is already on this".
  const claimSubject = resolveReplyClaimSubject({
    replyId,
    inboundMailboxMessageId: detail.inboundMailboxMessageId,
  });
  const replyClaim = await loadVisibleReplyClaim({
    clientId,
    subject: claimSubject,
    viewerStaffUserId: staff.id,
  });

  // Row 132 — the self-inclusive version, for the persistent ownership card
  // below (unlike `replyClaim` above, which is built to say nothing about
  // the viewer's own claim).
  const displayClaims = await loadDisplayClaimsForSubjects({
    clientId,
    subjects: [claimSubject],
    viewerStaffUserId: staff.id,
  });
  const ownershipState = resolveReplyOwnershipState({
    handledAt: detail.handledAt,
    handledByName: detail.handledByName,
    handledByIsViewer: detail.handledByStaffUserId === staff.id,
    claim: displayClaims.get(replyClaimSubjectKey(claimSubject)) ?? null,
  });

  // F6 (b) — flag, don't auto-act. If the prospect's own words read as an
  // unsubscribe/removal request, surface a loud compliance banner with the
  // existing one-click Do-not-contact action so staff can't miss it. The
  // detector is precision-biased and ignores our own quoted footer.
  const removalIntent = detectRemovalIntent({
    subject: detail.reply.subject,
    snippet: detail.reply.snippet,
    bodyPreview: detail.reply.bodyPreview,
  });

  return (
    <div className="space-y-6">
      <ReplyOwnershipCard
        clientId={clientId}
        replyId={replyId}
        subjectType={claimSubject.subjectType}
        subjectId={claimSubject.subjectId}
        label={replyOwnershipLabel(ownershipState)}
        isClaimed={ownershipState.kind === "claimed"}
        isHandled={ownershipState.kind === "handled"}
      />
      <ReplyClaimNotice
        clientId={clientId}
        subjectType={claimSubject.subjectType}
        subjectId={claimSubject.subjectId}
        claim={replyClaim}
      />
      {removalIntent.detected ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-4">
          <p className="text-sm font-semibold text-destructive">
            This reply asks to be removed from outreach.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Their message reads as an unsubscribe / removal request. If that&apos;s
            correct, add them to Do-not-contact now — treat this as a compliance
            action, not optional.
          </p>
          <div className="mt-3">
            <AddToDoNotContactButtons
              clientId={clientId}
              email={detail.reply.fromEmail}
              replyClaimSubjectType={claimSubject.subjectType}
              replyClaimSubjectId={claimSubject.subjectId}
            />
          </div>
        </div>
      ) : null}
      <ClientLinkedReplyDetail
        clientId={clientId}
        detail={{
        ...detail,
        reply: {
          ...detail.reply,
          receivedAt: detail.reply.receivedAt.toISOString(),
        },
        linkedOutbound: {
          ...detail.linkedOutbound,
          sentAt: detail.linkedOutbound.sentAt
            ? detail.linkedOutbound.sentAt.toISOString()
            : null,
        },
        enrollment: detail.enrollment
          ? {
              ...detail.enrollment,
              completedAt: detail.enrollment.completedAt
                ? detail.enrollment.completedAt.toISOString()
                : null,
              pausedAt: detail.enrollment.pausedAt
                ? detail.enrollment.pausedAt.toISOString()
                : null,
            }
          : null,
      }}
      />
      {removalIntent.detected ? null : (
        <AddToDoNotContactButtons
          clientId={clientId}
          email={detail.reply.fromEmail}
          replyClaimSubjectType={claimSubject.subjectType}
          replyClaimSubjectId={claimSubject.subjectId}
        />
      )}
    </div>
  );
}
