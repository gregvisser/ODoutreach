"use client";
import { useRef, useState } from "react";
import type { CompanySheetStatus } from "@/lib/suppression/company-sheet-status";
import { saveCompanySheetAction, syncCompanySheetAction } from "@/app/(app)/clients/company-sheet-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { extractGoogleSpreadsheetId } from "@/lib/spreadsheet-url";

export function CompanySheetCard({ clientId, source: initial }: { clientId: string; source: CompanySheetStatus | null }) {
  const [confirmation, setConfirmation] = useState<{ base: CompanySheetStatus | null; source: CompanySheetStatus | null } | null>(null);
  const source = confirmation?.base === initial ? confirmation.source : initial;
  const [url, setUrl] = useState(initial ? `https://docs.google.com/spreadsheets/d/${initial.spreadsheetId}/edit` : "");
  const [tabName, setTabName] = useState(initial?.tabName ?? "Sheet1");
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  const unsaved = !source || extractGoogleSpreadsheetId(url) !== source.spreadsheetId || tabName.trim() !== source.tabName;
  async function run(kind: "save" | "sync") {
    if (busy.current || uncertain) return;
    busy.current = true; setPending(true);
    try {
      const result = kind === "save" ? await saveCompanySheetAction({ clientId, urlOrId: url, tabName }) : await syncCompanySheetAction(clientId);
      if ("source" in result) setConfirmation({ base: initial, source: result.source ?? null });
      if (result.ok) setMessage(result.message);
      else { setMessage(result.error); setUncertain(result.uncertain); }
    } catch {
      setMessage("The response was interrupted. Refresh the sheet status before trying again.");
      setUncertain(true);
    } finally { busy.current = false; setPending(false); }
  }
  return <section aria-label="Company-name Google Sheet" className="space-y-4 rounded-lg border p-4">
    <div><h2 className="text-lg font-semibold">Company-name Google Sheet</h2>
      <p className="text-sm text-muted-foreground">Connect this client&apos;s company names in column A, one per row, with no heading. Blank rows are fine. Use the Share your Sheet help below to give our Google account Viewer access.</p></div>
    <div className="grid gap-2"><Label htmlFor="company-sheet-url">Company Sheet URL</Label><Input id="company-sheet-url" value={url} onChange={event => setUrl(event.target.value)} disabled={pending || uncertain} /></div>
    <div className="grid gap-2"><Label htmlFor="company-sheet-tab">Company Sheet tab name</Label><Input id="company-sheet-tab" value={tabName} onChange={event => setTabName(event.target.value)} disabled={pending || uncertain} /></div>
    <p className="text-sm">Removing a name from the sheet does not remove its existing block. Manual company names and email/domain blocks stay in place.</p>
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => void run("save")} disabled={pending || uncertain || !url.trim() || !tabName.trim()}>Save company sheet</Button>
      <Button variant="secondary" onClick={() => void run("sync")} disabled={pending || uncertain || !source || unsaved}>Sync company names now</Button>
      <a className="inline-flex min-h-10 items-center underline" href={`/clients/${clientId}/suppression`}>Refresh sheet status</a>
    </div>
    {source && unsaved ? <p className="text-sm">Save the changed connection before syncing it.</p> : null}
    {pending ? <p role="status">Working on the company sheet…</p> : message ? <p role="status">{message}</p> : null}
    {source ? <div className="space-y-1 text-sm">
      <p>Saved tab: {source.tabName}, column A.</p>
      <p>{source.lastSuccessAt ? `Last successful sync: ${new Date(source.lastSuccessAt).toISOString().replace("T", " ").slice(0, 19)} UTC. ${source.currentCount} names read.` : "This connection has not completed a successful sync."}</p>
      {source.lastError ? <p className="text-destructive">Last attempt failed: {source.lastError}</p> : null}
      {source.retainedCount > 0 ? <p>{source.retainedCount} names absent from the sheet remain blocked.</p> : null}
    </div> : <p className="text-sm">No company-name sheet connected.</p>}
  </section>;
}
