import Link from "next/link";
import { notFound } from "next/navigation";

import { controlAiCampaignAction } from "@/app/(app)/clients/[clientId]/outreach/ai-campaign-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatStaffDateTime } from "@/lib/datetime/staff-datetime";
import {
  AI_CAMPAIGN_PAUSE_PHRASE,
  AI_CAMPAIGN_RESUME_PHRASE,
  AI_CAMPAIGN_STOP_PHRASE,
  staffMayControlAiCampaign,
} from "@/lib/ai-campaigns/policy";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { loadAiCampaignDetail } from "@/server/ai-campaigns/queries";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ clientId: string; campaignId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function CommandForm({
  clientId,
  campaignId,
  command,
  phrase,
  label,
}: {
  clientId: string;
  campaignId: string;
  command: "pause" | "resume" | "stop";
  phrase: string;
  label: string;
}) {
  return (
    <form action={controlAiCampaignAction} className="space-y-2 rounded-lg border border-border/80 p-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="command" value={command} />
      <label className="block space-y-1 text-sm" htmlFor={`ai-campaign-${command}`}>
        Type {phrase}
        <Input id={`ai-campaign-${command}`} name="confirmationPhrase" autoComplete="off" placeholder={phrase} required />
      </label>
      <Button type="submit" variant={command === "stop" ? "destructive" : "secondary"}>{label}</Button>
    </form>
  );
}

export default async function AiCampaignPage({ params, searchParams }: Props) {
  const staff = await requireOpensDoorsStaff();
  const accessible = await getAccessibleClientIds(staff);
  const { clientId, campaignId } = await params;
  if (!accessible.includes(clientId)) notFound();
  const campaign = await loadAiCampaignDetail(clientId, campaignId);
  if (!campaign) notFound();
  const sp = searchParams ? await searchParams : {};
  const error = firstParam(sp.aiCampaignError);
  const canControl = staffMayControlAiCampaign(staff.role);
  const finished = campaign.status === "STOPPED" || campaign.status === "COMPLETED" || campaign.status === "FAILED";
  const canPause = canControl && !finished && campaign.status !== "PAUSED" && campaign.status !== "NEEDS_STAFF";
  const canResume = canControl && campaign.status === "PAUSED";
  const canStop = canControl && !finished;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Link prefetch={false} href={`/clients/${clientId}/outreach`}>Outreach</Link>
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{campaign.name}</h1>
        <p className="mt-1 text-muted-foreground">{campaign.stageSentence}</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!campaign.killSwitchOn && !finished ? (
        <p className="text-sm">AI campaigns are switched off, so nothing new will be sent until the switch is on.</p>
      ) : null}

      <section aria-label="Campaign status" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Status label="Status" value={campaign.statusLabel} />
        <Status label="People found" value={`${String(campaign.contactsSourced)} of ${String(campaign.targetContactCount)}`} />
        <Status label="Emails sent" value={String(campaign.sent)} />
        <Status label="Replies" value={String(campaign.replied)} />
        <Status label="Credits used" value={`${String(campaign.creditsUsed)} of ${String(campaign.creditBudgetTotal)}`} />
        <Status label="Credits per day" value={String(campaign.creditBudgetPerDay)} />
        <Status label="Next check" value={campaign.nextActionAt ? formatStaffDateTime(campaign.nextActionAt) : "Waiting"} />
        <Status label="End date" value={campaign.endsAt ? formatStaffDateTime(campaign.endsAt) : "None"} />
      </section>

      {campaign.reviewScore !== null ? (
        <p className="text-sm">Writing check: {String(campaign.reviewScore)} after {String(campaign.reviewRounds)} {campaign.reviewRounds === 1 ? "check" : "checks"}.</p>
      ) : null}
      {campaign.staffAlert ? <p className="text-sm">{campaign.staffAlert}</p> : null}

      <section aria-label="Who this campaign contacts" className="space-y-1 text-sm">
        <h2 className="font-semibold">Who this campaign contacts</h2>
        <p>Job titles: {campaign.jobTitles.join(", ") || "None"}</p>
        <p>Countries: {campaign.countries.join(", ") || "None"}</p>
        <p>Industries: {campaign.industries.join(", ") || "None"}</p>
        {campaign.companySize ? <p>Company size: {campaign.companySize}. This is given to the writer. The search uses job title, industry, and country.</p> : null}
        {campaign.listExhausted ? <p>No more matching people were found.</p> : null}
      </section>

      <section aria-label="Mailboxes in use" className="space-y-1 text-sm">
        <h2 className="font-semibold">Mailboxes</h2>
        {campaign.mailboxes.length === 0 ? <p>No mailboxes are connected yet. Sending waits until one is.</p> : null}
        <ul className="list-disc space-y-1 pl-5">
          {campaign.mailboxes.map((mailbox) => <li key={mailbox.email}>{mailbox.label}</li>)}
        </ul>
      </section>

      {canPause || canResume || canStop ? (
        <section aria-label="Pause or stop" className="grid gap-3 md:grid-cols-3">
          {canPause ? (
            <CommandForm clientId={clientId} campaignId={campaign.id} command="pause" phrase={AI_CAMPAIGN_PAUSE_PHRASE} label="Pause" />
          ) : null}
          {canResume ? (
            <CommandForm clientId={clientId} campaignId={campaign.id} command="resume" phrase={AI_CAMPAIGN_RESUME_PHRASE} label="Resume" />
          ) : null}
          {canStop ? (
            <CommandForm clientId={clientId} campaignId={campaign.id} command="stop" phrase={AI_CAMPAIGN_STOP_PHRASE} label="Stop" />
          ) : null}
        </section>
      ) : null}

      <section aria-label="Activity" className="space-y-2">
        <h2 className="font-semibold">What has happened</h2>
        {campaign.events.length === 0 ? <p className="text-sm text-muted-foreground">Nothing has been recorded yet.</p> : null}
        <ol className="space-y-2">
          {campaign.events.map((event) => (
            <li key={event.id} className="text-sm">
              <span className="text-muted-foreground">{formatStaffDateTime(event.at)}. </span>
              {event.message}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/80 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
