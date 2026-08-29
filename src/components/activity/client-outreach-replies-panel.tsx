"use client";

import Link from "next/link";
import { useState } from "react";
import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  replyClassificationBadge,
  UNCLASSIFIED_BADGE,
} from "@/lib/ai/reply-classification-display";
import { cn } from "@/lib/utils";

import type { ReplyClassification } from "@/generated/prisma/enums";

type ReplyRow = {
  id: string;
  fromEmail: string;
  subject: string | null;
  bodyPreview: string | null;
  receivedAt: string;
  matchMethod: string;
  linkedOutboundEmailId: string | null;
  contactName: string | null;
  sequenceName: string | null;
  outboundSubject: string | null;
  classification: ReplyClassification | null;
  classificationRationale: string | null;
};

type MailboxGroup = {
  mailboxId: string;
  mailboxEmail: string;
  mailboxDisplayName: string | null;
  replyCount: number;
  replies: ReplyRow[];
};

type Props = {
  clientId: string;
  groups: MailboxGroup[];
  /** Authoritative total (matches the summary card) — uncapped DB count. */
  totalReplies: number;
  /** Replies actually loaded into the groups below (capped at 200, mailbox-linked). */
  shownReplies: number;
  /** Owner-only: the send-detail route is gated, so hide its link otherwise. */
  canViewSendDetail: boolean;
};

function formatTs(iso: string): string {
  try {
    return format(new Date(iso), "d MMM yyyy, HH:mm");
  } catch {
    return iso;
  }
}

function MailboxGroupRow({
  clientId,
  group,
  canViewSendDetail,
}: {
  clientId: string;
  group: MailboxGroup;
  canViewSendDetail: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = group.mailboxDisplayName?.trim() || group.mailboxEmail;

  return (
    <div className="rounded-md border border-border/70 bg-card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/40",
          expanded && "border-b border-border/50",
        )}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">{group.mailboxEmail}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={group.replyCount > 0 ? "default" : "secondary"}
            className="font-normal tabular-nums"
          >
            {group.replyCount} {group.replyCount === 1 ? "reply" : "replies"}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="divide-y divide-border/50">
          {group.replies.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              No sequence replies received via this mailbox yet.
            </p>
          ) : (
            group.replies.map((r) => (
              <div key={r.id} className="space-y-1 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">
                    {r.contactName ?? r.fromEmail}
                  </span>
                  {r.contactName && (
                    <span className="text-xs text-muted-foreground">
                      {r.fromEmail}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatTs(r.receivedAt)}
                  </span>
                  {/*
                    Row 80 — what the AI read this reply as. Shown on the row
                    itself, because the value of the feature is a staff member
                    scanning this list and seeing where to go first. An
                    unlabelled reply says so rather than rendering blank.
                  */}
                  {(() => {
                    const badge = r.classification
                      ? replyClassificationBadge(r.classification)
                      : UNCLASSIFIED_BADGE;
                    return (
                      <Badge
                        variant="outline"
                        className={cn("text-[11px]", badge.className)}
                        title={r.classificationRationale ?? undefined}
                      >
                        {badge.text}
                      </Badge>
                    );
                  })()}
                </div>
                {r.sequenceName && (
                  <p className="text-xs text-muted-foreground">
                    Sequence: {r.sequenceName}
                  </p>
                )}
                {r.outboundSubject && (
                  <p className="text-xs text-muted-foreground">
                    Replying to: &ldquo;{r.outboundSubject}&rdquo;
                  </p>
                )}
                {r.subject && r.subject !== r.outboundSubject && (
                  <p className="text-xs text-muted-foreground">
                    Subject: &ldquo;{r.subject}&rdquo;
                  </p>
                )}
                {r.bodyPreview && (
                  <p className="text-xs text-muted-foreground">
                    {r.bodyPreview.length > 200
                      ? `${r.bodyPreview.slice(0, 200)}…`
                      : r.bodyPreview}
                  </p>
                )}
                <div className="flex items-center gap-3 pt-1">
                  <Link prefetch={false}
                    href={`/clients/${clientId}/activity/replies/${r.id}`}
                    className="text-xs font-medium underline-offset-4 hover:underline"
                  >
                    Open reply →
                  </Link>
                  {canViewSendDetail && r.linkedOutboundEmailId && (
                    <Link prefetch={false}
                      href={`/activity/outbound/${r.linkedOutboundEmailId}`}
                      className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                    >
                      View original send
                    </Link>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function ClientOutreachRepliesPanel({
  clientId,
  groups,
  totalReplies,
  shownReplies,
  canViewSendDetail,
}: Props) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>Replies</CardTitle>
        <CardDescription>
          Only replies to this client&apos;s outreach sequence emails are shown.
          Random inbox mail is intentionally hidden.
          {totalReplies > 0 && (
            <span className="ml-1 font-medium text-foreground">
              {totalReplies} total{" "}
              {totalReplies === 1 ? "reply" : "replies"}.
            </span>
          )}
          {shownReplies < totalReplies && (
            <span className="ml-1 text-muted-foreground">
              Showing the most recent {shownReplies} below (older replies, or
              replies whose sending mailbox was removed, are not listed
              individually).
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No connected mailboxes for this client.
          </p>
        ) : (
          <div className="space-y-2">
            {groups.map((g) => (
              <MailboxGroupRow
                key={g.mailboxId}
                clientId={clientId}
                group={g}
                canViewSendDetail={canViewSendDetail}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
