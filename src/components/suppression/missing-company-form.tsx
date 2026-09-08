"use client";
import { useRef, useState } from "react";
import { setMissingContactCompanyAction } from "@/app/(app)/clients/contact-company-actions";
import type { loadCompanyDncPage } from "@/server/suppression/company-names";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CompanyPage = Awaited<ReturnType<typeof loadCompanyDncPage>>;
export function MissingCompanyForm({ clientId, contactId, page, heldPage, disabled, onSaved }: { clientId: string; contactId: string; page: number; heldPage: number; disabled: boolean; onSaved: (data: CompanyPage, message: string) => void }) {
  const [company, setCompany] = useState("");
  const [pending, setPending] = useState(false);
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  async function save() {
    if (busy.current || locked || disabled || !company.trim()) return;
    busy.current = true; setPending(true);
    try {
      const result = await setMissingContactCompanyAction({ clientId, contactId, company, page, heldPage });
      if (result.ok) onSaved(result.data, result.message);
      else { setMessage(result.error); setLocked(true); }
    } catch { setMessage("We could not confirm the employer save. Refresh this page before trying again."); setLocked(true); }
    finally { busy.current = false; setPending(false); }
  }
  return <div className="space-y-2" role="group" aria-label="Add missing employer">
    <p className="text-sm">Enter the employer you have verified for this person. Do not guess from their email address. Saving checks the company list; it does not approve an email.</p>
    <label className="block text-sm" htmlFor={`employer-${contactId}`}>Employer company name</label>
    <Input id={`employer-${contactId}`} maxLength={300} value={company} disabled={disabled || pending || locked} onChange={event => setCompany(event.target.value)} />
    <Button type="button" disabled={disabled || pending || locked || !company.trim()} onClick={save}>{pending ? "Saving employer…" : "Save employer and check"}</Button>
    {message && <p role="status">{message}</p>}
    {locked && <a className="block underline" href={`/clients/${clientId}/suppression?companyPage=${page}&heldCompanyPage=${heldPage}`}>Refresh company review</a>}
  </div>;
}
