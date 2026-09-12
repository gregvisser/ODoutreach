"use client";
import { useState, useTransition } from "react";
import { saveResearchPlanAction } from "@/app/(app)/clients/research-plan-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ResearchCriteria } from "@/lib/prospect-research/qualification";
const labels = { titles: "Job titles", industries: "Industries", seniorities: "Seniority levels", regions: "Regions" };
export type SavedResearchPlanView = { id: string; name: string; maxLookups: number; createdAt: string; criteria: ResearchCriteria };
export function ResearchPlanPanel({ clientId, plans }: { clientId: string; plans: SavedResearchPlanView[] }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  return <section aria-label="Prospect research plans" className="space-y-4 rounded-xl border p-5">
    <h2 className="text-xl font-semibold">Prospect research plans</h2>
    <p>Save who to look for and a proposed lookup limit. These are drafts: saving does not search, spend credits, import contacts or send emails. Approval and automatic research are not yet available.</p>
    <form className="space-y-3" onSubmit={event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const criteria = Object.fromEntries(Object.keys(labels).map(key => [key, String(data.get(key) ?? "").split("\n").map(term => term.trim()).filter(Boolean)]));
      startTransition(async () => {
        const result = await saveResearchPlanAction(clientId, { name: String(data.get("name") ?? ""), criteria, maxLookups: Number(data.get("maxLookups")) });
        setMessage(result.ok ? "Research draft saved. No credits spent and no contacts imported." : result.error ?? "Could not save.");
        if (result.ok) form.reset();
      });
    }}>
      <label className="block">Plan name<Input name="name" required minLength={3} maxLength={120} /></label>
      <p>Enter one acceptable term per line in each field. Include regional aliases explicitly if needed. Missing evidence will require review.</p>
      <div className="grid gap-3 md:grid-cols-2">{Object.entries(labels).map(([key, label]) => <label className="block" key={key}>{label}<textarea name={key} required maxLength={2400} rows={3} className="block w-full rounded border p-2" /></label>)}</div>
      <label className="block">Proposed total lookups<Input name="maxLookups" type="number" required min={1} max={100} step={1} defaultValue={10} /></label>
      <p>This is a limit for this plan, not a price estimate or permission to spend.</p>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save research draft"}</Button>
      <p role="status">{message}</p>
    </form>
    <h3 className="font-semibold">Latest saved drafts (up to 20)</h3>
    {plans.length === 0 ? <p>No research plans saved yet.</p> : <ul className="space-y-3">{plans.map(plan => <li key={plan.id} className="rounded border p-3">
      <p className="font-medium">{plan.name} · Draft</p><p>Proposed total lookups: {plan.maxLookups} · Saved {plan.createdAt}</p>
      {Object.entries(labels).map(([key, label]) => <p key={key}>{label}: {plan.criteria[key as keyof ResearchCriteria].join("; ")}</p>)}
    </li>)}</ul>}
  </section>;
}
