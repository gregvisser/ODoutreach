import "server-only";

import { prisma } from "@/lib/db";
import { staffRoleLabel } from "@/lib/ui/status-labels";

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
      const state = String(m.guestInvitationState ?? "");
      const humanState =
        state === "ACCEPTED"
          ? "accepted"
          : state === "PENDING"
            ? "still pending"
            : state.toLowerCase();
      return `Refreshed invitation status${email ? ` for ${email}` : ""}${
        humanState ? ` — ${humanState}` : ""
      }`;
    }
    case "role_change": {
      const from = staffRoleLabel(String(m.fromRole ?? ""));
      const to = staffRoleLabel(String(m.toRole ?? ""));
      return `Role changed from ${from} to ${to}`;
    }
    case "active_change": {
      if (m.isActive === true) return "Sign-in allowed";
      if (m.isActive === false) return "Sign-in blocked";
      return "Sign-in state changed";
    }
    default:
      return "—";
  }
}

const STAFF_AUDIT_ACTION_LABELS: Record<string, string> = {
  CREATE: "Invite",
  UPDATE: "Update",
  SYNC: "Refresh",
  DELETE: "Remove",
};

export function staffAuditActionLabel(action: string): string {
  if (!action) return "—";
  return STAFF_AUDIT_ACTION_LABELS[action] ?? action[0] + action.slice(1).toLowerCase();
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
