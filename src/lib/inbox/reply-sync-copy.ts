export type ReplySyncMailbox = {
  label: string;
  provider: "MICROSOFT" | "GOOGLE";
  lastSyncAt: string | null;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function replySyncButtonLabel(mailbox: ReplySyncMailbox): string {
  return `Check replies — ${mailbox.label}`;
}

export function replySyncProviderLabel(provider: ReplySyncMailbox["provider"]): string {
  return provider === "GOOGLE" ? "Google" : "Microsoft";
}

export function formatMailboxLastChecked(lastSyncAt: string | null): string {
  if (!lastSyncAt) return "Not checked yet";
  const d = new Date(lastSyncAt);
  if (Number.isNaN(d.getTime())) return "Last checked date unavailable";
  return `Last checked ${DATE_FORMATTER.format(d)}`;
}

