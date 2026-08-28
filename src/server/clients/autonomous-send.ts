/**
 * Recording the per-client autonomous-send switch, WITH A NAME AGAINST IT.
 *
 * Greg, relaying the owner: *"there has to be a signature shown who switched the
 * toggle and who set the grade of the customer."*
 *
 * This is the toggle half of that sentence; `@/server/clients/account-grade` is
 * the grade half, and this module deliberately follows its shape line for line
 * so the two controls behave identically on screen.
 *
 * Two writes on every change, and both matter:
 *
 *  1. The stamp on the client (`autonomousSendSetByStaffUserId` + `…SetAt`), so
 *     the account card can show who made the call without anyone opening an
 *     audit page. Attribution nobody sees is attribution nobody checks.
 *  2. An `AuditLog` row, so the full history survives the next change. The stamp
 *     is the LATEST decision; the log is EVERY decision. Overwriting the stamp
 *     must never lose the history, which is why both exist rather than one.
 *
 * The audit row follows the established shape in `@/server/email/bounce-suppression`
 * — a `kind` discriminator inside `metadata`, the client on the row, the acting
 * staff user in `staffUserId`. Unlike bounce suppression this is never
 * system-initiated: deciding a machine may send for a client is always a
 * person's call, so `staffUserId` is never null here.
 */

import { prisma } from "@/lib/db";
import {
  autonomousSendSettingToColumn,
  type AutonomousSendSetting,
} from "@/lib/clients/client-autonomous-send";

/** The stamp the account card renders next to the switch. */
export type AutonomousSendAttribution = {
  enabled: boolean | null;
  setAt: Date | null;
  /** Display name, falling back to email — never a raw staff user id. */
  setByName: string | null;
};

export type SetAutonomousSendResult =
  | { ok: true; attribution: AutonomousSendAttribution }
  | { ok: false; error: string };

/**
 * Set the switch and record who did it.
 *
 * The write and the audit row go in ONE transaction. A change of this kind that
 * silently lost its attribution would be worse than no change at all — it would
 * look decided, and nobody would own it.
 */
export async function setClientAutonomousSend(input: {
  clientId: string;
  setting: AutonomousSendSetting;
  staffUserId: string;
  now?: Date;
}): Promise<SetAutonomousSendResult> {
  const now = input.now ?? new Date();

  const client = await prisma.client.findFirst({
    where: { id: input.clientId, deletedAt: null },
    select: { id: true, autonomousSendEnabled: true },
  });
  if (!client) {
    return { ok: false, error: "Client not found." };
  }

  const previousEnabled = client.autonomousSendEnabled;
  const enabled = autonomousSendSettingToColumn(input.setting);

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.client.update({
      where: { id: input.clientId },
      data: {
        autonomousSendEnabled: enabled,
        autonomousSendSetByStaffUserId: input.staffUserId,
        autonomousSendSetAt: now,
      },
      select: {
        autonomousSendEnabled: true,
        autonomousSendSetAt: true,
        autonomousSendSetBy: { select: { displayName: true, email: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        staffUserId: input.staffUserId,
        clientId: input.clientId,
        action: "UPDATE",
        entityType: "Client",
        entityId: input.clientId,
        metadata: {
          kind: "autonomous_send_set",
          // Both sides recorded. "Who changed it" is half the story if you
          // cannot see what it was before — and `null` here is meaningful: it
          // says this was the FIRST decision anyone made about this client.
          previousEnabled: previousEnabled ?? null,
          enabled,
          setting: input.setting,
        },
      },
    });

    return row;
  });

  return {
    ok: true,
    attribution: {
      enabled: updated.autonomousSendEnabled,
      setAt: updated.autonomousSendSetAt,
      setByName:
        updated.autonomousSendSetBy?.displayName ?? updated.autonomousSendSetBy?.email ?? null,
    },
  };
}
