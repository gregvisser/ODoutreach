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
  decideSupportTicket,
  resolveSupportTicket,
  triageSupportTicket,
  type SupportActionResult,
} from "@/app/(app)/support/actions";

export function SupportTicketDetailActions({
  ticketId,
  status,
  isAdmin,
  canApprove,
  approverEmail,
  proposedFix,
  developerSummary,
}: {
  ticketId: string;
  status: string;
  isAdmin: boolean;
  canApprove: boolean;
  approverEmail: string;
  proposedFix: string | null;
  developerSummary: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<
    { type: "ok" | "err"; text: string } | null
  >(null);
  const [fixText, setFixText] = useState(proposedFix ?? "");
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

  const canTriage = isAdmin && status !== "RESOLVED";
  const canResolve = isAdmin && status === "APPROVED";
  const awaitingApproval = status === "AWAITING_APPROVAL";

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Review &amp; approval</CardTitle>
        <CardDescription>
          Fixes are built in a developer session and must be authorised by{" "}
          <span className="font-medium">{approverEmail}</span> before they go
          live.
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
            Hand this ticket to the developer (paste into a Claude session).
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

        {/* Triage: record proposed fix → request approval (ADMIN) */}
        {canTriage ? (
          <div className="space-y-1.5">
            <Label htmlFor="fix">Proposed fix (sends ticket for approval)</Label>
            <Textarea
              id="fix"
              rows={3}
              value={fixText}
              onChange={(e) => setFixText(e.target.value)}
              placeholder="Summarise the fix to be applied…"
              disabled={pending}
            />
            <Button
              type="button"
              size="sm"
              disabled={pending || fixText.trim().length < 5}
              onClick={() =>
                run(
                  triageSupportTicket({ ticketId, proposedFix: fixText }),
                  "Proposed fix saved — sent for approval.",
                )
              }
            >
              {pending ? "Saving…" : "Save & request approval"}
            </Button>
          </div>
        ) : null}

        {/* Approve / reject — approver only, when awaiting approval */}
        {awaitingApproval ? (
          canApprove ? (
            <div className="space-y-2 rounded-md border border-amber-500/50 bg-amber-500/5 p-3">
              <p className="text-sm font-medium">This fix needs your authorisation.</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(
                      decideSupportTicket({ ticketId, decision: "approve" }),
                      "Fix approved. The developer can now apply it.",
                    )
                  }
                >
                  Approve fix
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(
                      decideSupportTicket({ ticketId, decision: "reject" }),
                      "Fix rejected.",
                    )
                  }
                >
                  Reject
                </Button>
              </div>
            </div>
          ) : (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-muted-foreground">
              Waiting for <span className="font-medium">{approverEmail}</span> to
              approve this fix.
            </p>
          )
        ) : null}

        {/* Resolve (ADMIN) once approved + deployed */}
        {canResolve ? (
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
                  "Ticket resolved.",
                )
              }
            >
              {pending ? "Saving…" : "Mark resolved"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
