"use client";

import { useState } from "react";

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

export function ListDetailContactTable({ contacts }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (contacts.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No contacts in this list.
      </p>
    );
  }

  return (
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
        {contacts.map((c) => (
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
                </td>
              </tr>
            )}
          </>
        ))}
      </tbody>
    </table>
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
