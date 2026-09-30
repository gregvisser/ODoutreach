"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { startAiCampaignAction } from "@/app/(app)/clients/[clientId]/outreach/ai-campaign-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { proposeAudienceFromBrief } from "@/lib/ai-campaigns/audience";
import { aiCampaignPlanSummary, companySizeLabel } from "@/lib/ai-campaigns/copy";
import { AI_CAMPAIGN_CONFIRMATION_PHRASE } from "@/lib/ai-campaigns/policy";
import { ROCKETREACH_INDUSTRY_GROUPS } from "@/lib/clients/rocketreach-industries";
import type { AiCampaignListItem } from "@/lib/ai-campaigns/view";

const INDUSTRIES = ROCKETREACH_INDUSTRY_GROUPS.flatMap((group) => group.industries);

function lines(value: string): string[] {
  return value.split(/[\n,]/).map((line) => line.trim()).filter((line) => line.length > 0);
}

function appendLine(current: string, next: string): string {
  const existing = lines(current);
  if (existing.some((line) => line.toLocaleLowerCase("en-GB") === next.toLocaleLowerCase("en-GB"))) {
    return current;
  }
  return existing.length === 0 ? next : `${current.trim()}\n${next}`;
}

export function CreateAiCampaignPanel({
  clientId,
  canControl,
  clientStatus,
  killSwitchOn,
  prefillBrief,
  knownJobTitles,
  knownIndustries,
  campaigns,
  openCampaignId,
  error,
}: {
  clientId: string;
  canControl: boolean;
  clientStatus: string;
  killSwitchOn: boolean;
  prefillBrief: string;
  knownJobTitles: string[];
  knownIndustries: string[];
  campaigns: AiCampaignListItem[];
  openCampaignId: string | null;
  error: string | null;
}) {
  const [brief, setBrief] = useState(prefillBrief);
  const [jobTitles, setJobTitles] = useState(knownJobTitles.join("\n"));
  const [countries, setCountries] = useState("");
  const [industries, setIndustries] = useState("");
  const [seniorities, setSeniorities] = useState("");
  const [companySizeMin, setCompanySizeMin] = useState("");
  const [companySizeMax, setCompanySizeMax] = useState("");
  const [targetContactCount, setTargetContactCount] = useState("25");
  const [creditBudgetTotal, setCreditBudgetTotal] = useState("50");
  const [creditBudgetPerDay, setCreditBudgetPerDay] = useState("10");
  const [endsAt, setEndsAt] = useState("");

  const summary = useMemo(() => {
    const min = companySizeMin.trim() ? Number(companySizeMin) : null;
    const max = companySizeMax.trim() ? Number(companySizeMax) : null;
    const target = Number(targetContactCount);
    const total = Number(creditBudgetTotal);
    const daily = Number(creditBudgetPerDay);
    return aiCampaignPlanSummary({
      targetContactCount: Number.isFinite(target) ? target : 0,
      creditBudgetTotal: Number.isFinite(total) ? total : 0,
      creditBudgetPerDay: Number.isFinite(daily) ? daily : 0,
      endsAtLabel: endsAt || null,
      companySizeLabel: companySizeLabel(
        min !== null && Number.isFinite(min) ? min : null,
        max !== null && Number.isFinite(max) ? max : null,
      ),
    });
  }, [companySizeMax, companySizeMin, creditBudgetPerDay, creditBudgetTotal, endsAt, targetContactCount]);

  function suggest(): void {
    const suggestion = proposeAudienceFromBrief({
      briefText: brief,
      knownJobTitles,
      knownIndustries,
      rocketReachIndustries: INDUSTRIES,
    });
    if (suggestion.jobTitles.length > 0) setJobTitles(suggestion.jobTitles.join("\n"));
    if (suggestion.countries.length > 0) setCountries(suggestion.countries.join("\n"));
    if (suggestion.industries.length > 0) setIndustries(suggestion.industries.join("\n"));
    if (suggestion.seniorities.length > 0) setSeniorities(suggestion.seniorities.join("\n"));
  }

  const formOpen = canControl && killSwitchOn && clientStatus === "ACTIVE" && !openCampaignId;

  return (
    <section id="create-ai-campaign" aria-label="Create AI campaign" className="space-y-4 rounded-xl border border-border/80 bg-card p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Create AI campaign</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          One confirmation starts the whole outreach. The machine finds people, adds the ones who can be emailed, writes the emails, checks them, and sends them. You do not open Review recipients. You handle replies. The client is not asked to approve anything.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {campaigns.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <Link prefetch={false} className="underline" href={`/clients/${clientId}/outreach/ai-campaigns/${campaign.id}`}>
                {campaign.name}
              </Link>
              {" — "}
              {campaign.statusLabel}
            </li>
          ))}
        </ul>
      ) : null}

      {!canControl ? (
        <p className="text-sm">You can read an AI campaign. Starting, pausing, and stopping one needs a staff role that can run outreach.</p>
      ) : null}
      {canControl && !killSwitchOn ? (
        <p className="text-sm">AI campaigns are switched off, so nothing can be started.</p>
      ) : null}
      {canControl && killSwitchOn && clientStatus !== "ACTIVE" ? (
        <p className="text-sm">This client is not Active, so an AI campaign cannot start.</p>
      ) : null}
      {openCampaignId ? (
        <p className="text-sm">
          An AI campaign is already in progress.{" "}
          <Link prefetch={false} className="underline" href={`/clients/${clientId}/outreach/ai-campaigns/${openCampaignId}`}>
            Open it
          </Link>
          . Finish or stop it before starting another.
        </p>
      ) : null}

      {formOpen ? (
        <form action={startAiCampaignAction} className="space-y-4">
          <input type="hidden" name="clientId" value={clientId} />
          <label className="block space-y-1 text-sm" htmlFor="ai-campaign-brief">
            Who to contact, and the offer
            <Textarea id="ai-campaign-brief" name="brief" required minLength={20} value={brief} onChange={(event) => setBrief(event.target.value)} />
          </label>
          <Button type="button" variant="secondary" onClick={suggest}>Suggest filters from the brief</Button>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1 text-sm" htmlFor="ai-campaign-titles">
              Job titles, one per line
              <Textarea id="ai-campaign-titles" name="jobTitles" required value={jobTitles} onChange={(event) => setJobTitles(event.target.value)} />
            </label>
            <label className="block space-y-1 text-sm" htmlFor="ai-campaign-countries">
              Countries, one per line
              <Textarea id="ai-campaign-countries" name="countries" required value={countries} onChange={(event) => setCountries(event.target.value)} />
            </label>
            <label className="block space-y-1 text-sm" htmlFor="ai-campaign-industries">
              Industries from the RocketReach list, one per line
              <Textarea id="ai-campaign-industries" name="industries" required value={industries} onChange={(event) => setIndustries(event.target.value)} />
            </label>
            <label className="block space-y-1 text-sm" htmlFor="ai-campaign-industry-add">
              Add an industry
              <select
                id="ai-campaign-industry-add"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                defaultValue=""
                onChange={(event) => {
                  if (!event.target.value) return;
                  setIndustries((current) => appendLine(current, event.target.value));
                  event.target.value = "";
                }}
              >
                <option value="">Choose from the RocketReach list</option>
                {INDUSTRIES.map((industry) => (
                  <option key={industry} value={industry}>{industry}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-sm" htmlFor="ai-campaign-seniorities">
              Seniority, optional, one per line
              <Textarea id="ai-campaign-seniorities" name="seniorities" value={seniorities} onChange={(event) => setSeniorities(event.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1 text-sm" htmlFor="ai-campaign-size-min">
                Smallest company, optional
                <Input id="ai-campaign-size-min" name="companySizeMin" inputMode="numeric" value={companySizeMin} onChange={(event) => setCompanySizeMin(event.target.value)} />
              </label>
              <label className="block space-y-1 text-sm" htmlFor="ai-campaign-size-max">
                Largest company, optional
                <Input id="ai-campaign-size-max" name="companySizeMax" inputMode="numeric" value={companySizeMax} onChange={(event) => setCompanySizeMax(event.target.value)} />
              </label>
            </div>
            <label className="block space-y-1 text-sm" htmlFor="ai-campaign-target">
              People to contact
              <Input id="ai-campaign-target" name="targetContactCount" inputMode="numeric" required value={targetContactCount} onChange={(event) => setTargetContactCount(event.target.value)} />
            </label>
            <label className="block space-y-1 text-sm" htmlFor="ai-campaign-credits">
              RocketReach credits in total
              <Input id="ai-campaign-credits" name="creditBudgetTotal" inputMode="numeric" required value={creditBudgetTotal} onChange={(event) => setCreditBudgetTotal(event.target.value)} />
            </label>
            <label className="block space-y-1 text-sm" htmlFor="ai-campaign-credits-day">
              RocketReach credits per day
              <Input id="ai-campaign-credits-day" name="creditBudgetPerDay" inputMode="numeric" required value={creditBudgetPerDay} onChange={(event) => setCreditBudgetPerDay(event.target.value)} />
            </label>
            <label className="block space-y-1 text-sm" htmlFor="ai-campaign-end">
              End date, optional
              <Input id="ai-campaign-end" name="endsAt" type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
            </label>
          </div>
          <div className="rounded-lg bg-muted/40 p-4">
            <h3 className="text-sm font-semibold">What the machine will do</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {summary.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
          <label className="block space-y-1 text-sm" htmlFor="ai-campaign-phrase">
            Type {AI_CAMPAIGN_CONFIRMATION_PHRASE} to confirm
            <Input id="ai-campaign-phrase" name="confirmationPhrase" autoComplete="off" placeholder={AI_CAMPAIGN_CONFIRMATION_PHRASE} required />
          </label>
          <Button type="submit">Start AI campaign</Button>
        </form>
      ) : null}
    </section>
  );
}
