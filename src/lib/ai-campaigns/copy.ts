import type { AiCampaignDecision, AiCampaignStatus } from "./state-machine";

const STATUS_LABEL: Record<AiCampaignStatus, string> = {
  SOURCING: "Finding people",
  WRITING: "Writing the emails",
  REVIEWING: "Checking the emails",
  REVISING: "Rewriting the emails",
  NEEDS_STAFF: "Waiting for a member of staff",
  PREPARING: "Getting people ready",
  LAUNCHING: "Starting to send",
  RUNNING: "Sending",
  PAUSED: "Paused",
  STOPPED: "Stopped",
  COMPLETED: "Finished",
  FAILED: "Stopped after a problem",
};

export function aiCampaignStatusLabel(status: AiCampaignStatus): string {
  return STATUS_LABEL[status];
}

export function aiCampaignStageSentence(status: AiCampaignStatus, staffAlert: string | null): string {
  if (status === "NEEDS_STAFF" && staffAlert) return staffAlert;
  switch (status) {
    case "SOURCING":
      return "The machine is looking for people to contact. It uses this client's own people first, then RocketReach if the budget allows.";
    case "WRITING":
      return "The machine is writing the introduction and the follow-ups.";
    case "REVIEWING":
      return "The machine is checking the emails before anyone is contacted.";
    case "REVISING":
      return "The check was not strong enough, so the machine is rewriting the emails.";
    case "NEEDS_STAFF":
      return "The machine stopped before sending and is waiting for a member of staff.";
    case "PREPARING":
      return "The emails passed the check. The machine is getting people ready to be contacted.";
    case "LAUNCHING":
      return "The machine is starting to send. Later emails go out as each mailbox has room.";
    case "RUNNING":
      return "Emails are going out from the connected mailboxes. Follow-ups send on their own. You handle replies.";
    case "PAUSED":
      return "Sending is on hold. Nothing new goes out until a member of staff resumes this campaign.";
    case "STOPPED":
      return "A member of staff stopped this campaign. Nothing new will go out.";
    case "COMPLETED":
      return "This campaign has finished. Nothing new will go out.";
    case "FAILED":
      return "This campaign stopped because something went wrong. Nothing new will go out.";
    default:
      return STATUS_LABEL[status];
  }
}

export function aiCampaignDecisionMessage(decision: AiCampaignDecision): string {
  switch (decision.type) {
    case "source":
      return "Looked for more people to contact.";
    case "write":
      return "Wrote the emails.";
    case "review":
      return "Checked the emails.";
    case "revise":
      return "The check was below the line, so the emails will be rewritten.";
    case "needs_staff":
      return decision.reason;
    case "approve":
      return "The emails passed the check and were approved for sending.";
    case "prepare":
      return "People were prepared for the first email.";
    case "launch":
      return "The first emails were handed to the mailboxes.";
    case "run":
      return "Continued sending, including follow-ups that are due.";
    case "complete":
      return decision.reason;
    case "pause":
      return decision.reason;
    case "resume":
      return "A member of staff resumed this campaign.";
    case "stop":
      return decision.reason;
    case "hold":
      return decision.reason;
    case "idle":
      return decision.reason;
    default:
      return "Checked this campaign.";
  }
}

export function aiCampaignPlanSummary(input: {
  targetContactCount: number;
  creditBudgetTotal: number;
  creditBudgetPerDay: number;
  endsAtLabel: string | null;
  companySizeLabel: string | null;
}): string[] {
  return [
    `The machine will try to contact ${String(input.targetContactCount)} people.`,
    "It uses this client's own people first. RocketReach is used only for the shortfall, and people we already know are skipped before a credit is spent.",
    `RocketReach spend stays within ${String(input.creditBudgetTotal)} credits in total and ${String(input.creditBudgetPerDay)} credits a day, and it also stops at the account balance floor.`,
    input.endsAtLabel ? `It stops on ${input.endsAtLabel} even if people are still left.` : "It has no end date. It stops when the people, the budget, or the matches run out.",
    input.companySizeLabel
      ? `Company size ${input.companySizeLabel} is saved with the campaign and given to the writer. The RocketReach search uses job title, industry, and country, the same filters as a manual search.`
      : "Company size is not set.",
    "Do-not-contact, unsubscribe, suppression, and same-client checks stay in place. The machine adds people who pass them. You do not open Review recipients for this campaign. Each mailbox keeps its own daily limit. Open tracking stays off.",
    "A reply stops further emails to that person. You read and answer replies. The client is not asked to approve anything.",
    "If the writing service is busy or slow, the machine waits and tries again on its own.",
    "Pausing or stopping this campaign does not change campaigns you still send by hand.",
  ];
}

export function companySizeLabel(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return `${String(min)} to ${String(max)} people`;
  if (min !== null) return `at least ${String(min)} people`;
  return `up to ${String(max)} people`;
}
