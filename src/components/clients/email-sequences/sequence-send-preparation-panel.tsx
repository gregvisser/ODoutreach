import { prepareClientEmailSequenceStepSendsAction } from "@/app/(app)/clients/[clientId]/outreach/sequence-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SequencePrepSnapshot } from "@/server/email-sequences/step-sends";

/**
 * PR D4e.1 — read-only "Send preparation" card for the Outreach page.
 *
 * RECORDS ONLY. The only action this card exposes is "Prepare
 * introduction send records", which writes / refreshes
 * `ClientEmailSequenceStepSend` rows through
 * `prepareClientEmailSequenceStepSendsAction`. No email is ever sent
 * by this UI. The dispatcher lands in D4e.2.
 */

type Props = {
  clientId: string;
  canMutate: boolean;
  snapshots: SequencePrepSnapshot[];
};

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export function SequenceSendPreparationPanel({
  clientId,
  canMutate,
  snapshots,
}: Props) {
  const hasSnapshots = snapshots.length > 0;
  const hasAnyEnrollment = snapshots.some((s) => s.enrollmentCount > 0);

  return (
    <Card
      id="sequence-send-preparation"
      className="border-border/80 shadow-sm"
    >
      <CardHeader>
        <CardTitle>Send preparation (records only)</CardTitle>
        <CardDescription>
          Preparing send records <strong>does not send email</strong>. It only renders the
          introduction step&rsquo;s subject and body against each enrolled contact and
          records which recipients would be ready for send once D4e.2 enables
          dispatch. Suppressed, missing-email, unknown-placeholder, and
          missing-unsubscribe-link rows are surfaced here as blocked so they can be
          fixed before any real send is wired.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasSnapshots ? (
          <div className="rounded-md border border-dashed border-border/80 bg-muted/20 p-4 text-sm text-muted-foreground">
            No sequences yet for this client. Create a sequence and add enrollments
            before preparing send records.
          </div>
        ) : null}

        {snapshots.map((s) => {
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
            blockReasons.push("INTRODUCTION template is not APPROVED.");
          }
          if (s.enrollmentCount === 0) {
            blockReasons.push("No enrollments yet — enroll contacts first.");
          }

          return (
            <div
              key={s.sequenceId}
              className="space-y-3 rounded-md border border-border/80 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-medium">{s.sequenceName}</div>
                <Badge variant="outline" className="text-xs">
                  {s.sequenceStatus}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {s.enrollmentCount === 1
                    ? "1 enrollment"
                    : `${String(s.enrollmentCount)} enrollments`}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <Stat label="Records" value={s.counts.total} />
                <Stat label="Ready" value={s.counts.ready} tone="success" />
                <Stat
                  label="Blocked"
                  value={s.counts.blocked}
                  tone={s.counts.blocked > 0 ? "warning" : "muted"}
                />
                <Stat
                  label="Suppressed"
                  value={s.counts.suppressed}
                  tone={s.counts.suppressed > 0 ? "warning" : "muted"}
                />
                <Stat
                  label="Skipped"
                  value={s.counts.skipped}
                  tone="muted"
                />
                <Stat
                  label="Sent (D4e.2+)"
                  value={s.counts.sent}
                  tone="muted"
                />
                <Stat
                  label="Failed (D4e.2+)"
                  value={s.counts.failed}
                  tone={s.counts.failed > 0 ? "error" : "muted"}
                />
                <Stat
                  label="Last prepared"
                  value={formatRelative(s.latestPreparedAtIso)}
                  tone="muted"
                  isString
                />
              </div>

              {s.latestSubjectPreview ? (
                <div className="rounded-md bg-muted/30 p-3 text-xs">
                  <div className="font-medium text-muted-foreground">
                    Latest subject preview
                  </div>
                  <div className="mt-1 font-mono break-all">
                    {s.latestSubjectPreview}
                  </div>
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
                    title="This does not send email."
                  >
                    Prepare introduction send records
                  </Button>
                </form>
                <span className="text-xs text-muted-foreground">
                  This does not send email. D4e.2 adds dispatch behind the
                  GOVERNED_TEST_EMAIL_DOMAINS allowlist.
                </span>
              </div>
            </div>
          );
        })}

        {hasSnapshots && !hasAnyEnrollment ? (
          <p className="text-xs text-muted-foreground">
            Tip: enroll contacts into a sequence first, then prepare send records
            to see per-contact readiness classified.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone = "muted",
  isString = false,
}: {
  label: string;
  value: number | string;
  tone?: "success" | "warning" | "error" | "muted";
  isString?: boolean;
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "warning"
        ? "text-amber-700 dark:text-amber-300"
        : tone === "error"
          ? "text-red-700 dark:text-red-300"
          : "text-muted-foreground";
  return (
    <div className="rounded-md border border-border/60 bg-background px-2 py-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`text-sm font-medium ${toneClass}`}>
        {isString ? String(value) : String(value)}
      </div>
    </div>
  );
}
