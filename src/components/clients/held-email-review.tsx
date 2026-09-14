"use client";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { approveHeldEmailAction } from "@/app/(app)/clients/held-email-actions";
import { isValidStaffScheduledTime, ukScheduledTimeToIso } from "@/lib/email-sequences/staff-scheduled-time";

type Email = { id: string; toEmail: string; fromAddress: string | null; subject: string | null; body: string | null; reviewToken: string; recentContacts?: { id: string; clientName: string; sentAt: string }[] };
export function HeldEmailReview({ clientId, email }: { clientId: string; email: Email }) {
  const scheduleId = useId();
  const busy = useRef(false);
  const [reviewed, setReviewed] = useState(false);
  const [pending, setPending] = useState(false);
  const [finished, setFinished] = useState(false);
  const [message, setMessage] = useState("");
  const [schedule, setSchedule] = useState(false);
  const [wallTime, setWallTime] = useState("");
  const scheduledIso = schedule ? ukScheduledTimeToIso(wallTime) : null;
  const invalidSchedule = schedule && (!scheduledIso || !isValidStaffScheduledTime(scheduledIso));
  async function approve() {
    if (busy.current || finished || !reviewed || invalidSchedule) return;
    busy.current = true; setPending(true);
    try {
      const result = await approveHeldEmailAction({ clientId, outboundEmailId: email.id, reviewToken: email.reviewToken, ...(schedule && scheduledIso ? { notBeforeIso: scheduledIso } : {}) });
      setMessage(result.ok ? result.message : result.error);
      // Refresh after any attempt; a missing acknowledgement must not invite a retry.
      setFinished(true);
    } catch { setMessage("We could not confirm the result. Refresh this page before doing anything else."); setFinished(true); }
    finally { setPending(false); busy.current = false; }
  }
  return <article aria-label={`Review email to ${email.toEmail}`} className="space-y-4 rounded-lg border p-4">
    <div className="break-words"><p><strong>To:</strong> {email.toEmail}</p><p><strong>From:</strong> {email.fromAddress ?? "Assigned sending mailbox"}</p></div>
    <h2 className="break-words font-semibold">{email.subject ?? "Missing subject"}</h2>
    {!!email.recentContacts?.length && <div className="rounded border p-3">
      <p className="font-semibold">Recent contact from another client</p>
      <p>Check whether another email is appropriate before approving this send.</p>
      <ul>{email.recentContacts.map(contact => <li key={contact.id}>{contact.clientName} — {contact.sentAt.slice(0, 16).replace("T", " ")} UTC</li>)}</ul>
    </div>}
    <pre className="whitespace-pre-wrap break-words font-sans text-sm">{email.body ?? "Missing email body"}</pre>
    <p className="text-sm text-muted-foreground">The standard sender signature and unsubscribe details are added when sent.</p>
    <div className="text-sm"><label htmlFor={scheduleId}>Sending time</label><select id={scheduleId} className="block rounded border p-2" value={schedule ? "later" : "next"} disabled={pending || finished} onChange={event => { setSchedule(event.target.value === "later"); setReviewed(false); }}><option value="next">Next allowed sending time</option><option value="later">Choose a later sending time</option></select></div>
    {schedule && <div className="space-y-2 text-sm">
      <label className="block">Earliest sending time — UK (Europe/London)<input type="datetime-local" className="block rounded border p-2" value={wallTime} disabled={pending || finished} onChange={event => { setWallTime(event.target.value); setReviewed(false); }} /></label>
      {invalidSchedule ? <p>Choose a valid future UK time within the next 30 days.</p> : <p>Earliest attempt: {wallTime.replace("T", " ")} UK (Europe/London), {scheduledIso} UTC.</p>}
      <p>The normal worker will try from this time. Sending hours, allowances and safety checks may delay it further.</p>
    </div>}
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} disabled={pending || finished} onChange={event => setReviewed(event.target.checked)} />I have reviewed the recipient and this email{email.recentContacts?.length ? ", including the recent contact from other clients" : ""}.</label>
    <Button disabled={!reviewed || invalidSchedule || pending || finished || !email.subject || !email.body} onClick={approve}>{pending ? "Queuing…" : finished ? "Refresh to check status" : "Approve and queue this email"}</Button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </article>;
}
