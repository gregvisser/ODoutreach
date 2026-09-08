"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SERVICE_TIERS, SERVICE_TIER_LABELS, type ServiceTier, type ServiceTierSnapshot } from "@/lib/clients/service-tier";
import { setClientServiceTierAction } from "@/app/(app)/clients/service-tier-actions";

export function ClientServiceTierCard({ clientId, initial }: { clientId: string; initial: ServiceTierSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [choice, setChoice] = useState<ServiceTier | "">(initial.tier ?? "");
  const [pending, setPending] = useState(false);
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  async function save() {
    if (!choice || busy.current || locked) return;
    busy.current = true; setPending(true);
    try {
      const result = await setClientServiceTierAction({ clientId, tier: choice, expectedRevision: snapshot.revision });
      if (result.ok) { setSnapshot(result.snapshot); setMessage("Customer grade saved. Refresh to see the current sending controls."); }
      else setMessage(result.error);
      setLocked(true);
    } catch { setMessage("We could not confirm the grade change. Refresh this page before trying again."); setLocked(true); }
    finally { busy.current = false; setPending(false); }
  }
  return <section aria-label="Customer grade" className="space-y-3 rounded-lg border p-4">
    <h2 className="font-semibold">Customer grade</h2>
    <p className="text-sm">Record the service level agreed with this client. Choosing Strategic turns automatic sending off; held follow-ups need human review in Email approvals. Changing the grade later does not turn automatic sending back on.</p>
    <p><strong>Current grade:</strong> {snapshot.tier ? SERVICE_TIER_LABELS[snapshot.tier] : "Not set"}</p>
    {snapshot.tier === "STRATEGIC" && <p className="text-sm">Automatic follow-ups are paused for this client. You can still send manually after reviewing the email.</p>}
    {snapshot.setAt ? <p className="text-sm">Set by {snapshot.setByName ?? "a former staff member"} on {new Date(snapshot.setAt).toLocaleString("en-GB", { timeZone: "Europe/London" })} (UK time).</p> : <p className="text-sm">No customer grade has been chosen yet.</p>}
    <label htmlFor={`customer-grade-${clientId}`} className="block text-sm">Choose customer grade</label>
      <select id={`customer-grade-${clientId}`} className="mt-1 block w-full rounded border bg-background p-2" value={choice} disabled={pending || locked} onChange={event => setChoice(event.target.value as ServiceTier | "")}>
        <option value="">Choose a grade</option>
        {SERVICE_TIERS.map(tier => <option key={tier} value={tier}>{SERVICE_TIER_LABELS[tier]}</option>)}
      </select>
    <Button disabled={!choice || choice === snapshot.tier || pending || locked} onClick={save}>{pending ? "Saving…" : "Save customer grade"}</Button>
    {message && <p role="status" className="text-sm">{message}</p>}
    {locked && <a className="block text-sm underline" href={`/clients/${clientId}`}>Refresh customer grade</a>}
  </section>;
}
