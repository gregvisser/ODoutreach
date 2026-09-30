"use server";

import { redirect, unstable_rethrow } from "next/navigation";

import { aiCampaignDraftFromForm } from "@/lib/ai-campaigns/audience";
import { reportError } from "@/lib/logger";
import { applyAiCampaignCommand, startAiCampaign } from "@/server/ai-campaigns/control";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { requireClientAccess } from "@/server/tenant/access";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function fail(path: string, message: string): never {
  const params = new URLSearchParams();
  params.set("aiCampaignError", message.slice(0, 300));
  redirect(`${path}?${params.toString()}`);
}

export async function startAiCampaignAction(formData: FormData): Promise<void> {
  const clientId = text(formData, "clientId").trim();
  const back = clientId ? `/clients/${clientId}/outreach#create-ai-campaign` : "/clients";
  try {
    const staff = await requireOpensDoorsStaff();
    if (!clientId) fail("/clients", "Choose a client first.");
    await requireClientAccess(staff, clientId);
    const parsed = aiCampaignDraftFromForm(
      {
        brief: text(formData, "brief"),
        jobTitles: text(formData, "jobTitles"),
        countries: text(formData, "countries"),
        industries: text(formData, "industries"),
        seniorities: text(formData, "seniorities"),
        companySizeMin: text(formData, "companySizeMin"),
        companySizeMax: text(formData, "companySizeMax"),
        targetContactCount: text(formData, "targetContactCount"),
        creditBudgetTotal: text(formData, "creditBudgetTotal"),
        creditBudgetPerDay: text(formData, "creditBudgetPerDay"),
        endsAt: text(formData, "endsAt"),
        confirmationPhrase: text(formData, "confirmationPhrase"),
      },
      new Date(),
    );
    if (!parsed.ok) fail(back, parsed.error);
    const started = await startAiCampaign({ staff, clientId, draft: parsed.draft });
    if (!started.ok) fail(back, started.error);
    redirect(`/clients/${clientId}/outreach/ai-campaigns/${started.campaignId}`);
  } catch (error) {
    unstable_rethrow(error);
    reportError(error, { scope: "ai-campaign.start", clientId: clientId || undefined });
    fail(back, "The AI campaign could not be started.");
  }
}

export async function controlAiCampaignAction(formData: FormData): Promise<void> {
  const clientId = text(formData, "clientId").trim();
  const campaignId = text(formData, "campaignId").trim();
  const commandRaw = text(formData, "command");
  const command = commandRaw === "pause" || commandRaw === "resume" || commandRaw === "stop" ? commandRaw : null;
  const back = clientId && campaignId
    ? `/clients/${clientId}/outreach/ai-campaigns/${campaignId}`
    : "/clients";
  try {
    const staff = await requireOpensDoorsStaff();
    if (!clientId || !campaignId || !command) fail(back, "This AI campaign could not be changed.");
    await requireClientAccess(staff, clientId);
    const result = await applyAiCampaignCommand({
      staff,
      clientId,
      campaignId,
      command,
      confirmationPhrase: text(formData, "confirmationPhrase"),
    });
    if (!result.ok) fail(back, result.error);
    redirect(back);
  } catch (error) {
    unstable_rethrow(error);
    reportError(error, { scope: "ai-campaign.control", clientId: clientId || undefined });
    fail(back, "This AI campaign could not be changed.");
  }
}
