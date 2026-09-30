"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveResearchPlanAction } from "@/app/(app)/clients/research-plan-actions";
import { runResearchPlanIntoListAction } from "@/app/(app)/clients/research-plan-run-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROCKETREACH_INDUSTRY_GROUPS } from "@/lib/clients/rocketreach-industries";
import { ROCKETREACH_IMPORT_CONFIRMATION_PHRASE } from "@/lib/clients/rocketreach-import-safety";
import { rocketReachClickCostEstimate } from "@/lib/clients/rocketreach-credit-estimate";
import type { ResearchCriteria } from "@/lib/prospect-research/qualification";
const labels = { titles: "Job titles", industries: "Industries", seniorities: "Seniority levels", regions: "Regions" };
export type SavedResearchPlanView = {
  id: string;
  name: string;
  maxLookups: number;
  createdAt: string;
  criteria: ResearchCriteria;
  lastRun: string | null;
};
export function ResearchPlanPanel({ clientId, plans, lists }: { clientId: string; plans: SavedResearchPlanView[]; lists: { id: string; name: string }[] }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [currentIndustry, setCurrentIndustry] = useState("");
  const [keptIndustries, setKeptIndustries] = useState<string[]>([]);
  const chosenIndustries = [currentIndustry, ...keptIndustries].filter(Boolean);
  function chooseIndustry(next: string) {
    if (!next || next === currentIndustry) return;
    setKeptIndustries(kept => (
      currentIndustry && !kept.includes(currentIndustry)
        ? [...kept.filter(name => name !== next), currentIndustry]
        : kept.filter(name => name !== next)
    ));
    setCurrentIndustry(next);
  }
  function removeIndustry(name: string) {
    if (name === currentIndustry) {
      const [promoted, ...rest] = keptIndustries;
      setCurrentIndustry(promoted ?? "");
      setKeptIndustries(rest);
      return;
    }
    setKeptIndustries(kept => kept.filter(item => item !== name));
  }
  return <section aria-label="Prospect research plans" className="space-y-4 rounded-xl border p-5">
    <h2 className="text-xl font-semibold">Prospect research plans</h2>
    <Link href={`/clients/${clientId}/research-review`} prefetch={false} className="underline">Review research candidates</Link>
    <p>Save who to look for and a lookup limit. Saving a draft does not search, spend credits, import contacts or send emails. Running a plan into a list uses the same RocketReach search, the same confirmation phrase, and the same cap of 10 as the search card below. It does not enrol anyone and it does not send email.</p>
    <form className="space-y-3" onSubmit={event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const lineField = (key: string) => String(data.get(key) ?? "").split("\n").map(term => term.trim()).filter(Boolean);
      const criteria = {
        titles: lineField("titles"),
        industries: data.getAll("industries").map(value => String(value).trim()).filter(Boolean),
        seniorities: lineField("seniorities"),
        regions: lineField("regions"),
      };
      startTransition(async () => {
        const result = await saveResearchPlanAction(clientId, { name: String(data.get("name") ?? ""), criteria, maxLookups: Number(data.get("maxLookups")) });
        setMessage(result.ok ? "Research draft saved. No credits spent and no contacts imported." : result.error ?? "Could not save.");
        if (result.ok) {
          setCurrentIndustry("");
          setKeptIndustries([]);
          form.reset();
        }
      });
    }}>
      <label className="block">Plan name<Input name="name" required minLength={3} maxLength={120} /></label>
      <p>Enter one job title or region per line. Seniority is optional. Industries are chosen from the RocketReach list — the same names as the RocketReach card. A name that is not on that list cannot be saved. Saving does not search or spend credits.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">Job titles<textarea name="titles" required maxLength={2400} rows={3} className="block w-full rounded border p-2" /></label>
        <label className="block">Seniority levels<textarea name="seniorities" maxLength={2400} rows={3} className="block w-full rounded border p-2" /></label>
        <label className="block">Regions<textarea name="regions" required maxLength={2400} rows={3} className="block w-full rounded border p-2" /></label>
        <div className="space-y-1.5">
          <label htmlFor="research-plan-industries" className="block">Industries</label>
          <select id="research-plan-industries" name="industries" required value={currentIndustry} onChange={event => chooseIndustry(event.target.value)} className="block h-9 w-full rounded border bg-background px-2">
            <option value="">Choose an industry</option>
            {ROCKETREACH_INDUSTRY_GROUPS.map(group => <optgroup key={group.category} label={group.category}>{group.industries.map(name => <option key={name} value={name}>{name}</option>)}</optgroup>)}
          </select>
          {keptIndustries.map(name => <input key={name} type="hidden" name="industries" value={name} />)}
          {chosenIndustries.length > 0 ? <ul className="space-y-1 text-sm">{chosenIndustries.map(name => <li key={name}>{name} <button type="button" className="underline" onClick={() => removeIndustry(name)}>Remove {name}</button></li>)}</ul> : null}
          <p className="text-xs text-muted-foreground">Choose a name from the RocketReach list. Pick another to add it. A name that is not on the list cannot be saved.</p>
        </div>
      </div>
      <label className="block">Proposed total lookups<Input name="maxLookups" type="number" required min={1} max={100} step={1} defaultValue={10} /></label>
      <p>This is a limit for this plan, not a price estimate or permission to spend.</p>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save research draft"}</Button>
      <p role="status">{message}</p>
    </form>
    <h3 className="font-semibold">Latest saved drafts (up to 20)</h3>
    {plans.length === 0 ? <p>No research plans saved yet.</p> : <ul className="space-y-3">{plans.map(plan => <PlanRunRow key={plan.id} clientId={clientId} plan={plan} lists={lists} />)}</ul>}
  </section>;
}

function PlanRunRow({ clientId, plan, lists }: { clientId: string; plan: SavedResearchPlanView; lists: { id: string; name: string }[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const cap = Math.min(plan.maxLookups, 10);
  const cost = rocketReachClickCostEstimate(cap);
  return <li className="rounded border p-3 space-y-2">
    <p className="font-medium">{plan.name} · Draft</p>
    <p>Proposed total lookups: {plan.maxLookups} · Saved {plan.createdAt}</p>
    {Object.entries(labels).map(([key, label]) => <p key={key}>{label}: {plan.criteria[key as keyof ResearchCriteria].join("; ")}</p>)}
    {plan.lastRun ? <p>Last run: {plan.lastRun}</p> : <p>No runs yet.</p>}
    <form className="space-y-2" onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      startTransition(async () => {
        const result = await runResearchPlanIntoListAction({
          clientId,
          planId: plan.id,
          existingListId: String(data.get("existingListId") ?? "") || undefined,
          newListName: String(data.get("newListName") ?? "") || undefined,
          confirmationPhrase: String(data.get("confirmationPhrase") ?? ""),
        });
        setMessage(result.ok
          ? `Done — saved ${String(result.imported)} people to “${result.contactListName}”. Credits used: ${String(result.creditsUsed)}. Skipped: already known ${String(result.skippedAlreadyKnown)}, no email ${String(result.skippedNoEmail)}, invalid ${String(result.skippedInvalid)}, duplicate ${String(result.skippedDuplicate)}.`
          : result.error);
        if (result.ok) router.refresh();
      });
    }}>
      <p>{cost.headline} This run looks up at most {String(cap)} people.</p>
      <label className="block">Use existing list
        <select name="existingListId" className="block w-full rounded border p-2" defaultValue="">
          <option value="">None (create a new list)</option>
          {lists.map(list => <option key={list.id} value={list.id}>{list.name}</option>)}
        </select>
      </label>
      <label className="block">Or create a new list<Input name="newListName" maxLength={120} /></label>
      <label className="block">Confirmation phrase<Input name="confirmationPhrase" autoComplete="off" placeholder={ROCKETREACH_IMPORT_CONFIRMATION_PHRASE} required /></label>
      <Button type="submit" disabled={pending}>{pending ? "Running…" : "Run plan into list"}</Button>
      <p role="status">{message}</p>
    </form>
  </li>;
}
