"use client";

import { useMemo, useState } from "react";

import type { ContactDeliveryRow } from "@/server/queries/client-contact-list-detail";

type Props = {
  contacts: ContactDeliveryRow[];
};

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return DATE_FMT.format(date);
}

function statusBadge(status: string) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium";
  switch (status) {
    case "Sent from mailbox":
      return <span className={`${base} bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300`}>{status}</span>;
    case "Sent — time unavailable":
      return <span className={`${base} bg-emerald-50/60 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400`}>{status}</span>;
    case "Send proof missing":
      return <span className={`${base} bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300`}>{status}</span>;
    case "Failed":
      return <span className={`${base} bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300`}>{status}</span>;
    case "Bounced":
      return <span className={`${base} bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300`}>{status}</span>;
    case "Replied":
      return <span className={`${base} bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300`}>{status}</span>;
    case "Unsubscribed":
      return <span className={`${base} bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300`}>{status}</span>;
    case "Suppressed / skipped":
      return <span className={`${base} bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400`}>{status}</span>;
    case "Queued":
      return <span className={`${base} bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300`}>{status}</span>;
    default:
      return <span className={`${base} bg-gray-50 text-gray-500 dark:bg-gray-900 dark:text-gray-500`}>{status}</span>;
  }
}

function proofIndicator(present: boolean) {
  return present
    ? <span className="text-emerald-600 dark:text-emerald-400">Present</span>
    : <span className="text-red-600 dark:text-red-400">Missing</span>;
}

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}

/**
 * PR #140 (G7) — staff-friendly filter labels mapped 1:1 to the
 * `DeliveryStatusLabel` values produced by
 * `src/server/queries/client-contact-list-detail.ts`. Order matters: it
 * is the order operators see in the filter dropdown.
 */
const STATUS_FILTER_LABELS = [
  "All",
  "Sent from mailbox",
  "Sent — time unavailable",
  "Queued",
  "Send proof missing",
  "Failed",
  "Bounced",
  "Replied",
  "Unsubscribed",
  "Suppressed / skipped",
  "Not sent",
] as const;
type StatusFilterLabel = (typeof STATUS_FILTER_LABELS)[number];

type SortColumn = "name" | "employer" | "country" | "status" | "sent";
type SortDirection = "asc" | "desc";

const SORT_COLUMN_LABELS: Record<SortColumn, string> = {
  name: "Name",
  employer: "Employer",
  country: "Country",
  status: "Status",
  sent: "Sent time",
};

function compareNullableString(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null || a === "") return 1;
  if (b === null || b === "") return -1;
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function compareNullableDate(a: Date | string | null, b: Date | string | null): number {
  const aT = a ? new Date(a).getTime() : null;
  const bT = b ? new Date(b).getTime() : null;
  if (aT === bT) return 0;
  if (aT === null) return 1;
  if (bT === null) return -1;
  return aT - bT;
}

function matchesSearch(row: ContactDeliveryRow, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const haystack = [
    row.name,
    row.firstName,
    row.lastName,
    row.email,
    row.employer,
    row.jobTitle,
    row.city,
    row.country,
  ]
    .filter((v): v is string => Boolean(v))
    .map((v) => v.toLowerCase());
  return haystack.some((v) => v.includes(needle));
}

function matchesStatus(row: ContactDeliveryRow, filter: StatusFilterLabel): boolean {
  if (filter === "All") return true;
  // "Not sent" collapses every "not delivered yet" state into one bucket
  // so staff can find recipients who haven't been touched yet.
  if (filter === "Not sent") {
    return (
      row.sendStatus !== "Sent from mailbox" &&
      row.sendStatus !== "Sent — time unavailable" &&
      row.sendStatus !== "Queued" &&
      row.sendStatus !== "Send proof missing" &&
      row.sendStatus !== "Failed" &&
      row.sendStatus !== "Bounced" &&
      row.sendStatus !== "Replied" &&
      row.sendStatus !== "Unsubscribed" &&
      row.sendStatus !== "Suppressed / skipped"
    );
  }
  return row.sendStatus === filter;
}

function sortRows(
  rows: ContactDeliveryRow[],
  col: SortColumn,
  dir: SortDirection,
): ContactDeliveryRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    let cmp = 0;
    switch (col) {
      case "name":
        cmp = compareNullableString(a.name, b.name);
        break;
      case "employer":
        cmp = compareNullableString(a.employer, b.employer);
        break;
      case "country":
        cmp = compareNullableString(a.country, b.country);
        break;
      case "status":
        cmp = compareNullableString(a.sendStatus, b.sendStatus);
        break;
      case "sent":
        cmp = compareNullableDate(a.sentAt, b.sentAt);
        break;
    }
    return dir === "asc" ? cmp : -cmp;
  });
  return copy;
}

export function ListDetailContactTable({ contacts }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilterLabel>("All");
  const [sortCol, setSortCol] = useState<SortColumn>("name");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

  const filtered = useMemo(() => {
    const filteredByQuery = contacts.filter((c) =>
      matchesSearch(c, query.trim()),
    );
    const filteredByStatus = filteredByQuery.filter((c) =>
      matchesStatus(c, statusFilter),
    );
    return sortRows(filteredByStatus, sortCol, sortDir);
  }, [contacts, query, statusFilter, sortCol, sortDir]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Search
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, employer, email, city, country, title"
            className="w-72 rounded border border-border/60 bg-background px-2 py-1 text-xs"
            aria-label="Search contacts in this list"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Status
          </span>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as StatusFilterLabel)
            }
            className="rounded border border-border/60 bg-background px-2 py-1 text-xs"
            aria-label="Filter by delivery status"
          >
            {STATUS_FILTER_LABELS.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Sort by
          </span>
          <select
            value={sortCol}
            onChange={(e) => setSortCol(e.target.value as SortColumn)}
            className="rounded border border-border/60 bg-background px-2 py-1 text-xs"
            aria-label="Sort column"
          >
            {(Object.keys(SORT_COLUMN_LABELS) as SortColumn[]).map((c) => (
              <option key={c} value={c}>
                {SORT_COLUMN_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Direction
          </span>
          <select
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value as SortDirection)}
            className="rounded border border-border/60 bg-background px-2 py-1 text-xs"
            aria-label="Sort direction"
          >
            <option value="asc">A → Z / oldest → newest</option>
            <option value="desc">Z → A / newest → oldest</option>
          </select>
        </label>
        <p className="ml-auto text-[11px] text-muted-foreground">
          Showing{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {filtered.length}
          </span>{" "}
          of{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {contacts.length}
          </span>
        </p>
      </div>

      {contacts.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No contacts in this list.
        </p>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No contacts match the current filters.
        </p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Employer</th>
              <th className="px-3 py-2">Job title</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Sequence</th>
              <th className="px-3 py-2">Mailbox</th>
              <th className="px-3 py-2">Sent</th>
              <th className="px-3 py-2">Opens</th>
              <th className="px-3 py-2">Latest event</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {filtered.map((c) => (
              <>
                <tr
                  key={c.contactId}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() =>
                    setExpanded(expanded === c.contactId ? null : c.contactId)
                  }
                >
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.employer ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.jobTitle ?? "—"}</td>
                  <td className="px-3 py-2">{statusBadge(c.sendStatus)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{c.sequenceName ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[140px]">{c.mailboxLabel ?? "—"}</td>
                  <td className="px-3 py-2 text-xs tabular-nums">{formatDate(c.sentAt)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{c.opensLabel}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{c.latestEventLabel ?? "—"}</td>
                </tr>
                {expanded === c.contactId && (
                  <tr key={`${c.contactId}-detail`} className="bg-muted/30">
                    <td colSpan={9} className="px-6 py-3">
                      {c.sendStatus === "Send proof missing" && (
                        <p className="mb-2 text-xs font-medium text-red-600 dark:text-red-400">
                          Marked sent, but no provider send proof was found.
                        </p>
                      )}
                      {c.sendStatus === "Queued" && (
                        <p className="mb-2 text-xs font-medium text-violet-600 dark:text-violet-400">
                          Queued — waiting for the outbound processor to send via the connected mailbox.
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs sm:grid-cols-4">
                        <Detail label="First name" value={c.firstName} />
                        <Detail label="Last name" value={c.lastName} />
                        <Detail label="Industry" value={c.industry} />
                        <Detail label="City" value={c.city} />
                        <Detail label="Country" value={c.country} />
                        <Detail label="LinkedIn" value={c.linkedin} />
                        <Detail label="Mobile" value={c.mobile} />
                        <Detail label="Office" value={c.office} />
                        <Detail label="Step" value={c.stepName} />
                        <Detail label="Subject" value={c.subject} />
                        <Detail
                          label="Bounce"
                          value={c.bounceStatus ?? (c.sendStatus === "Bounced" ? "Yes" : null)}
                        />
                        <Detail label="Replied" value={formatDate(c.repliedAt)} />
                        <Detail
                          label="Unsubscribed"
                          value={formatDate(c.unsubscribedAt)}
                        />
                        <Detail
                          label="Suppressed"
                          value={c.isSuppressed ? "Yes" : "No"}
                        />
                      </div>
                      <div className="mt-3 border-t border-border/40 pt-2">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Send proof
                        </p>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-0.5 text-xs sm:grid-cols-3">
                          <div>
                            <span className="text-muted-foreground">Outbound email:</span>{" "}
                            {proofIndicator(c.hasOutboundEmail)}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Provider proof:</span>{" "}
                            {proofIndicator(c.hasProviderProof)}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Sent timestamp:</span>{" "}
                            {proofIndicator(c.hasSentTimestamp)}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Bounce:</span>{" "}
                            <span className="font-medium">{yesNo(c.hasBounce)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Reply:</span>{" "}
                            <span className="font-medium">{yesNo(c.hasReply)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Unsubscribe:</span>{" "}
                            <span className="font-medium">{yesNo(c.hasUnsubscribe)}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span>{" "}
      <span className="font-medium">{value || "—"}</span>
    </div>
  );
}

// Exported for unit tests — pure helpers, no DOM.
export const __test__ = {
  matchesSearch,
  matchesStatus,
  sortRows,
  STATUS_FILTER_LABELS,
  SORT_COLUMN_LABELS,
};
