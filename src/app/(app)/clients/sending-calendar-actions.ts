"use server";

import { revalidatePath } from "next/cache";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { cancelPendingSendingCalendar, scheduleClientSendingCalendar } from "@/server/mailbox/client-sending-calendar";
import type { CalendarSettingsSnapshot } from "@/lib/mailboxes/calendar-settings";

export async function saveSendingCalendarAction(clientId: string, value: unknown) {
  if (typeof clientId !== "string" || !clientId.trim() || clientId.length > 200) return { ok: false as const, error: "That client is not valid." };
  let staff;
  try { staff = await requireOpensDoorsStaff(); }
  catch { return { ok: false as const, error: "Sign in again before changing the sending calendar." }; }
  try {
    const result = await scheduleClientSendingCalendar(staff, clientId, value);
    if (!result.ok) return result;
    const revision = result.revision;
    const settings: CalendarSettingsSnapshot = {
      current: result.current,
      pending: { timeZone: revision.timeZone, weekdays: revision.weekdays, startMinute: revision.startMinute, endMinute: revision.endMinute, effectiveAt: revision.effectiveAt.toISOString(), pauseStartsAt: revision.previousDayEndsAt.toISOString() },
    };
    // The committed result is sufficient for the client to show success even
    // if refreshing another route fails or its RSC response is delayed.
    try { revalidatePath(`/clients/${clientId}/mailboxes`); revalidatePath(`/clients/${clientId}/activity`); } catch { /* Saved result remains authoritative. */ }
    return { ok: true as const, settings };
  } catch {
    return { ok: false as const, uncertain: true as const, error: "We could not confirm the calendar change. Refresh this page to check the saved calendar before trying again." };
  }
}

export async function cancelSendingCalendarAction(clientId: string, effectiveAt: string) {
  if (typeof clientId !== "string" || !clientId.trim() || clientId.length > 200 || typeof effectiveAt !== "string" || effectiveAt.length > 40) return { ok: false as const, error: "That calendar is not valid." };
  try {
    const staff = await requireOpensDoorsStaff();
    const result = await cancelPendingSendingCalendar(staff, clientId, effectiveAt);
    if (result.ok) { try { revalidatePath(`/clients/${clientId}/mailboxes`); } catch { /* Committed result is authoritative. */ } }
    return result;
  } catch { return { ok: false as const, error: "We could not confirm cancellation. Refresh the calendar before trying again.", uncertain: true as const }; }
}
