import Link from "next/link";

import {
  createClientEmailSequenceEnrollmentsAction,
  deleteOrArchiveClientEmailSequenceAction,
  returnClientEmailSequenceToDraftAction,
} from "@/app/(app)/clients/[clientId]/outreach/sequence-actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ENROLLMENT_STATUS_LABELS } from "@/lib/email-sequences/enrollment-policy";
import type { SequenceLaunchReadiness } from "@/lib/email-sequences/launch-readiness";
import {
  deriveOutreachDashboardStatusLabel,
  type PrepCountsSlice,
} from "@/lib/clients/outreach-sequence-dashboard-status";
import { staffLaunchBlockerLines } from "@/lib/clients/outreach-launch-blockers";
import { SEQUENCE_STEP_LABELS } from "@/lib/email-sequences/sequence-policy";
import { TEMPLATE_STATUS_LABELS } from "@/lib/email-templates/template-policy";
import type {
  ClientEmailSequencesOverview,
  SequenceSummary,
} from "@/server/email-sequences/queries";

import type { SequenceStepSendUiSnapshot } from "@/server/email-sequences/send-introduction";
import type { SequencePrepSnapshot } from "@/server/email-sequences/step-sends";

import { ClientEmailSequenceForm } from "./client-email-sequence-form";
import { ArchiveSequenceConfirmForm } from "./sequence-archive-confirm-form";
import { SequenceSendPreparationPanel } from "./sequence-send-preparation-panel";

/**
 * Outreach-page section for per-client email sequences.
 * Server component — compact list, single selected detail, collapsed create form.
 */

type Props = {
  clientId: string;
  clientName: string;
  canMutate: boolean;
  /** F3 — staff may use the cooldown re-engage override (ADMIN/MANAGER). */
  canReengage: boolean;
  overview: ClientEmailSequencesOverview;
  flash: {
    ok: string | null;
    error: string | null;
    focusSequenceId: string | null;
  };
  /** Currently selected sequence for detail + launch prep (URL-driven). */
  selectedSequenceId: string | null;
  /** When true, the edit form &lt;details&gt; is open (e.g. ?edit=1). */
  showSequenceEditForm: boolean;
  launchReadinessBySequenceId: Record<string, SequenceLaunchReadiness>;
  mailboxSnapshot: {
    connectedSendingCount: number;
    aggregateRemainingToday: number;
  };
  launchMailboxOptions: Array<{
    id: string;
    email: string;
    label: string;
    disabled?: boolean;
    disabledReason?: string;
  }>;
  sequencePrepSnapshots: SequencePrepSnapshot[];
  stepSendSnapshots: SequenceStepSendUiSnapshot[];
};

function outreachListHref(clientId: string): string {
  return `/clients/${clientId}/outreach`;
}

function outreachSequenceHref(
  clientId: string,
  sequenceId: string,
  opts?: { edit?: boolean },
): string {
  const q = new URLSearchParams();
  q.set("sequenceId", sequenceId);
  if (opts?.edit) q.set("edit", "1");
  return `/clients/${clientId}/outreach?${q.toString()}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function prepCountsForStatus(prep: SequencePrepSnapshot | undefined): PrepCountsSlice | null {
  if (!prep) return null;
  return {
    ready: prep.counts.ready,
    blocked: prep.counts.blocked,
    suppressed: prep.counts.suppressed,
    sent: prep.counts.sent,
    failed: prep.counts.failed,
  };
}

function badgeVariantForDashboardStatus(
  label: string,
): "default" | "secondary" | "outline" | "destructive" {
  if (label === "Blocked") return "destructive";
  if (label === "Sending") return "default";
  if (label === "Sent") return "secondary";
  if (label === "Completed") return "secondary";
  if (label === "Ready") return "secondary";
  // "No recipients ready" is informational (everyone already emailed or
  // in cooldown) — neutral outline, never the alarming destructive red.
  if (label === "No recipients ready") return "outline";
  if (label === "Draft") return "outline";
  if (label === "Archived") return "outline";
  return "outline";
}

function mailboxLabelForSequence(
  sequence: SequenceSummary,
  launchMailboxOptions: Props["launchMailboxOptions"],
): string {
  if (!sequence.launchPreferredMailboxId) {
    return "Auto-pick from pool";
  }
  const hit = launchMailboxOptions.find(
    (m) => m.id === sequence.launchPreferredMailboxId,
  );
  return hit?.label ?? sequence.launchPreferredMailboxId;
}

export function ClientEmailSequencesPanel(props: Props) {
  const {
    clientId,
    clientName,
    canMutate,
    canReengage,
    overview,
    flash,
    selectedSequenceId,
    showSequenceEditForm,
    launchReadinessBySequenceId,
    mailboxSnapshot,
    launchMailboxOptions,
    sequencePrepSnapshots,
    stepSendSnapshots,
  } = props;
  const { sequences, counts, contactLists, sequenceTemplatesByCategory } =
    overview;

  const activeSequences = sequences.filter((s) => s.status !== "ARCHIVED");
  const archivedSequences = sequences.filter((s) => s.status === "ARCHIVED");
  const archivedCount = archivedSequences.length;

  const prepBySequenceId = new Map(
    sequencePrepSnapshots.map((p) => [p.sequenceId, p] as const),
  );

  const selected =
    selectedSequenceId &&
    sequences.some((s) => s.id === selectedSequenceId)
      ? sequences.find((s) => s.id === selectedSequenceId)!
      : null;

  const launchReadyCount = activeSequences.filter(
    (s) => launchReadinessBySequenceId[s.id]?.canLaunch === true,
  ).length;

  const selectedPrep = selected ? prepBySequenceId.get(selected.id) : undefined;
  const selectedDashLabel = selected
    ? deriveOutreachDashboardStatusLabel({
        status: selected.status,
        launchReadiness: launchReadinessBySequenceId[selected.id] ?? null,
        prepCounts: prepCountsForStatus(selectedPrep),
        enrollmentPending: selected.enrollment.counts.PENDING,
      })
    : "";

  return (
    <Card
      id="client-email-sequences"
      className="scroll-mt-20 border-border/80 shadow-sm"
    >
      <CardHeader>
        <CardTitle>Sequences</CardTitle>
        <CardDescription>
          Pick a sequence to review recipients and launch. Saving edits does not send email.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {(flash.ok || flash.error) && (
          <div
            className={
              flash.error
                ? "rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                : "rounded-md border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200"
            }
          >
            {flash.error ?? flash.ok}
          </div>
        )}

        {/*
          Suppressed at zero: "0 sequences for this client." sat directly above
          the "No sequences yet." empty state, saying the same thing twice.
        */}
        {counts.total > 0 ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{String(counts.total)}</span>{" "}
            sequence{counts.total === 1 ? "" : "s"} for this client.
            {launchReadyCount > 0 ? (
              <>
                {" "}
                <span className="font-medium text-foreground">
                  {String(launchReadyCount)}
                </span>{" "}
                {launchReadyCount === 1 ? "is" : "are"} ready to launch.
              </>
            ) : null}
          </p>
        ) : null}

        <details className="rounded-lg border border-border/70 bg-muted/10">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold outline-none [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              New sequence
              <span className="text-xs font-normal text-muted-foreground">
                (expand to create)
              </span>
            </span>
          </summary>
          <div className="border-t border-border/60 p-4">
            <ClientEmailSequenceForm
              key="dashboard-create-sequence"
              clientId={clientId}
              clientName={clientName}
              canMutate={canMutate}
              focusSequenceId={null}
              sequences={sequences}
              contactLists={contactLists}
              sequenceTemplatesByCategory={sequenceTemplatesByCategory}
              launchMailboxOptions={launchMailboxOptions}
              hideSequencePicker
            />
          </div>
        </details>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">All sequences</h3>
          {activeSequences.length === 0 ? (
            <p className="rounded-md border border-dashed border-border/60 bg-muted/10 px-3 py-4 text-center text-xs text-muted-foreground">
              {archivedCount > 0
                ? `No active sequences. ${String(archivedCount)} archived sequence${archivedCount === 1 ? "" : "s"} available below.`
                : "No sequences yet. Expand \"New sequence\" above, then open your draft here to review recipients and launch."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/70">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-border/70 bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Sequence</th>
                    <th className="px-3 py-2 font-medium">List</th>
                    <th className="px-3 py-2 font-medium">Mailbox</th>
                    <th className="px-3 py-2 font-medium tabular-nums">Recipients</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeSequences.map((seq) => {
                    const lr = launchReadinessBySequenceId[seq.id] ?? null;
                    const isSel = selectedSequenceId === seq.id;
                    const prepSnap = prepBySequenceId.get(seq.id);
                    const dashLabel = deriveOutreachDashboardStatusLabel({
                      status: seq.status,
                      launchReadiness: lr,
                      prepCounts: prepCountsForStatus(prepSnap),
                      enrollmentPending: seq.enrollment.counts.PENDING,
                    });
                    return (
                      <tr
                        key={seq.id}
                        className={
                          isSel
                            ? "border-b border-border/60 bg-primary/5"
                            : "border-b border-border/60 hover:bg-muted/20"
                        }
                      >
                        <td className="max-w-[200px] px-3 py-2">
                          <div className="truncate font-medium">{seq.name}</div>
                          {seq.description ? (
                            <div className="truncate text-[11px] text-muted-foreground">
                              {seq.description}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <Link prefetch={false}
                            href={`/clients/${clientId}/lists/${seq.contactList.id}`}
                            className="line-clamp-2 underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground/60"
                          >
                            {seq.contactList.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {mailboxLabelForSequence(seq, launchMailboxOptions)}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-xs">
                          {String(seq.enrollment.total)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge
                            variant={badgeVariantForDashboardStatus(dashLabel)}
                            className="text-[10px]"
                          >
                            {dashLabel}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            <Link prefetch={false}
                              href={outreachSequenceHref(clientId, seq.id)}
                              className={buttonVariants({
                                size: "sm",
                                variant: isSel ? "default" : "outline",
                              })}
                            >
                              Open
                            </Link>
                            {(seq.status === "DRAFT" || seq.status === "READY_FOR_REVIEW") &&
                            canMutate ? (
                              <Link prefetch={false}
                                href={outreachSequenceHref(clientId, seq.id, { edit: true })}
                                className={buttonVariants({ size: "sm", variant: "outline" })}
                              >
                                Edit
                              </Link>
                            ) : null}
                            <Link prefetch={false}
                              href={outreachSequenceHref(clientId, seq.id)}
                              className={buttonVariants({ size: "sm", variant: "ghost" })}
                            >
                              Review and launch
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {archivedCount > 0 ? (
          <details className="rounded-lg border border-border/70 bg-muted/10">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold outline-none [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2">
                Archived sequences
                <Badge variant="outline" className="text-[10px]">
                  {String(archivedCount)}
                </Badge>
              </span>
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                Kept for audit — sends are paused, contacts and lists are
                untouched.
              </span>
            </summary>
            <div className="space-y-3 border-t border-border/60 p-4">
              <p className="text-xs text-muted-foreground">
                Sequences with send history are archived instead of deleted so
                the audit trail (sends, replies, suppressions) stays intact.
                Restoring a sequence puts it back into Draft so it can be
                edited and re-approved — no send is triggered.
              </p>
              <div className="overflow-x-auto rounded-lg border border-border/70">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="border-b border-border/70 bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Sequence</th>
                      <th className="px-3 py-2 font-medium">List</th>
                      <th className="px-3 py-2 font-medium">Archived</th>
                      <th className="px-3 py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archivedSequences.map((seq) => (
                      <tr
                        key={seq.id}
                        className="border-b border-border/60 hover:bg-muted/20"
                      >
                        <td className="max-w-[200px] px-3 py-2">
                          <div className="truncate font-medium">{seq.name}</div>
                          {seq.description ? (
                            <div className="truncate text-[11px] text-muted-foreground">
                              {seq.description}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <Link prefetch={false}
                            href={`/clients/${clientId}/lists/${seq.contactList.id}`}
                            className="line-clamp-2 underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground/60"
                          >
                            {seq.contactList.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {formatDate(seq.archivedAtIso)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            <Link prefetch={false}
                              href={outreachSequenceHref(clientId, seq.id)}
                              className={buttonVariants({
                                size: "sm",
                                variant: "ghost",
                              })}
                            >
                              Review
                            </Link>
                            {canMutate ? (
                              <form action={returnClientEmailSequenceToDraftAction}>
                                <input
                                  type="hidden"
                                  name="clientId"
                                  value={clientId}
                                />
                                <input
                                  type="hidden"
                                  name="sequenceId"
                                  value={seq.id}
                                />
                                <Button
                                  type="submit"
                                  size="sm"
                                  variant="outline"
                                >
                                  Restore to draft
                                </Button>
                              </form>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        ) : null}

        {selected ? (
          <div
            id="outreach-selected-sequence"
            className="scroll-mt-20 space-y-4 rounded-lg border border-border/80 bg-background p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Selected sequence
                </p>
                <h3 className="mt-1 text-lg font-semibold tracking-tight">{selected.name}</h3>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground">List</span>:{" "}
                    <Link prefetch={false}
                      href={`/clients/${clientId}/lists/${selected.contactList.id}`}
                      className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground/60"
                    >
                      {selected.contactList.name}
                    </Link>
                  </span>
                  <span>·</span>
                  <span>
                    <span className="font-medium text-foreground">Mailbox</span>:{" "}
                    {mailboxLabelForSequence(selected, launchMailboxOptions)}
                  </span>
                  <span>·</span>
                  <span>
                    <span className="font-medium text-foreground">Recipients</span>:{" "}
                    {String(selected.enrollment.total)}
                  </span>
                </div>
              </div>
              <Badge variant={badgeVariantForDashboardStatus(selectedDashLabel)}>
                {selectedDashLabel}
              </Badge>
            </div>

            <ol className="grid gap-1 text-xs">
              <li className="text-[11px] font-medium text-muted-foreground">
                Follow-ups (templates and timing)
              </li>
              {selected.steps.length === 0 ? (
                <li className="text-muted-foreground">No steps defined yet.</li>
              ) : (
                selected.steps.map((step) => (
                  <li
                    key={step.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/50 bg-muted/10 px-2 py-1"
                  >
                    <span>
                      <span className="font-medium">
                        {SEQUENCE_STEP_LABELS[step.category]}
                      </span>{" "}
                      — {step.template.name}
                    </span>
                    <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      {step.category !== "INTRODUCTION" && (
                        <span>
                          +
                          {String(step.delayDays)}d
                          {step.delayHours > 0 ? ` ${String(step.delayHours)}h` : ""}
                        </span>
                      )}
                      <Badge
                        variant={
                          step.template.status === "APPROVED" ? "default" : "outline"
                        }
                      >
                        {TEMPLATE_STATUS_LABELS[step.template.status]}
                      </Badge>
                    </span>
                  </li>
                ))
              )}
            </ol>

            {selected.status === "APPROVED" && selected.approvedBy && (
              <p className="text-[11px] text-muted-foreground">
                Went live with{" "}
                <span className="font-medium">
                  {selected.approvedBy.name ?? selected.approvedBy.email}
                </span>{" "}
                on {formatDate(selected.approvedAtIso)}
              </p>
            )}

            <LaunchReadinessBlock
              readiness={launchReadinessBySequenceId[selected.id] ?? null}
              mailboxSnapshot={mailboxSnapshot}
              prepCounts={prepCountsForStatus(selectedPrep)}
            />

            <EnrollmentBlock
              clientId={clientId}
              sequence={selected}
              canMutate={canMutate}
            />

            <SequenceSendPreparationPanel
              clientId={clientId}
              canMutate={canMutate}
              canReengage={canReengage}
              onlySequenceId={selected.id}
              snapshots={sequencePrepSnapshots}
              stepSendSnapshots={stepSendSnapshots}
              launchReadinessBySequenceId={launchReadinessBySequenceId}
              variant="embedded"
              enrollmentPendingCount={selected.enrollment.counts.PENDING}
            />

            <ActivationHint sequence={selected} />

            <div className="flex flex-wrap gap-2">
              <Link prefetch={false}
                href={outreachListHref(clientId)}
                className={buttonVariants({ size: "sm", variant: "ghost" })}
              >
                Clear selection
              </Link>
            </div>

            {canMutate && selected.status !== "ARCHIVED" && (
              <div className="space-y-2 border-t border-border/60 pt-3">
                <p className="text-[11px] text-muted-foreground">
                  Delete or archive — sequences with send history are kept for
                  audit. Delete only removes draft sequences that have never
                  sent. Contacts, lists, and mailboxes are never removed.
                </p>
                <ArchiveSequenceConfirmForm
                  action={deleteOrArchiveClientEmailSequenceAction}
                  clientId={clientId}
                  sequenceId={selected.id}
                  confirmMessage="Delete or archive this sequence? If it has send history it will be archived (kept for audit). Contacts and lists will stay available."
                >
                  <Button type="submit" size="sm" variant="destructive">
                    Delete or archive sequence
                  </Button>
                </ArchiveSequenceConfirmForm>
              </div>
            )}

            {canMutate &&
            (selected.status === "DRAFT" || selected.status === "READY_FOR_REVIEW") ? (
              <details
                className="rounded-lg border border-border/70 bg-muted/10"
                open={showSequenceEditForm}
              >
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold outline-none [&::-webkit-details-marker]:hidden">
                  Edit sequence
                </summary>
                <div className="border-t border-border/60 p-4">
                  <ClientEmailSequenceForm
                    key={`dashboard-edit-${selected.id}`}
                    clientId={clientId}
                    clientName={clientName}
                    canMutate={canMutate}
                    focusSequenceId={selected.id}
                    sequences={sequences}
                    contactLists={contactLists}
                    sequenceTemplatesByCategory={sequenceTemplatesByCategory}
                    launchMailboxOptions={launchMailboxOptions}
                    hideSequencePicker
                  />
                </div>
              </details>
            ) : null}
          </div>
        ) : activeSequences.length > 0 ? (
          <p className="rounded-md border border-dashed border-border/60 bg-muted/10 px-3 py-3 text-sm text-muted-foreground">
            Select a sequence from the table to see recipients, readiness, and launch.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ActivationHint({ sequence }: { sequence: SequenceSummary }) {
  const { readiness } = sequence;
  const canApprove = readiness.canBeApproved;

  if (canApprove || sequence.status === "ARCHIVED") return null;

  return (
    <p className="text-[11px] text-amber-700 dark:text-amber-300">
      {!readiness.hasIntroduction
        ? "Add an introduction step with a non-archived template before this sequence can send."
        : readiness.unusableStepCount > 0
          ? "A step uses an archived template — fix or replace it first."
          : readiness.emailSendableCount === 0
            ? "Target list has 0 email-sendable contacts."
            : readiness.mismatchedStepCount > 0
              ? "A step's category does not match its template."
              : "Finish required fields, then save the sequence again."}
    </p>
  );
}

function EnrollmentBlock({
  clientId,
  sequence,
  canMutate,
}: {
  clientId: string;
  sequence: SequenceSummary;
  canMutate: boolean;
}) {
  const { enrollment, status } = sequence;
  const { preview, counts, total } = enrollment;

  const canEnroll =
    canMutate && status !== "ARCHIVED" && preview.enrollable > 0;

  const gateHint = (() => {
    if (status === "DRAFT") {
      if (preview.enrollable > 0) {
        return `Your list has ${String(preview.enrollable)} new contacts with email ready to add. Save the sequence again to prepare them, or tap Review recipients below.`;
      }
      return "Save the sequence to prepare recipients from your list.";
    }
    if (status === "ARCHIVED") return "Archived sequences cannot include new recipients.";
    if (preview.total === 0) return "Target list has no members yet.";
    if (preview.enrollable === 0 && preview.alreadyEnrolled === preview.total) {
      return "Every list member is already included.";
    }
    if (preview.enrollable === 0) {
      const reasons: string[] = [];
      if (preview.missingEmail > 0) {
        reasons.push(
          `${String(preview.missingEmail)} have no email on file (Valid, no email)`,
        );
      }
      if (preview.missingIdentifier > 0) {
        reasons.push(`${String(preview.missingIdentifier)} have no contact identifier`);
      }
      if (preview.suppressed > 0) {
        reasons.push(`${String(preview.suppressed)} suppressed`);
      }
      if (reasons.length === 0) {
        return "No new contacts to add from this list.";
      }
      return `No new contacts to add — ${reasons.join(", ")}.`;
    }
    return null;
  })();

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold">Review recipients</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Adding people here does not send email — it only defines who would receive a live
            sequence.
          </p>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {String(total)} recipient{total === 1 ? "" : "s"} on this sequence
        </div>
      </div>

      <dl className="mt-2 flex flex-wrap gap-3 text-[11px]">
        <EnrollmentCountTile
          label={ENROLLMENT_STATUS_LABELS.PENDING}
          value={counts.PENDING}
        />
        <EnrollmentCountTile
          label={ENROLLMENT_STATUS_LABELS.PAUSED}
          value={counts.PAUSED}
        />
        <EnrollmentCountTile
          label={ENROLLMENT_STATUS_LABELS.COMPLETED}
          value={counts.COMPLETED}
        />
        <EnrollmentCountTile
          label={ENROLLMENT_STATUS_LABELS.EXCLUDED}
          value={counts.EXCLUDED}
        />
      </dl>

      <details className="mt-2 rounded-md border border-border/50 bg-background/40 p-2">
        <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">
          Recipient breakdown
        </summary>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3 md:grid-cols-6">
          <PreviewStat label="List members" value={preview.total} />
          <PreviewStat label="New to add" value={preview.enrollable} />
          <PreviewStat label="Already in sequence" value={preview.alreadyEnrolled} />
          <PreviewStat label="Suppressed" value={preview.suppressed} />
          <PreviewStat label="Missing email" value={preview.missingEmail} />
          <PreviewStat label="Missing identifier" value={preview.missingIdentifier} />
        </dl>
      </details>

      {canMutate && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <form action={createClientEmailSequenceEnrollmentsAction}>
            <input type="hidden" name="clientId" value={clientId} />
            <input type="hidden" name="sequenceId" value={sequence.id} />
            <FormSubmitButton size="sm" variant="outline" disabled={!canEnroll} pendingLabel="Adding…">
              {preview.alreadyEnrolled > 0 ? "Include new recipients" : "Review recipients"}
            </FormSubmitButton>
          </form>
          <span className="text-[11px] text-muted-foreground">
            Tap after list changes to add new contacts. No email is sent.
          </span>
        </div>
      )}

      {gateHint && <p className="mt-2 text-[11px] text-muted-foreground">{gateHint}</p>}
    </div>
  );
}

function PreviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border/50 bg-background/60 px-2 py-1">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums">{String(value)}</dd>
    </div>
  );
}

function LaunchReadinessBlock({
  readiness,
  mailboxSnapshot,
  prepCounts,
}: {
  readiness: SequenceLaunchReadiness | null;
  mailboxSnapshot: {
    connectedSendingCount: number;
    aggregateRemainingToday: number;
  };
  prepCounts: PrepCountsSlice | null;
}) {
  if (!readiness) {
    return (
      <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-3 text-[11px] text-muted-foreground">
        Launch status unavailable — refresh the page.
      </div>
    );
  }

  const sent = prepCounts?.sent ?? 0;
  const ready = prepCounts?.ready ?? 0;
  const blocked = prepCounts?.blocked ?? 0;
  const isFullySent = sent > 0 && ready === 0 && blocked === 0;

  if (isFullySent) {
    return (
      <div className="rounded-md border border-emerald-400/40 bg-emerald-50/60 p-3 dark:bg-emerald-500/10">
        <p className="text-sm font-semibold text-foreground">Introductions sent</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {String(sent)} introduction{sent === 1 ? "" : "s"} sent. No remaining recipients for this step.
        </p>
      </div>
    );
  }

  const blockers = staffLaunchBlockerLines(readiness.checks);
  const headerTone = readiness.canLaunch
    ? "border-emerald-400/40 bg-emerald-50/60 dark:bg-emerald-500/10"
    : "border-amber-400/40 bg-amber-50/60 dark:bg-amber-500/10";

  return (
    <div className={`rounded-md border ${headerTone} p-3`}>
      {readiness.canLaunch ? (
        <>
          <p className="text-sm font-semibold text-foreground">Ready to launch</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {String(mailboxSnapshot.connectedSendingCount)} mailbox
            {mailboxSnapshot.connectedSendingCount === 1 ? "" : "es"} connected ·{" "}
            {String(mailboxSnapshot.aggregateRemainingToday)} send
            {mailboxSnapshot.aggregateRemainingToday === 1 ? "" : "s"} available today.
          </p>
          {readiness.totalWarnings > 0 ? (
            <p className="mt-2 text-[11px] text-amber-800 dark:text-amber-200">
              {String(readiness.totalWarnings)} notice
              {readiness.totalWarnings === 1 ? "" : "s"} — you can still launch when ready.
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-foreground">Not ready to launch yet</p>
          {blockers.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[11px] text-muted-foreground">
              {blockers.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Fix the items above, then check again.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function EnrollmentCountTile({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded border border-border/40 bg-background/70 px-2 py-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="ml-1 text-sm font-semibold tabular-nums">{String(value)}</span>
    </div>
  );
}
