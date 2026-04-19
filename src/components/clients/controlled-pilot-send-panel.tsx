"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { submitControlledPilotBatchAction } from "@/app/(app)/clients/controlled-pilot-send-actions";
import {
  CONTROLLED_PILOT_CONFIRMATION_PHRASE,
  CONTROLLED_PILOT_DEFAULT_MAX_RECIPIENTS,
  CONTROLLED_PILOT_HARD_MAX_RECIPIENTS,
} from "@/lib/controlled-pilot-constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { PilotContactSummary } from "@/lib/pilot-contact-types";

export type PilotPrerequisites = {
  clientActive: boolean;
  contactCount: number;
  hasGovernedMailbox: boolean;
  oauthReady: boolean;
  /** Primary / governed mailbox email when available */
  governedMailboxEmail: string | null;
  cap: number;
  bookedInUtcDay: number;
  remaining: number;
  eligible: boolean;
  ineligibleReason: string | null;
};

type Props = {
  clientId: string;
  canMutate: boolean;
  prerequisites: PilotPrerequisites;
  /** Defaults from OpensDoors brief templates when present */
  initialSubject?: string;
  initialBody?: string;
  contactSummary?: PilotContactSummary;
};

export function ControlledPilotSendPanel({
  clientId,
  canMutate,
  prerequisites,
  initialSubject,
  initialBody,
  contactSummary,
}: Props) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [recipients, setRecipients] = useState("");
  const [subject, setSubject] = useState(
    initialSubject?.trim() || "Pilot — ODoutreach",
  );
  const [body, setBody] = useState(
    initialBody?.trim() ||
      "Hello — this is a controlled pilot message from our workspace. Reply if you have questions.",
  );
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const ready =
    prerequisites.clientActive &&
    prerequisites.hasGovernedMailbox &&
    prerequisites.oauthReady &&
    prerequisites.eligible &&
    canMutate;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setMessage(null);
    startTransition(async () => {
      const r = await submitControlledPilotBatchAction(clientId, {
        confirmationPhrase: confirmation,
        recipientLines: recipients,
        subject,
        bodyText: body,
      });
      if (r.ok) {
        setMessage({ type: "ok", text: r.message });
        setConfirmation("");
        router.refresh();
      } else {
        setMessage({ type: "err", text: r.error });
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border/80 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Launch prerequisites</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            Workspace status:{" "}
            {prerequisites.clientActive ? (
              <span className="text-foreground">ACTIVE</span>
            ) : (
              <span className="text-destructive">Not active</span>
            )}
          </li>
          <li>
            Contacts in workspace:{" "}
            <span className="font-mono text-foreground">{prerequisites.contactCount}</span>
            {contactSummary ? (
              <>
                {" "}
                · eligible (not suppressed){" "}
                <span className="font-mono text-foreground">
                  {contactSummary.eligibleCount}
                </span>{" "}
                · suppressed{" "}
                <span className="font-mono text-foreground">
                  {contactSummary.suppressedCount}
                </span>
              </>
            ) : null}
          </li>
          <li>
            Governed sending mailbox:{" "}
            {prerequisites.hasGovernedMailbox && prerequisites.governedMailboxEmail ? (
              <span className="text-foreground">{prerequisites.governedMailboxEmail}</span>
            ) : (
              <span className="text-destructive">Not configured</span>
            )}
          </li>
          <li>
            OAuth for mailbox provider:{" "}
            {prerequisites.oauthReady ? (
              <span className="text-foreground">Configured</span>
            ) : (
              <span className="text-destructive">Missing env for provider</span>
            )}
          </li>
          <li>
            UTC-day capacity: booked {prerequisites.bookedInUtcDay} / cap {prerequisites.cap} ·
            remaining {prerequisites.remaining}
            {prerequisites.ineligibleReason ? (
              <span className="text-destructive"> — {prerequisites.ineligibleReason}</span>
            ) : null}
          </li>
        </ul>
        <p className="mt-2 text-xs">
          Recipients must match <code className="text-xs">GOVERNED_TEST_EMAIL_DOMAINS</code>{" "}
          (internal/allowlisted). TODO: widen for real prospects with an explicit product flag.
        </p>
      </div>

      {!canMutate ? (
        <p className="text-sm text-muted-foreground">You do not have permission to queue pilot sends.</p>
      ) : !ready ? (
        <p className="text-sm text-muted-foreground">
          Fix the prerequisites above before queueing a pilot batch.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {contactSummary &&
          contactSummary.eligibleEmailsSample.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setRecipients(contactSummary.eligibleEmailsSample.join("\n"))
                }
              >
                Fill recipients from contacts (up to 10 eligible)
              </Button>
              <span className="text-xs text-muted-foreground">
                Uses non-suppressed emails only; allowlist policy still applies at send time.
              </span>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="pilot-recipients">Recipients (one per line, commas ok; max {CONTROLLED_PILOT_HARD_MAX_RECIPIENTS})</Label>
            <Textarea
              id="pilot-recipients"
              rows={6}
              placeholder={`Up to ${String(CONTROLLED_PILOT_DEFAULT_MAX_RECIPIENTS)} recommended per run; hard max ${String(CONTROLLED_PILOT_HARD_MAX_RECIPIENTS)}.`}
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pilot-subject">Subject</Label>
            <Input
              id="pilot-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="max-w-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pilot-body">Body (plain text)</Label>
            <Textarea id="pilot-body" rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pilot-confirm">Confirmation (type exactly)</Label>
            <Input
              id="pilot-confirm"
              autoComplete="off"
              placeholder={CONTROLLED_PILOT_CONFIRMATION_PHRASE}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              className="max-w-md font-mono"
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Queueing…" : "Queue pilot batch"}
          </Button>
          {message ? (
            <p
              className={
                message.type === "ok"
                  ? "text-sm text-foreground"
                  : "text-sm text-destructive"
              }
            >
              {message.text}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}
