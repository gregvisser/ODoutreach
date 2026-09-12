"use client";

import { useRef, useState, type FormEvent } from "react";
import { cancelSendingCalendarAction, saveSendingCalendarAction } from "@/app/(app)/clients/sending-calendar-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CalendarSettingsSnapshot } from "@/lib/mailboxes/calendar-settings";
import type { SendingCalendar } from "@/lib/mailboxes/sending-calendar";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const time = (minute: number) => `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const minutes = (value: string) => /^\d{2}:\d{2}$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN;
function description(calendar: SendingCalendar) {
  return `${calendar.timeZone.replaceAll("_", " ")} · ${calendar.weekdays.map(day => DAYS[day]).join(", ")} · ${time(calendar.startMinute)}–${calendar.endMinute === 1440 ? "24:00" : time(calendar.endMinute)}`;
}

export function ClientSendingCalendarCard({ clientId, initial, timeZones, canMutate, hasMailbox }: {
  clientId: string; initial: CalendarSettingsSnapshot; timeZones: string[]; canMutate: boolean; hasMailbox: boolean;
}) {
  const [saved, setSaved] = useState<{ base: CalendarSettingsSnapshot; value: CalendarSettingsSnapshot } | null>(null);
  const current = saved?.base === initial ? saved.value : initial;
  const [timeZone, setTimeZone] = useState(initial.current?.timeZone ?? "");
  const [weekdays, setWeekdays] = useState(initial.current?.weekdays ?? [1, 2, 3, 4, 5]);
  const [start, setStart] = useState(time(initial.current?.startMinute ?? 540));
  const [end, setEnd] = useState(time(initial.current?.endMinute ?? 1020));
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  const pending = current.pending;
  const format = (iso: string, zone: string) => `${new Intl.DateTimeFormat("en-GB", { timeZone: zone, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso))} (${zone.replaceAll("_", " ")})`;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || pending || uncertain) return;
    if (!weekdays.length) { setNotice("Choose at least one sending day."); return; }
    const submitted = new FormData(event.currentTarget);
    const submittedStart = String(submitted.get("startTime") ?? "");
    const submittedEnd = String(submitted.get("endTime") ?? "");
    inFlight.current = true;
    setBusy(true);
    setNotice("");
    try {
      const result = await saveSendingCalendarAction(clientId, { timeZone, weekdays, startMinute: minutes(submittedStart), endMinute: minutes(submittedEnd) === 0 ? 1440 : minutes(submittedEnd) });
      if (result.ok) {
        setSaved({ base: initial, value: result.settings });
        setNotice("Calendar change scheduled. The activation time is shown below.");
      } else {
        setNotice(result.error);
        if ("uncertain" in result && result.uncertain) setUncertain(true);
      }
    } catch {
      setUncertain(true);
      setNotice("We could not confirm the calendar change. Refresh this page to check the saved calendar before trying again.");
    } finally { inFlight.current = false; setBusy(false); }
  }

  async function cancelPending() {
    if (!pending || inFlight.current || uncertain) return;
    inFlight.current = true; setBusy(true); setNotice("");
    try {
      const result = await cancelSendingCalendarAction(clientId, pending.effectiveAt);
      if (result.ok) { setSaved({ base: initial, value: result.settings }); setNotice("Pending change cancelled. The current schedule is unchanged."); }
      else { setNotice(result.error); if ("uncertain" in result && result.uncertain) setUncertain(true); }
    } catch { setUncertain(true); setNotice("We could not confirm cancellation. Refresh the calendar before trying again."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <Card className="border-border/80 shadow-sm" role="region" aria-label="Sending calendar">
    <CardHeader><CardTitle className="text-base">Sending calendar</CardTitle></CardHeader>
    <CardContent className="space-y-4 text-sm">
      <p>Choose when this client&apos;s outreach may leave each mailbox. Each mailbox still has a maximum of 30 total emails per sending day; warm-up can allow fewer. Staff replies can use remaining allowance outside these hours.</p>
      <p><strong>Current schedule:</strong> {current.current ? description(current.current) : "Standard weekday schedule; daily allowance resets at midnight UTC. No custom calendar is set."}</p>
      {notice ? <p role="status">{notice}</p> : null}
      {pending ? <div className="space-y-2 rounded-md border p-3">
        <p><strong>Scheduled calendar:</strong> {description(pending)}</p>
        <p><strong>Takes effect:</strong> {format(pending.effectiveAt, pending.timeZone)}</p>
        {pending.pauseStartsAt !== pending.effectiveAt ? <p>Outreach pauses from {format(pending.pauseStartsAt, pending.timeZone)} until activation. Replies share the old day&apos;s remaining allowance during this gap.</p> : null}
        <p>The current allowance is preserved. You can cancel this change before its transition starts.</p>
        {canMutate && <Button type="button" variant="outline" disabled={busy || uncertain} onClick={cancelPending}>{busy ? "Cancelling…" : "Cancel pending calendar change"}</Button>}
      </div> : null}
      {pending || uncertain ? <a className="underline" href={`/clients/${clientId}/mailboxes`}>Refresh calendar status</a> : null}
      {!canMutate ? <p>You cannot change this client&apos;s calendar.</p> : !hasMailbox ? <p>Add a sending mailbox before setting its calendar.</p> : !pending ? <form onSubmit={save} className="space-y-3">
        <fieldset disabled={busy || uncertain} className="space-y-3 disabled:opacity-60">
          <div>
            <label htmlFor={`calendar-timezone-${clientId}`} className="block">Timezone</label>
            <select id={`calendar-timezone-${clientId}`} required value={timeZone} onChange={event => setTimeZone(event.target.value)} className="mt-1 block w-full rounded-md border bg-background p-2">
              <option value="">Choose the client&apos;s timezone</option>
              {timeZones.map(zone => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}
            </select>
          </div>
          <fieldset><legend>Sending days</legend><div className="mt-2 flex flex-wrap gap-3">
            {[1, 2, 3, 4, 5, 6, 0].map(day => <label key={day} className="flex min-h-11 items-center gap-2"><input type="checkbox" className="size-6" checked={weekdays.includes(day)} onChange={event => setWeekdays(days => event.target.checked ? [...days, day].sort() : days.filter(value => value !== day))} />{DAYS[day]}</label>)}
          </div></fieldset>
          <div className="flex flex-wrap gap-4">
            <label>Start time<input name="startTime" type="time" required value={start} onChange={event => setStart(event.target.value)} className="ml-2 rounded-md border bg-background p-2" /></label>
            <label>End time<input name="endTime" type="time" required value={end} onChange={event => setEnd(event.target.value)} className="ml-2 rounded-md border bg-background p-2" /></label>
          </div>
          <p className="text-muted-foreground">Use one time range within a day. An end time of 00:00 means the end of that day. Changes start on a full day in the new timezone, which can briefly pause outreach and cannot create extra allowance.</p>
          <Button type="submit">{busy ? "Saving calendar…" : "Schedule calendar change"}</Button>
        </fieldset>
      </form> : null}
    </CardContent>
  </Card>;
}
