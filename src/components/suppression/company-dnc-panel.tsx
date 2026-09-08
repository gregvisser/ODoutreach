"use client";

import { useRef, useState } from "react";
import { importCompanyDncAction, reviewCompanyDncAction, retryCompanyDncHoldAction } from "@/app/(app)/clients/company-dnc-actions";
import type { loadCompanyDncPage } from "@/server/suppression/company-names";
import { previewCompanyNameImport } from "@/lib/suppression/company-name-import";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MissingCompanyForm } from "./missing-company-form";
import { refreshCompanyContactChecksAction } from "@/app/(app)/clients/contact-company-actions";

type CompanyPage = Awaited<ReturnType<typeof loadCompanyDncPage>>;
export function CompanyDncPanel({ clientId, data: serverData }: { clientId: string; data: CompanyPage }) {
  const [savedPage, setSavedPage] = useState<{ base: CompanyPage; value: CompanyPage } | null>(null);
  // A newer server render wins; until it arrives, show the authenticated save result.
  const data = savedPage?.base === serverData ? savedPage.value : serverData;
  const pageFields = { page: data.page, heldPage: data.heldPage };
  const [text, setText] = useState("");
  const [format, setFormat] = useState<"text" | "csv">("text");
  const [previewed, setPreviewed] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const preview = previewed ? previewCompanyNameImport(text, format) : null;
  async function run(action: () => Promise<{ ok: boolean; error?: string; message?: string; data?: CompanyPage }>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      const result = await action();
      if (result.ok && result.data) setSavedPage({ base: serverData, value: result.data });
      setMessage(result.ok ? result.message ?? "Saved." : result.error ?? "Could not save.");
    } catch {
      setMessage("Could not confirm the result. Refresh the page before trying again.");
    } finally {
      // Request completion must release the form even when a route refresh is
      // still streaming. The ref also closes the same-frame double-click gap.
      inFlight.current = false;
      setPending(false);
    }
  }
  return <section className="space-y-5 rounded-xl border p-5" aria-label="Company-name do-not-contact">
    <div><h2 className="text-lg font-semibold">Block company names</h2>
      <p className="text-sm text-muted-foreground">Add names for this client only. Exact names block outreach; similar names wait for review. Contacts without a company also wait when this list is in use. Existing email and domain blocks still apply.</p></div>
    <div className="space-y-2">
      <Label htmlFor="company-dnc-names">Company names — one per line, no heading</Label>
      <Textarea id="company-dnc-names" value={text} disabled={pending} onChange={event => { setText(event.target.value); setFormat("text"); setPreviewed(false); }} />
      <Label htmlFor="company-dnc-file">Or choose a one-column CSV (no heading)</Label>
      <input id="company-dnc-file" type="file" accept=".csv,text/csv" disabled={pending} onChange={async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > 1_000_000) { setMessage("Choose a CSV smaller than 1 MB."); return; }
        try { setText(await file.text()); setFormat("csv"); setPreviewed(false); } catch { setMessage("Could not read that file."); }
      }} />
      <Button type="button" variant="outline" disabled={pending} onClick={() => setPreviewed(true)}>Preview company list</Button>
      {preview && <div className="space-y-2">
        <p>{preview.entries.length} distinct names; {preview.duplicates} repeated names. Existing entries will be kept.</p>
        {preview.errors.length ? <p role="alert">{preview.errors.slice(0, 5).map(error => `Row ${error.row}: ${error.message}`).join(" ")}</p> : <>
          <ul className="list-disc pl-5">{preview.entries.slice(0, 10).map(entry => <li key={entry.canonicalName}>{entry.originalName}</li>)}</ul>
          {preview.entries.length > 10 && <p>Showing the first 10 names of {preview.entries.length}.</p>}
          <Button type="button" disabled={pending} onClick={() => run(() => importCompanyDncAction({ clientId, text, format, ...pageFields }))}>Add company names</Button>
        </>}
      </div>}
    </div>
    {message && <p role="status">{message}</p>}
    <details><summary>{data.entryTotal} company names listed</summary>
      <ul className="list-disc pl-5">{data.entries.map(entry => <li key={entry.id}>{entry.originalName}</li>)}</ul>
      {data.entryTotal > data.entries.length && <p>Showing the first {data.entries.length} of {data.entryTotal}. All listed names are checked before sending.</p>}
    </details>
    {data.entryTotal > 0 && <div className="space-y-3">
      <h3 className="font-semibold">Contacts blocked or waiting for review</h3>
      <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => refreshCompanyContactChecksAction({ clientId, ...pageFields }))}>Refresh contact checks</Button>
      <p className="text-sm">Checked contacts {data.totalContacts ? data.page * data.pageSize + 1 : 0}–{data.page * data.pageSize + data.checkedContacts} of {data.totalContacts}. Company-name results only; other blocks can still apply.</p>
      {!data.contacts.length && <p>No company-name holds on this page.</p>}
      {data.contacts.map(contact => <div key={contact.id} role="group" aria-label={`Contact review: ${contact.fullName || contact.email || contact.id}`} className="space-y-2 rounded border p-3">
        <p className="font-medium">{contact.fullName || contact.email || "Contact"} — {contact.company || "Company missing"}</p>
        <p>{contact.decision.outcome === "BLOCK" ? "Blocked" : "Needs review"}</p>
        {!contact.company?.trim() && <MissingCompanyForm clientId={clientId} contactId={contact.id} {...pageFields} disabled={pending} onSaved={(next, notice) => { setSavedPage({ base: serverData, value: next }); setMessage(notice); }} />}
        {contact.matches.map(entry => <div key={entry.id} className="flex flex-wrap items-center gap-2">
          <span>Listed name: {entry.originalName}</span>
          {contact.decision.outcome === "REVIEW" && contact.company && <>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => reviewCompanyDncAction({ clientId, ...pageFields, contactId: contact.id, company: contact.company!, entryId: entry.id, outcome: "BLOCK" }))}>Same company — block</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => reviewCompanyDncAction({ clientId, ...pageFields, contactId: contact.id, company: contact.company!, entryId: entry.id, outcome: "ALLOW" }))}>Different company — allow this match</Button>
          </>}
        </div>)}
      </div>)}
      <nav aria-label="Company review pages" className="flex gap-4">
        {data.page > 0 && <a className="underline" href={`?companyPage=${data.page - 1}`}>Previous contacts</a>}
        {(data.page + 1) * data.pageSize < data.totalContacts && <a className="underline" href={`?companyPage=${data.page + 1}`}>Next contacts</a>}
      </nav>
    </div>}
    {data.heldTotal > 0 && <div className="space-y-2">
      <h3 className="font-semibold">Emails held for company review</h3>
      <p>Showing held emails {data.heldPage * data.pageSize + 1}–{data.heldPage * data.pageSize + data.heldEmails.length} of {data.heldTotal}. After resolving a hold, retry the email here. It will pass all current sending checks again.</p>
      {data.heldEmails.map(email => <div key={email.id} className="flex flex-wrap items-center gap-3"><span>{email.toEmail} — {email.subject}</span><Button variant="outline" disabled={pending} onClick={() => run(() => retryCompanyDncHoldAction({ clientId, ...pageFields, outboundEmailId: email.id }))}>Retry held email</Button></div>)}
      <nav aria-label="Held company email pages" className="flex gap-4">
        {data.heldPage > 0 && <a className="underline" href={`?companyPage=${data.page}&heldCompanyPage=${data.heldPage - 1}`}>Previous held emails</a>}
        {(data.heldPage + 1) * data.pageSize < data.heldTotal && <a className="underline" href={`?companyPage=${data.page}&heldCompanyPage=${data.heldPage + 1}`}>Next held emails</a>}
      </nav>
    </div>}
  </section>;
}
