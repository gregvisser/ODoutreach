/**
 * Row 111 finding 6 — the outbound email detail screen rendered
 * `row.providerName` raw ("mock", "resend", "microsoft_graph",
 * "google_gmail", ...). "mock" reads as a developer word for a fake/test
 * system, so a reader could reasonably worry a specific email was never
 * really sent at all. This is the one place that turns the raw provider
 * name into a plain-English label plus, where the row was never a real
 * client send, an inline explanation — following the same "one humanizer,
 * reused" precedent as `describeCompositionBlocker`.
 */
export type OutboundProviderDisplay = {
  label: string;
  explanation: string | null;
};

const CLIENT_MAILBOX_PROVIDER_LABELS: Record<string, string> = {
  microsoft_graph: "Microsoft (Outlook)",
  google_gmail: "Google (Gmail)",
};

/** Never a real client mailbox send — local/dev sends and simulated webhook fixtures. */
const INTERNAL_ONLY_PROVIDER_NAMES = new Set(["mock", "dev_simulate", "dev_replay"]);

const INTERNAL_ONLY_EXPLANATION =
  "Not sent through a client mailbox — this is an internal or test row.";

export function describeOutboundProvider(
  providerName: string | null,
): OutboundProviderDisplay {
  if (!providerName) return { label: "—", explanation: null };

  const mailboxLabel = CLIENT_MAILBOX_PROVIDER_LABELS[providerName];
  if (mailboxLabel) return { label: mailboxLabel, explanation: null };

  if (INTERNAL_ONLY_PROVIDER_NAMES.has(providerName)) {
    return { label: "Internal/system email", explanation: INTERNAL_ONLY_EXPLANATION };
  }

  if (providerName === "resend") {
    return {
      label: "Legacy system email",
      explanation:
        "Sent through the legacy system mailer, not a connected client mailbox.",
    };
  }

  return { label: providerName, explanation: null };
}
