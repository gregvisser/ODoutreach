import "server-only";

import { prisma } from "@/lib/db";

const RECENT_LIMIT = 40;

export type StaffAccessAuditListItem = {
  id: string;
  createdAtIso: string;
  auditAction: string;
  actorEmail: string | null;
  targetEmail: string | null;
  detail: string;
};

function formatStaffAuditDetail(metadata: unknown): string {
  if (metadata === null || typeof metadata !== "object") {
    return "—";
  }
  const m = metadata as Record<string, unknown>;
  const op = m.op;
  switch (op) {
    case "invite_sent": {
      const email = String(m.inviteeEmail ?? "");
      const role = String(m.role ?? "");
      return `Invitation sent${email ? ` → ${email}` : ""}${role ? ` (${role})` : ""}`;
    }
    case "invite_resent": {
      const email = String(m.inviteeEmail ?? "");
      return `Invitation resent${email ? ` → ${email}` : ""}`;
    }
    case "invitation_status_sync": {
      const email = String(m.inviteeEmail ?? "");
      const ext = String(m.externalUserState ?? "");
      const state = String(m.guestInvitationState ?? "");
      return `Invite status synced${email ? ` (${email})` : ""}${ext ? ` — Microsoft: ${ext}` : ""}${state ? ` → app: ${state}` : ""}`;
    }
    case "role_change": {
      const from = String(m.fromRole ?? "");
      const to = String(m.toRole ?? "");
      return `Role ${from} → ${to}`;
    }
    case "active_change": {
      const active = m.isActive === true ? "active" : m.isActive === false ? "inactive" : String(m.isActive ?? "");
      return `Active set to ${active}`;
    }
    default:
      return JSON.stringify(metadata);
  }
}

/**
 * Recent AuditLog rows for Staff Access (entityType StaffUser). Admin-only callers should gate before use.
 */
export async function listRecentStaffAccessAuditLogs(): Promise<StaffAccessAuditListItem[]> {
  const logs = await prisma.auditLog.findMany({
    where: { entityType: "StaffUser" },
    orderBy: { createdAt: "desc" },
    take: RECENT_LIMIT,
    include: {
      staffUser: { select: { email: true } },
    },
  });

  const targetIds = [
    ...new Set(
      logs
        .map((l) => l.entityId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  const targets =
    targetIds.length === 0
      ? []
      : await prisma.staffUser.findMany({
          where: { id: { in: targetIds } },
          select: { id: true, email: true },
        });
  const emailById = Object.fromEntries(targets.map((t) => [t.id, t.email]));

  return logs.map((log) => ({
    id: log.id,
    createdAtIso: log.createdAt.toISOString(),
    auditAction: log.action,
    actorEmail: log.staffUser?.email ?? null,
    targetEmail: log.entityId ? (emailById[log.entityId] ?? null) : null,
    detail: formatStaffAuditDetail(log.metadata),
  }));
}
