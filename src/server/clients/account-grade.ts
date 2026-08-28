/**
 * Recording a client's account grade, WITH A NAME AGAINST IT.
 *
 * Greg, relaying the owner: "there has to be a signature shown who switched the
 * toggle and who set the grade of the customer."
 *
 * So this module does two things on every change, and both matter:
 *
 *  1. It stamps `accountGradeSetByStaffUserId` + `accountGradeSetAt` on the
 *     client, because the account card has to show who made the call WITHOUT
 *     anyone opening an audit page. Attribution nobody sees is attribution
 *     nobody checks.
 *  2. It appends a row to `AuditLog`, so the full history survives the next
 *     change. The stamp on the client is the LATEST decision; the audit log is
 *     every decision. Overwriting the stamp must never lose the history, which
 *     is why both exist rather than one.
 *
 * The audit row follows the established shape in `@/server/email/bounce-suppression`
 * — a `kind` discriminator inside `metadata`, the client on the row, and the
 * acting staff user in `staffUserId`. Unlike bounce suppression, this is never
 * system-initiated: a grade is always a human's commercial judgement, so
 * `staffUserId` is never null here.
 */

import { prisma } from "@/lib/db";
import type { ClientAccountGrade } from "@/lib/clients/client-account-grade";

/** The stamp the account card renders next to the control. */
export type AccountGradeAttribution = {
  grade: ClientAccountGrade | null;
  setAt: Date | null;
  /** Display name, falling back to email — never a raw staff user id. */
  setByName: string | null;
};

export type SetAccountGradeResult =
  | { ok: true; attribution: AccountGradeAttribution }
  | { ok: false; error: string };

/**
 * Set the grade and record who did it.
 *
 * The write and the audit row go in ONE transaction. A grade change that
 * silently loses its attribution is worse than no change at all — it looks
 * decided but nobody owns it.
 */
export async function setClientAccountGrade(input: {
  clientId: string;
  grade: ClientAccountGrade;
  staffUserId: string;
  now?: Date;
}): Promise<SetAccountGradeResult> {
  const now = input.now ?? new Date();

  const client = await prisma.client.findFirst({
    where: { id: input.clientId, deletedAt: null },
    select: { id: true, accountGrade: true },
  });
  if (!client) {
    return { ok: false, error: "Client not found." };
  }

  const previousGrade = client.accountGrade;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.client.update({
      where: { id: input.clientId },
      data: {
        accountGrade: input.grade,
        accountGradeSetByStaffUserId: input.staffUserId,
        accountGradeSetAt: now,
      },
      select: {
        accountGrade: true,
        accountGradeSetAt: true,
        accountGradeSetBy: { select: { displayName: true, email: true } },
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
          kind: "account_grade_set",
          // Both sides recorded: "who changed it" is only half the story if you
          // cannot see what it was before.
          previousGrade: previousGrade ?? null,
          grade: input.grade,
        },
      },
    });

    return row;
  });

  return {
    ok: true,
    attribution: {
      grade: updated.accountGrade,
      setAt: updated.accountGradeSetAt,
      setByName:
        updated.accountGradeSetBy?.displayName ?? updated.accountGradeSetBy?.email ?? null,
    },
  };
}
