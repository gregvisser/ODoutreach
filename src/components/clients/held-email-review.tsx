"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { approveHeldEmailAction } from "@/app/(app)/clients/held-email-actions";

type Email = { id: string; toEmail: string; fromAddress: string | null; subject: string | null; body: string | null; reviewToken: string; recentContacts?: { id: string; clientName: string; sentAt: string }[] };
export function HeldEmailReview({ clientId, email }: { clientId: string; email: Email }) {
  const busy = useRef(false);
  const [reviewed, setReviewed] = useState(false);
  const [pending, setPending] = useState(false);
  const [finished, setFinished] = useState(false);
  const [message, setMessage] = useState("");
  async function approve() {
    if (busy.current || finished || !reviewed) return;
    busy.current = true; setPending(true);
    try {
      const result = await approveHeldEmailAction({ clientId, outboundEmailId: email.id, reviewToken: email.reviewToken });
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
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} disabled={pending || finished} onChange={event => setReviewed(event.target.checked)} />I have reviewed the recipient and this email{email.recentContacts?.length ? ", including the recent contact from other clients" : ""}.</label>
    <Button disabled={!reviewed || pending || finished || !email.subject || !email.body} onClick={approve}>{pending ? "Queuing…" : finished ? "Refresh to check status" : "Approve and queue this email"}</Button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </article>;
}
