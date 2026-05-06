export const OUTREACH_PRIMARY_COPY = {
  eyebrow: "Outreach",
  title: "Create outreach sequence",
  description:
    "Choose a contact list, pick a sending mailbox, write one introduction email, and add follow-ups only if you need them. Nothing sends until an operator reviews the send section.",
  steps: [
    "Select contacts",
    "Choose mailbox",
    "Write introduction",
    "Add optional follow-ups",
    "Review and send",
  ],
} as const;

export const OUTREACH_INTERNAL_TOOLS_COPY = {
  title: "Internal tools",
  description:
    "Staff-only checks and capped first-batch tools. Keep these separate from the normal sequence launch flow.",
} as const;

export const OUTREACH_NEXT_STEPS = OUTREACH_PRIMARY_COPY.steps;

