"use server";

import { revalidatePath } from "next/cache";

import { parseClientAccountGrade } from "@/lib/clients/client-account-grade";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { setClientAccountGrade } from "@/server/clients/account-grade";

export type AccountGradeActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Set a client's account grade from the account card.
 *
 * Open to any signed-in member of staff, deliberately: grading an account is a
 * commercial call the account manager makes, not an owner-only operation, and
 * the standing decision on this project is that daily ops belong to all staff.
 * What makes that safe is not restricting WHO — it is recording who, which
 * `setClientAccountGrade` does on every write.
 *
 * The grade arrives as an untrusted form string and is narrowed before it goes
 * anywhere near the database.
 */
export async function setClientAccountGradeAction(
  clientId: string,
  gradeValue: string,
): Promise<AccountGradeActionResult> {
  const staff = await requireOpensDoorsStaff();

  const grade = parseClientAccountGrade(gradeValue);
  if (!grade) {
    return { ok: false, error: "Choose one of the three account grades." };
  }

  const result = await setClientAccountGrade({
    clientId,
    grade,
    staffUserId: staff.id,
  });
  if (!result.ok) {
    return result;
  }

  // The grade changes what the Outreach screen releases, so both pages have to
  // re-render — the card that shows the new signature and the send screen whose
  // behaviour just changed.
  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/clients/${clientId}/outreach`);

  return {
    ok: true,
    message:
      grade === "CORPORATE"
        ? "Saved. Outreach for this client is now released four recipients at a time."
        : "Saved. Outreach for this client is released without a group limit.",
  };
}
