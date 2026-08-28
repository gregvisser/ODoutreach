"use server";

import { revalidatePath } from "next/cache";

import { parseAutonomousSendSetting } from "@/lib/clients/client-autonomous-send";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { setClientAutonomousSend } from "@/server/clients/autonomous-send";

export type AutonomousSendActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Set a client's machine-sending / human-sending switch from the account card.
 *
 * Open to any signed-in member of staff, matching the account grade next to it:
 * the standing decision on this project is that daily ops belong to all staff.
 * What makes that safe is not restricting WHO — it is recording who, which
 * `setClientAutonomousSend` does on every write, on screen and in the audit log.
 *
 * The setting arrives as an untrusted string and is narrowed before it goes
 * anywhere near the database.
 */
export async function setClientAutonomousSendAction(
  clientId: string,
  settingValue: string,
): Promise<AutonomousSendActionResult> {
  const staff = await requireOpensDoorsStaff();

  const setting = parseAutonomousSendSetting(settingValue);
  if (!setting) {
    return { ok: false, error: "Choose either machine sending or human sending." };
  }

  const result = await setClientAutonomousSend({
    clientId,
    setting,
    staffUserId: staff.id,
  });
  if (!result.ok) {
    return result;
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/clients/${clientId}/outreach`);

  return {
    ok: true,
    message:
      setting === "MACHINE"
        ? "Saved. The system may now send for this client on its own. Every other safety check still applies."
        : "Saved. Only a signed-in member of staff can send for this client.",
  };
}
