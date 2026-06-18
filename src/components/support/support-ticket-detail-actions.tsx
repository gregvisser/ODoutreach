"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  reopenSupportTicket,
  resolveSupportTicket,
  type SupportActionResult,
} from "@/app/(app)/support/actions";

export function SupportTicketDetailActions({
  ticketId,
  status,
  isOwner,
  developerSummary,
}: {
  ticketId: string;
  status: string;
  isOwner: boolean;
  developerSummary: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<
    { type: "ok" | "err"; text: string } | null
  >(null);
  const [resolutionText, setResolutionText] = useState("");
  const [copied, setCopied] = useState(false);

  function run(p: Promise<SupportActionResult>, okText: string) {
    startTransition(async () => {
      setBanner(null);
      const r = await p;
      if (r.ok) {
        setBanner({ type: "ok", text: okText });
        router.refresh();
      } else {
        setBanner({ type: "err", text: r.error });
      }
    });
  }

  const isResolved = status === "RESOLVED";

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Actions</CardTitle>
        <CardDescription>
          Anyone can open a ticket. The developer fixes the issue and closes the
          ticket here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {banner && (
          <div
            role="status"
            className={cn(
              "rounded-md border px-3 py-2 text-sm",
              banner.type === "ok"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
                : "border-destructive/40 bg-destructive/10 text-destructive",
            )}
          >
            {banner.text}
          </div>
        )}

        {/* Copy-for-developer — available to everyone */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
          <p className="text-xs text-muted-foreground">
            Copy this ticket to send to the developer.
          </p>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(developerSummary);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              } catch {
                /* clipboard blocked */
              }
            }}
          >
            {copied ? "Copied ✓" : "Copy for developer"}
          </Button>
        </div>

        {/* Resolve & close (owner only, while still open) */}
        {isOwner && !isResolved ? (
          <div className="space-y-1.5">
            <Label htmlFor="resolution">Resolution note (closes the ticket)</Label>
            <Textarea
              id="resolution"
              rows={2}
              value={resolutionText}
              onChange={(e) => setResolutionText(e.target.value)}
              placeholder="What was done / deployed…"
              disabled={pending}
            />
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  resolveSupportTicket({ ticketId, resolutionNote: resolutionText }),
                  "Ticket resolved and closed.",
                )
              }
            >
              {pending ? "Saving…" : "Resolve & close"}
            </Button>
          </div>
        ) : null}

        {/* Reopen (owner only, once resolved) */}
        {isOwner && isResolved ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              run(reopenSupportTicket({ ticketId }), "Ticket reopened.")
            }
          >
            {pending ? "Reopening…" : "Reopen ticket"}
          </Button>
        ) : null}

        {!isOwner ? (
          <p className="text-xs text-muted-foreground">
            {isResolved
              ? "This ticket has been resolved."
              : "This ticket is open. The developer will pick it up and close it once fixed."}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
