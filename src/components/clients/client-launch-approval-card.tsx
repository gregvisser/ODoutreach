"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { approveClientLaunchAction } from "@/app/(app)/clients/launch-approval-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  LAUNCH_APPROVAL_CONFIRMATION_PHRASE,
  LAUNCH_APPROVAL_NOTES_MAX,
  type ClientLaunchApprovalMode,
  type LaunchApprovalChecklistItem,
} from "@/lib/clients/client-launch-approval";

export type LaunchApprovalCardApprovedBy = {
  id: string;
  email: string;
  displayName: string | null;
};

export type ClientLaunchApprovalCardProps = {
  clientId: string;
  clientStatus: string;
  canMutate: boolean;
  canApprove: boolean;
  blockers: string[];
  warnings: string[];
  checklist: LaunchApprovalChecklistItem[];
  evaluatedMode: ClientLaunchApprovalMode;
  launchApprovedAt: string | null;
  approvedByStaff: LaunchApprovalCardApprovedBy | null;
  launchApprovalMode: ClientLaunchApprovalMode | null;
  launchApprovalNotes: string | null;
  /** Checklist snapshot captured at approval time, if any (JSON). */
  storedChecklist: LaunchApprovalChecklistItem[] | null;
};

function ChecklistList({ items }: { items: LaunchApprovalChecklistItem[] }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-start gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2"
        >
          <span
            aria-hidden="true"
            className={
              item.ok
                ? "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                : "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
            }
          >
            {item.ok ? "✓" : "·"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-medium text-foreground">
                {item.label}
              </span>
              {item.ok ? (
                <Badge
                  variant="secondary"
                  className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                >
                  OK
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-400/60">
                  Pending
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{item.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatApprovedAt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

export function ClientLaunchApprovalCard(props: ClientLaunchApprovalCardProps) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<
    { type: "ok" | "err"; text: string; blockers?: string[] } | null
  >(null);
  const [pending, startTransition] = useTransition();

  const confirmationOk = useMemo(
    () => confirmation.trim() === LAUNCH_APPROVAL_CONFIRMATION_PHRASE,
    [confirmation],
  );

  const notesOverLimit = notes.length > LAUNCH_APPROVAL_NOTES_MAX;
  const approveDisabled =
    !props.canMutate ||
    !props.canApprove ||
    !confirmationOk ||
    notesOverLimit ||
    pending;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (approveDisabled) return;
    setMessage(null);
    startTransition(async () => {
      const res = await approveClientLaunchAction({
        clientId: props.clientId,
        mode: props.evaluatedMode,
        confirmationPhrase: confirmation,
        notes: notes.trim().length > 0 ? notes : undefined,
      });
      if (res.ok) {
        setMessage({
          type: "ok",
          text: "Launch approved. Client is now ACTIVE. No email was sent.",
        });
        setConfirmation("");
        setNotes("");
        router.refresh();
      } else {
        setMessage({
          type: "err",
          text: res.message,
          blockers: "blockers" in res ? res.blockers : undefined,
        });
      }
    });
  };

  if (props.clientStatus === "ACTIVE") {
    const approvedAtLabel = formatApprovedAt(props.launchApprovedAt);
    const approverLabel = props.approvedByStaff
      ? props.approvedByStaff.displayName?.trim() ||
        props.approvedByStaff.email
      : null;

    if (!props.launchApprovedAt) {
      return (
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle>Launch approval</CardTitle>
            <CardDescription>
              Active — approved for live outreach. Modules remain editable.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="rounded-md border border-amber-300/60 bg-amber-50/60 p-3 text-amber-900 dark:border-amber-500/20 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="font-medium">Legacy active client</p>
              <p className="mt-1 text-xs">
                This client is active from before the launch approval
                workflow. Re-approve if you need a recorded approval trail.
              </p>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="border-emerald-400/40 shadow-sm dark:border-emerald-500/20">
        <CardHeader>
          <CardTitle>Launch approval</CardTitle>
          <CardDescription>
            Active — approved for live outreach. Modules remain editable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-muted-foreground">
                Approved at
              </dt>
              <dd className="font-medium">{approvedAtLabel}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">
                Approved by
              </dt>
              <dd className="font-medium">{approverLabel ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Mode</dt>
              <dd className="font-medium">
                {props.launchApprovalMode ?? "—"}
              </dd>
            </div>
          </dl>
          {props.launchApprovalNotes ? (
            <div>
              <div className="text-xs uppercase text-muted-foreground">
                Notes
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {props.launchApprovalNotes}
              </p>
            </div>
          ) : null}
          {props.storedChecklist && props.storedChecklist.length > 0 ? (
            <details className="rounded-md border border-border/60 p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Approval checklist snapshot
              </summary>
              <div className="mt-3">
                <ChecklistList items={props.storedChecklist} />
              </div>
            </details>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  if (
    props.clientStatus !== "ONBOARDING" &&
    props.clientStatus !== "PAUSED"
  ) {
    return (
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Launch approval</CardTitle>
          <CardDescription>
            Approval is only available for ONBOARDING or PAUSED clients.
            Current status: {props.clientStatus}.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>Launch approval</CardTitle>
        <CardDescription>
          Explicit operator sign-off required before this client is marked
          ACTIVE. Approving launch does not send email. It only marks the
          client ready for live outreach operations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {props.blockers.length > 0 ? (
          <div className="rounded-md border border-rose-300/60 bg-rose-50/60 p-3 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-950/20 dark:text-rose-100">
            <p className="font-medium">
              Cannot approve yet — resolve {String(props.blockers.length)}{" "}
              blocker{props.blockers.length === 1 ? "" : "s"}:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {props.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-md border border-emerald-300/60 bg-emerald-50/60 p-3 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/20 dark:text-emerald-100">
            All required checklist items are green. Approval is permitted.
          </div>
        )}

        {props.warnings.length > 0 ? (
          <div className="rounded-md border border-amber-300/60 bg-amber-50/60 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-100">
            <p className="font-medium">Warnings:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {props.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
            Approval checklist
          </div>
          <ChecklistList items={props.checklist} />
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label htmlFor="launch-approval-notes">
              Notes (optional, {String(LAUNCH_APPROVAL_NOTES_MAX)} max)
            </Label>
            <Textarea
              id="launch-approval-notes"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
              }}
              rows={3}
              placeholder="Context for the approval trail (audience scope, risk notes, etc.)"
              disabled={!props.canMutate || pending}
            />
            {notesOverLimit ? (
              <p className="mt-1 text-xs text-rose-600">
                Notes must be {String(LAUNCH_APPROVAL_NOTES_MAX)} characters or
                fewer.
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="launch-approval-confirmation">
              Type <code>APPROVE LAUNCH</code> to confirm
            </Label>
            <Input
              id="launch-approval-confirmation"
              value={confirmation}
              onChange={(e) => {
                setConfirmation(e.target.value);
              }}
              autoComplete="off"
              disabled={!props.canMutate || pending}
              aria-invalid={confirmation.length > 0 && !confirmationOk}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Case-sensitive. Extra spaces are trimmed before comparison.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={approveDisabled}>
              {pending ? "Approving…" : "Approve launch"}
            </Button>
            {!props.canMutate ? (
              <span className="text-xs text-muted-foreground">
                You do not have permission to approve launch for this client.
              </span>
            ) : null}
          </div>
        </form>

        {message ? (
          <div
            role="status"
            className={
              message.type === "ok"
                ? "rounded-md border border-emerald-400/60 bg-emerald-50/60 p-3 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/20 dark:text-emerald-100"
                : "rounded-md border border-rose-400/60 bg-rose-50/60 p-3 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-950/20 dark:text-rose-100"
            }
          >
            <p className="font-medium">{message.text}</p>
            {message.blockers && message.blockers.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {message.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
