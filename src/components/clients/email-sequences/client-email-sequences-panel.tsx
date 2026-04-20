import {
  approveClientEmailSequenceAction,
  archiveClientEmailSequenceAction,
  markClientEmailSequenceReadyAction,
  returnClientEmailSequenceToDraftAction,
} from "@/app/(app)/clients/[clientId]/outreach/sequence-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ClientEmailSequenceStatus } from "@/generated/prisma/enums";
import {
  SEQUENCE_STATUS_LABELS,
  SEQUENCE_STEP_LABELS,
} from "@/lib/email-sequences/sequence-policy";
import type {
  ClientEmailSequencesOverview,
  SequenceSummary,
} from "@/server/email-sequences/queries";

import { ClientEmailSequenceForm } from "./client-email-sequence-form";

/**
 * Outreach-page section for per-client email sequences (PR D4b).
 * Server component — renders counts, the edit form, and per-sequence
 * cards with approval/archive actions. No send/schedule buttons.
 */

type Props = {
  clientId: string;
  clientName: string;
  canMutate: boolean;
  overview: ClientEmailSequencesOverview;
  flash: {
    ok: string | null;
    error: string | null;
    focusSequenceId: string | null;
  };
};

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

function statusBadgeVariant(
  status: ClientEmailSequenceStatus,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "APPROVED":
      return "default";
    case "READY_FOR_REVIEW":
      return "secondary";
    case "DRAFT":
      return "outline";
    case "ARCHIVED":
      return "outline";
  }
}

export function ClientEmailSequencesPanel(props: Props) {
  const { clientId, clientName, canMutate, overview, flash } = props;
  const { sequences, counts, contactLists, approvedTemplatesByCategory } =
    overview;

  const statusTiles: Array<{ label: string; value: number; hint: string }> = [
    {
      label: "Total",
      value: counts.total,
      hint: "All sequences for this client",
    },
    {
      label: SEQUENCE_STATUS_LABELS.APPROVED,
      value: counts.byStatus.APPROVED,
      hint: "Signed off by OpensDoors",
    },
    {
      label: SEQUENCE_STATUS_LABELS.READY_FOR_REVIEW,
      value: counts.byStatus.READY_FOR_REVIEW,
      hint: "Awaiting OpensDoors approval",
    },
    {
      label: SEQUENCE_STATUS_LABELS.DRAFT,
      value: counts.byStatus.DRAFT,
      hint: "Work in progress",
    },
    {
      label: SEQUENCE_STATUS_LABELS.ARCHIVED,
      value: counts.byStatus.ARCHIVED,
      hint: "Kept for history — not usable",
    },
  ];

  return (
    <Card
      id="client-email-sequences"
      className="scroll-mt-20 border-border/80 shadow-sm"
    >
      <CardHeader>
        <CardTitle>Email sequences</CardTitle>
        <CardDescription>
          Sequences combine an email list with approved templates. This step
          only saves the sequence; it does not send email.
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

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {statusTiles.map((tile) => (
            <div
              key={tile.label}
              className="rounded-lg border border-border/70 bg-muted/30 p-3"
            >
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {tile.label}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {tile.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{tile.hint}</p>
            </div>
          ))}
        </div>

        <ClientEmailSequenceForm
          clientId={clientId}
          clientName={clientName}
          canMutate={canMutate}
          focusSequenceId={flash.focusSequenceId}
          sequences={sequences}
          contactLists={contactLists}
          approvedTemplatesByCategory={approvedTemplatesByCategory}
        />

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Sequences</h3>
          {sequences.length === 0 ? (
            <p className="rounded-md border border-dashed border-border/60 bg-muted/10 px-3 py-4 text-center text-xs text-muted-foreground">
              No sequences yet. Create one above to save a draft — sending stays
              disabled.
            </p>
          ) : (
            <ul className="space-y-3">
              {sequences.map((seq) => (
                <li key={seq.id}>
                  <SequenceCard
                    clientId={clientId}
                    sequence={seq}
                    canMutate={canMutate}
                    isFocused={flash.focusSequenceId === seq.id}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="rounded-md border border-dashed border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
          <strong>Safety:</strong> Saving or approving a sequence does not send
          email. Sending remains disabled in this step.
        </p>
      </CardContent>
    </Card>
  );
}

function SequenceCard({
  clientId,
  sequence,
  canMutate,
  isFocused,
}: {
  clientId: string;
  sequence: SequenceSummary;
  canMutate: boolean;
  isFocused: boolean;
}) {
  const { readiness } = sequence;
  const canReady =
    readiness.approvedIntroduction &&
    readiness.unapprovedStepCount === 0 &&
    readiness.mismatchedStepCount === 0 &&
    readiness.hasContactList;
  const canApprove = readiness.canBeApproved;

  return (
    <div
      className={
        isFocused
          ? "rounded-lg border border-primary/40 bg-primary/5 p-3 ring-1 ring-primary/20"
          : "rounded-lg border border-border/70 bg-background p-3"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold">{sequence.name}</p>
            <Badge variant={statusBadgeVariant(sequence.status)}>
              {SEQUENCE_STATUS_LABELS[sequence.status]}
            </Badge>
          </div>
          {sequence.description && (
            <p className="mt-1 text-xs text-muted-foreground">
              {sequence.description}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Target list:{" "}
            <span className="font-medium text-foreground">
              {sequence.contactList.name}
            </span>{" "}
            · {String(sequence.contactList.emailSendableCount)} email-sendable
            / {String(sequence.contactList.memberCount)} members
          </p>
        </div>
        <div className="text-right text-[11px] text-muted-foreground">
          <p>{String(sequence.steps.length)} step(s)</p>
          <p className="tabular-nums">Updated {formatDate(sequence.updatedAtIso)}</p>
        </div>
      </div>

      <ol className="mt-3 grid gap-1 text-xs">
        {sequence.steps.length === 0 ? (
          <li className="text-muted-foreground">No steps defined yet.</li>
        ) : (
          sequence.steps.map((step) => (
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
                  <span>+{String(step.delayDays)}d</span>
                )}
                <Badge
                  variant={
                    step.template.status === "APPROVED"
                      ? "default"
                      : "outline"
                  }
                >
                  {step.template.status}
                </Badge>
              </span>
            </li>
          ))
        )}
      </ol>

      {sequence.status === "APPROVED" && sequence.approvedBy && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Approved by{" "}
          <span className="font-medium">
            {sequence.approvedBy.name ?? sequence.approvedBy.email}
          </span>{" "}
          on {formatDate(sequence.approvedAtIso)}
        </p>
      )}

      {!canApprove && sequence.status !== "ARCHIVED" && (
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
          {!readiness.approvedIntroduction
            ? "Needs an APPROVED introduction template before this sequence can be approved."
            : readiness.unapprovedStepCount > 0
              ? "A step uses a non-approved template — approval is blocked."
              : readiness.emailSendableCount === 0
                ? "Target list has 0 email-sendable contacts."
                : readiness.mismatchedStepCount > 0
                  ? "A step's category does not match its template."
                  : "Approval checks not yet satisfied."}
        </p>
      )}

      {canMutate && (
        <div className="mt-3 flex flex-wrap gap-2">
          {sequence.status === "DRAFT" && (
            <form action={markClientEmailSequenceReadyAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="sequenceId" value={sequence.id} />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={!canReady}
              >
                Mark ready for review
              </Button>
            </form>
          )}
          {sequence.status === "READY_FOR_REVIEW" && (
            <>
              <form action={approveClientEmailSequenceAction}>
                <input type="hidden" name="clientId" value={clientId} />
                <input type="hidden" name="sequenceId" value={sequence.id} />
                <Button type="submit" size="sm" disabled={!canApprove}>
                  Approve
                </Button>
              </form>
              <form action={returnClientEmailSequenceToDraftAction}>
                <input type="hidden" name="clientId" value={clientId} />
                <input type="hidden" name="sequenceId" value={sequence.id} />
                <Button type="submit" size="sm" variant="outline">
                  Return to draft
                </Button>
              </form>
            </>
          )}
          {sequence.status === "APPROVED" && (
            <form action={returnClientEmailSequenceToDraftAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="sequenceId" value={sequence.id} />
              <Button type="submit" size="sm" variant="outline">
                Pull back to draft
              </Button>
            </form>
          )}
          {sequence.status === "ARCHIVED" && (
            <form action={returnClientEmailSequenceToDraftAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="sequenceId" value={sequence.id} />
              <Button type="submit" size="sm" variant="outline">
                Restore to draft
              </Button>
            </form>
          )}
          {sequence.status !== "ARCHIVED" && (
            <form action={archiveClientEmailSequenceAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="sequenceId" value={sequence.id} />
              <Button type="submit" size="sm" variant="ghost">
                Archive
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
