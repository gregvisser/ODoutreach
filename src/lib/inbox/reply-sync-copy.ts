import { formatStaffDateTime } from "@/lib/datetime/staff-datetime";

export type ReplySyncMailbox = {
  label: string;
  provider: "MICROSOFT" | "GOOGLE";
  lastSyncAt: string | null;
};

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
  const formatted = formatStaffDateTime(d);
  if (formatted === "—") return "Last checked date unavailable";
  return `Last checked ${formatted}`;
}

