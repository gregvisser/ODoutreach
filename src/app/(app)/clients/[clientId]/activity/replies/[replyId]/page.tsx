import { notFound } from "next/navigation";

import { ClientLinkedReplyDetail } from "@/components/activity/client-linked-reply-detail";
import { AddToDoNotContactButtons } from "@/components/suppression/add-to-dnc";
import { detectRemovalIntent } from "@/lib/unsubscribe/detect-removal-intent";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
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
        />
      )}
    </div>
  );
}
