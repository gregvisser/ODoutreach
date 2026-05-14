import { notFound } from "next/navigation";

import { ClientLinkedReplyDetail } from "@/components/activity/client-linked-reply-detail";
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

  return (
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
  );
}
