import type { ClientEmailTemplateCategory } from "@/generated/prisma/enums";
import {
  prepareClientEmailSequenceStepSendsAction,
  sendClientEmailSequenceIntroductionAction,
  sendClientEmailSequenceStepAction,
} from "@/app/(app)/clients/[clientId]/outreach/sequence-actions";
import {
  humanizeSequenceLaunchDisabledReason,
  LIVE_SEQUENCE_LAUNCH_FOLLOW_HELP,
  LIVE_SEQUENCE_LAUNCH_INTRO_HELP,
  sequenceIntroductionBatchLimitCopy,
} from "@/lib/clients/outreach-sequence-send-staff-copy";
import { SequencePhraseConfirmLaunch } from "@/components/clients/email-sequences/sequence-phrase-confirm-launch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { outreachSequenceStatusLabel } from "@/lib/clients/outreach-staff-copy";
import {
  getSequenceStepSendConfirmationPhrase,
  SEQUENCE_INTRO_SEND_CONFIRMATION_PHRASE,
} from "@/lib/email-sequences/sequence-send-execution-constants";
import type { SequenceStepSendUiSnapshot } from "@/server/email-sequences/send-introduction";
import type { SequencePrepSnapshot } from "@/server/email-sequences/step-sends";

/**
 * PR D4e.1 — read-only "Send preparation" card for the Outreach page.
 * PR D4e.2 — adds INTRODUCTION dispatch block per sequence.
 * PR D4e.3 — adds FOLLOW_UP_1..5 dispatch blocks per sequence, each
 *            gated by the previous step having been SENT and the
 *            step's `delayDays` having elapsed. Operator-triggered
 *            only; no cron / worker / background scheduler.
 *
 * Records-only preparation remains the safe entry point. Dispatch
 * blocks send real email and require a typed confirmation phrase
 * specific to that category.
 */

type Props = {
  clientId: string;
  canMutate: boolean;
  /** When set, only this sequence is shown (dashboard selection). */
  onlySequenceId: string | null;
  snapshots: SequencePrepSnapshot[];
  /**
   * All per-category send readiness snapshots (INTRODUCTION +
   * FOLLOW_UP_1..5) for the sequences on this client. The panel
   * groups them by sequence and category.
   */
  stepSendSnapshots?: SequenceStepSendUiSnapshot[];
  /**
   * `standalone` — full-width card (legacy page placement).
   * `embedded` — inside the selected-sequence panel (no outer card).
   */
  variant?: "standalone" | "embedded";
  /** PENDING enrollment count — shown in embedded compact metrics as "Pending". */
  enrollmentPendingCount?: number;
};

const FOLLOW_UP_CATEGORIES: readonly ClientEmailTemplateCategory[] = [
  "FOLLOW_UP_1",
  "FOLLOW_UP_2",
  "FOLLOW_UP_3",
  "FOLLOW_UP_4",
  "FOLLOW_UP_5",
];

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function categoryLabel(category: ClientEmailTemplateCategory): string {
  if (category === "INTRODUCTION") return "introduction";
  const n = category.split("_").pop();
  return `follow-up ${n ?? ""}`.trim();
}

function humanizeBlockedReason(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("template") && lower.includes("not approved"))
    return "Template is not yet approved";
  if (lower.includes("missing") && lower.includes("sender"))
    return raw;
  if (lower.includes("suppressed"))
    return "Recipient suppressed";
  if (lower.includes("missing email") || lower.includes("no email"))
    return "Recipient has no email address";
  if (lower.includes("unsubscribe"))
    return "Missing unsubscribe link";
  if (lower.includes("unknown placeholder"))
    return raw;
  if (lower.includes("allowlist") || lower.includes("governed_test"))
    return "Blocked by domain allowlist";
  if (lower.includes("launch") && lower.includes("approval"))
    return "Blocked by launch approval gate";
  return raw;
}

export function SequenceSendPreparationPanel({
  clientId,
  canMutate,
  onlySequenceId,
  snapshots,
  stepSendSnapshots = [],
  variant = "standalone",
}: Props) {
  const embedded = variant === "embedded";
  const visibleSnapshots =
    onlySequenceId === null
      ? []
      : snapshots.filter((s) => s.sequenceId === onlySequenceId);
  const hasSnapshots = visibleSnapshots.length > 0;
  const hasAnyEnrollment = visibleSnapshots.some((s) => s.enrollmentCount > 0);

  // Index snapshots by (sequenceId, category) so every dispatch
  // block can look up its own readiness quickly without re-scanning.
  const snapshotsBySequenceAndCategory = new Map<
    string,
    SequenceStepSendUiSnapshot
  >();
  for (const s of stepSendSnapshots) {
    snapshotsBySequenceAndCategory.set(`${s.sequenceId}:${s.category}`, s);
  }

  const innerContent = (
    <>
      {!embedded && snapshots.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/80 bg-muted/20 p-4 text-sm text-muted-foreground">
          No sequences yet for this client. Create a sequence, then open it here to launch.
        </div>
      ) : null}
      {!embedded && snapshots.length > 0 && onlySequenceId === null ? (
        <div className="rounded-md border border-dashed border-border/80 bg-muted/20 p-4 text-sm text-muted-foreground">
          Select a sequence in the table above to review recipients and launch sends for that
          sequence only.
        </div>
      ) : null}
      {onlySequenceId !== null && !hasSnapshots ? (
        <div className="rounded-md border border-dashed border-border/80 bg-muted/20 p-4 text-sm text-muted-foreground">
          Review recipients before launching — this sequence has no launch data yet. Add steps and
          recipients, then return here.
        </div>
      ) : null}

      {visibleSnapshots.map((s) => {
        const canPrepare =
          canMutate &&
          s.introductionStepId !== null &&
          s.introductionApproved &&
          s.enrollmentCount > 0;
        const blockReasons: string[] = [];
        if (s.introductionStepId === null) {
          blockReasons.push("Sequence has no INTRODUCTION step.");
        }
        if (s.introductionStepId !== null && !s.introductionApproved) {
          blockReasons.push(
            "Introduction template is missing or archived — pick an active template.",
          );
        }
        if (s.enrollmentCount === 0) {
          blockReasons.push(
            "No recipients on this sequence yet — include list members first.",
          );
        }

        const introSnapshot = snapshotsBySequenceAndCategory.get(
          `${s.sequenceId}:INTRODUCTION`,
        );

        return (
          <div
            key={s.sequenceId}
            className="space-y-3 rounded-md border border-border/80 p-4"
          >
            {!embedded ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-medium">{s.sequenceName}</div>
                <Badge variant="outline" className="text-xs">
                  {outreachSequenceStatusLabel(s.sequenceStatus)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {s.enrollmentCount === 1
                    ? "1 recipient"
                    : `${String(s.enrollmentCount)} recipients`}
                </span>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">Ready</span>:{" "}
                {String(s.counts.ready)}
              </span>
              <span>
                <span className="font-medium text-foreground">Blocked</span>:{" "}
                {String(s.counts.blocked + s.counts.suppressed)}
              </span>
              <span>
                <span className="font-medium text-foreground">Sent</span>:{" "}
                {String(s.counts.sent)}
              </span>
              {!embedded && (
                <>
                  <span>
                    <span className="font-medium text-foreground">Failed</span>:{" "}
                    {String(s.counts.failed)}
                  </span>
                  <span>
                    <span className="font-medium text-foreground">Last prepared</span>:{" "}
                    {formatRelative(s.latestPreparedAtIso)}
                  </span>
                </>
              )}
            </div>

            {s.latestSubjectPreview ? (
              <div className="rounded-md bg-muted/30 p-3 text-xs">
                <div className="font-medium text-muted-foreground">Subject preview</div>
                <div className="mt-1 font-mono break-all">{s.latestSubjectPreview}</div>
              </div>
            ) : null}

            {blockReasons.length > 0 ? (
              <ul className="list-disc pl-5 text-xs text-muted-foreground">
                {blockReasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <form action={prepareClientEmailSequenceStepSendsAction}>
                <input type="hidden" name="clientId" value={clientId} />
                <input type="hidden" name="sequenceId" value={s.sequenceId} />
                <input
                  type="hidden"
                  name="stepId"
                  value={s.introductionStepId ?? ""}
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={!canPrepare}
                  title="Updates who can receive the next live send — does not send email."
                >
                  Review recipients
                </Button>
              </form>
              <span className="text-xs text-muted-foreground">
                Refreshes who can receive the next live send. No email is sent by this step.
              </span>
            </div>

            <IntroSendDispatchBlock
              clientId={clientId}
              canMutate={canMutate}
              sequenceId={s.sequenceId}
              introSend={introSnapshot}
            />

            <FollowUpDispatchBlocks
              clientId={clientId}
              canMutate={canMutate}
              sequenceId={s.sequenceId}
              snapshotsByCategory={snapshotsBySequenceAndCategory}
            />
          </div>
        );
      })}

      {onlySequenceId !== null && hasSnapshots && !hasAnyEnrollment ? (
        <p className="text-xs text-muted-foreground">
          Tip: include recipients on this sequence first, then review recipients here to see
          per-person readiness.
        </p>
      ) : null}
    </>
  );

  if (embedded) {
    return (
      <section id="sequence-send-preparation" className="space-y-4 border-t border-border/60 pt-4">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold">Live sends</h4>
          <p className="text-xs text-muted-foreground">
            Review recipients, then launch when checks pass. Preparing updates who is eligible — it
            does not send email.
          </p>
        </div>
        {innerContent}
      </section>
    );
  }

  return (
    <Card
      id="sequence-send-preparation"
      className="border-border/80 shadow-sm"
    >
      <CardHeader>
        <CardTitle>Live sends</CardTitle>
        <CardDescription>
          Review recipients before launching. Preparing updates who can receive the next live send
          (no email sent). Launch sends the introduction or follow-up you choose, within batch limits
          and the same safety checks as production.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">{innerContent}</CardContent>
    </Card>
  );
}

/**
 * PR D4e.2 — per-sequence INTRODUCTION dispatch block.
 *
 * Sends real email via the outbound worker. Gated by the typed
 * confirmation phrase (`SEND INTRODUCTION`) and server-side readiness.
 */
function IntroSendDispatchBlock({
  clientId,
  canMutate,
  sequenceId,
  introSend,
}: {
  clientId: string;
  canMutate: boolean;
  sequenceId: string;
  introSend: SequenceStepSendUiSnapshot | undefined;
}) {
  if (!introSend) {
    return null;
  }

  const canSend = canMutate && introSend.sendable;
  const disabledReasons: string[] = [];
  if (!canMutate) {
    disabledReasons.push("You do not have permission to launch sends for this client.");
  }
  if (introSend.disabledReason) {
    disabledReasons.push(
      humanizeSequenceLaunchDisabledReason(introSend.disabledReason) ?? introSend.disabledReason,
    );
  }

  const readyNow = introSend.eligibleInLaunchBatchNowCount;
  const cap = introSend.hardCap;
  const sendNow = Math.min(readyNow, cap);
  const waiting = Math.max(0, readyNow - sendNow);
  const blocked = introSend.blockedCount + introSend.suppressedCount;

  const introModalBody = `This queues real introduction emails for up to ${String(sendNow)} contacts now. ${waiting > 0 ? `${String(waiting)} remaining recipients stay queued for later batches. ` : ""}Follow-ups are launched separately.`;

  return (
    <div className="rounded-md border border-border/80 bg-muted/20 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-foreground">Introduction email</div>
      </div>
      <p className="mt-1 text-muted-foreground">{LIVE_SEQUENCE_LAUNCH_INTRO_HELP}</p>

      <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
        <div className="flex flex-wrap gap-4">
          <span><span className="font-medium text-foreground">Ready now</span>: {String(sendNow)}</span>
          {waiting > 0 && (
            <span><span className="font-medium text-foreground">Waiting for later batch</span>: {String(waiting)}</span>
          )}
          {blocked > 0 && (
            <span><span className="font-medium text-foreground">Blocked</span>: {String(blocked)}</span>
          )}
          {introSend.sentCount > 0 && (
            <span><span className="font-medium text-foreground">Sent</span>: {String(introSend.sentCount)}</span>
          )}
        </div>
        {sendNow > 0 && (
          <p>{sequenceIntroductionBatchLimitCopy(cap)}</p>
        )}
        {introSend.blockedReasonCounts.length > 0 && (
          <details className="mt-1">
            <summary className="cursor-pointer font-medium text-foreground">
              Blocked recipients ({String(blocked)})
            </summary>
            <ul className="mt-1 list-disc pl-5">
              {introSend.blockedReasonCounts.map((r) => (
                <li key={r.reason}>
                  {humanizeBlockedReason(r.reason)} ({String(r.count)})
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {introSend.sentCount > 0 && readyNow === 0 && blocked === 0 && disabledReasons.length === 0 ? (
        <div className="mt-2 rounded border border-green-400/50 bg-green-50/50 px-2 py-2 text-[11px] dark:bg-green-950/30">
          <p className="font-medium text-foreground">Introductions sent</p>
          <p className="mt-0.5 text-muted-foreground">
            {String(introSend.sentCount)} introduction{introSend.sentCount === 1 ? "" : "s"} sent. No remaining recipients for this step.
          </p>
        </div>
      ) : disabledReasons.length > 0 ? (
        <div className="mt-2 rounded border border-amber-400/50 bg-amber-50/50 px-2 py-2 text-[11px] dark:bg-amber-950/30">
          <p className="font-medium text-foreground">Cannot launch</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {disabledReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SequencePhraseConfirmLaunch
          formAction={sendClientEmailSequenceIntroductionAction}
          confirmationPhrase={SEQUENCE_INTRO_SEND_CONFIRMATION_PHRASE}
          modalTitle="Launch introduction sends?"
          modalBody={introModalBody}
          triggerLabel="Launch sequence"
          disabled={!canSend}
          variant="default"
        >
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="sequenceId" value={sequenceId} />
        </SequencePhraseConfirmLaunch>
        <span className="text-[11px] text-muted-foreground">
          You will confirm in a dialog before anything is queued.
        </span>
      </div>
    </div>
  );
}

/**
 * PR D4e.3 — renders one dispatch block for each FOLLOW_UP_N step that
 * exists on the sequence. Categories without a configured step are
 * hidden entirely so operators aren't offered non-existent follow-ups.
 */
function FollowUpDispatchBlocks({
  clientId,
  canMutate,
  sequenceId,
  snapshotsByCategory,
}: {
  clientId: string;
  canMutate: boolean;
  sequenceId: string;
  snapshotsByCategory: Map<string, SequenceStepSendUiSnapshot>;
}) {
  const blocks = FOLLOW_UP_CATEGORIES.map((category) => {
    const snap = snapshotsByCategory.get(`${sequenceId}:${category}`);
    return { category, snap };
  }).filter((x): x is {
    category: ClientEmailTemplateCategory;
    snap: SequenceStepSendUiSnapshot;
  } => x.snap !== undefined && x.snap.stepId !== null);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {blocks.map(({ category, snap }) => (
        <StepSendDispatchBlock
          key={category}
          clientId={clientId}
          canMutate={canMutate}
          sequenceId={sequenceId}
          category={category}
          stepSnapshot={snap}
        />
      ))}
    </div>
  );
}

/**
 * Generic per-category dispatch block (FOLLOW_UP_1..5).
 *
 * Shows readiness, previous-step blockers, and an operator-typed
 * confirmation phrase unique to the category. Uses the generic
 * `sendClientEmailSequenceStepAction`, passing `category` as a hidden
 * form field.
 */
function StepSendDispatchBlock({
  clientId,
  canMutate,
  sequenceId,
  category,
  stepSnapshot,
}: {
  clientId: string;
  canMutate: boolean;
  sequenceId: string;
  category: ClientEmailTemplateCategory;
  stepSnapshot: SequenceStepSendUiSnapshot;
}) {
  const phrase = getSequenceStepSendConfirmationPhrase(category);
  const label = categoryLabel(category);
  const canSend = canMutate && stepSnapshot.sendable;

  const disabledReasons: string[] = [];
  if (!canMutate) {
    disabledReasons.push("You do not have permission to launch sends for this client.");
  }
  if (stepSnapshot.disabledReason) {
    disabledReasons.push(
      humanizeSequenceLaunchDisabledReason(stepSnapshot.disabledReason) ??
        stepSnapshot.disabledReason,
    );
  }

  const delayDescription =
    stepSnapshot.delayDays > 0
      ? `${String(stepSnapshot.delayDays)} day(s) after the previous step was sent`
      : "after the previous step is sent";

  const followModalBody = `This queues real emails for ${label}, up to ${String(stepSnapshot.eligibleInLaunchBatchNowCount)} eligible contacts in this batch. ${sequenceIntroductionBatchLimitCopy(stepSnapshot.hardCap)} Each person must have received the previous step, with ${delayDescription}.`;

  return (
    <div className="rounded-md border border-border/80 bg-muted/15 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium capitalize text-foreground">
          {label} — live send
        </div>
      </div>
      <p className="mt-1 text-muted-foreground">{LIVE_SEQUENCE_LAUNCH_FOLLOW_HELP}</p>

      <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">This batch</span>:{" "}
          {String(stepSnapshot.eligibleInLaunchBatchNowCount)} eligible now ·{" "}
          <span className="font-medium text-foreground">Sent</span>: {String(stepSnapshot.sentCount)}
        </p>
        <p>{sequenceIntroductionBatchLimitCopy(stepSnapshot.hardCap)}</p>
        <p className="text-muted-foreground/90">
          Prior step: {String(stepSnapshot.previousStepMissingCount)} waiting · Delay:{" "}
          {String(stepSnapshot.delayPendingCount)} waiting · Next eligible:{" "}
          {formatRelative(stepSnapshot.earliestEligibleAtIso)}
        </p>
      </div>

      {disabledReasons.length > 0 ? (
        <div className="mt-2 rounded border border-amber-400/50 bg-amber-50/50 px-2 py-2 text-[11px] dark:bg-amber-950/30">
          <p className="font-medium text-foreground">Cannot launch</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {disabledReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SequencePhraseConfirmLaunch
          formAction={sendClientEmailSequenceStepAction}
          confirmationPhrase={phrase}
          modalTitle={`Launch ${label}?`}
          modalBody={followModalBody}
          triggerLabel={`Launch ${label}`}
          disabled={!canSend}
          variant="default"
        >
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="sequenceId" value={sequenceId} />
          <input type="hidden" name="category" value={category} />
        </SequencePhraseConfirmLaunch>
        <span className="text-[11px] text-muted-foreground">
          You will confirm in a dialog before anything is queued.
        </span>
      </div>
    </div>
  );
}
