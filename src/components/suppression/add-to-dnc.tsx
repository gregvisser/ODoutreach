"use client";

import { useState, useTransition } from "react";

import { addToDoNotContactAction } from "@/app/(app)/clients/do-not-contact-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ReplyClaimSubjectType } from "@/lib/inbox/reply-claim";

function resultMessage(r: Awaited<ReturnType<typeof addToDoNotContactAction>>): string {
  if (!r.ok) return r.error;
  const label = r.kind === "EMAIL" ? r.value : `everyone @${r.value}`;
  const already = r.alreadyListed ? " (was already on the list)" : "";
  const flagged =
    r.contactsFlagged > 0
      ? ` ${String(r.contactsFlagged)} contact${r.contactsFlagged === 1 ? "" : "s"} marked suppressed.`
      : "";
  return `Done — ${label} will not receive any more outreach${already}.${flagged}`;
}

/**
 * One-click do-not-contact buttons for a captured lead (reply detail page).
 * Writes straight to the suppression tables — enforced on the next send,
 * no sheet sync required.
 */
export function AddToDoNotContactButtons({
  clientId,
  email,
  replyClaimSubjectType,
  replyClaimSubjectId,
}: {
  clientId: string;
  email: string;
  /**
   * Passed only from a reply detail page. Suppressing from there counts as
   * acting on the reply, so it clears the advisory "somebody is looking at
   * this" marker. Omitted on the suppression pages, which have no reply.
   */
  replyClaimSubjectType?: ReplyClaimSubjectType;
  replyClaimSubjectId?: string;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const domain = email.includes("@") ? email.split("@").pop() : null;

  function add(kind: "EMAIL" | "DOMAIN", value: string) {
    setMsg(null);
    startTransition(async () => {
      const r = await addToDoNotContactAction({
        clientId,
        kind,
        value,
        ...(replyClaimSubjectType && replyClaimSubjectId
          ? { replyClaimSubjectType, replyClaimSubjectId }
          : {}),
      });
      setMsg(resultMessage(r));
    });
  }

  return (
    <div className="rounded-lg border border-border/80 bg-card p-4 shadow-sm">
      <p className="text-sm font-semibold text-foreground">Do not contact</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Lead captured? Block further outreach instantly — takes effect on the
        next send, mid-sequence follow-ups included.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => add("EMAIL", email)}
        >
          Block {email}
        </Button>
        {domain ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => add("DOMAIN", email)}
          >
            Block entire domain @{domain}
          </Button>
        ) : null}
      </div>
      {msg ? (
        <p role="status" className="mt-2 text-xs text-foreground">
          {msg}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Manual add form for the client Do-not-contact tab — block any email or
 * domain without touching the Google Sheet.
 */
export function ManualDncAddForm({ clientId }: { clientId: string }) {
  const [kind, setKind] = useState<"EMAIL" | "DOMAIN">("EMAIL");
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setMsg(null);
    startTransition(async () => {
      const r = await addToDoNotContactAction({ clientId, kind, value });
      setMsg(resultMessage(r));
      if (r.ok) setValue("");
    });
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="manual-dnc-value">
        Block an email or domain immediately
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "EMAIL" | "DOMAIN")}
          className="h-8 rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label="Block type"
        >
          <option value="EMAIL">Email address</option>
          <option value="DOMAIN">Whole domain</option>
        </select>
        <Input
          id="manual-dnc-value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={kind === "EMAIL" ? "name@company.com" : "company.com"}
          className="w-64"
        />
        <Button
          type="button"
          size="sm"
          disabled={pending || !value.trim()}
          onClick={submit}
        >
          Add to do-not-contact
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Takes effect immediately — no sheet sync needed. Entries added here
        are kept even when the Google Sheets re-sync runs.
      </p>
      {msg ? (
        <p role="status" className="text-xs text-foreground">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
