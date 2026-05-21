"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import {
  resetClientOutreachBeforeCutoff,
  type OutreachResetCounts,
  type OutreachResetResult,
} from "@/app/(app)/clients/reset-client-outreach-action";

const COUNT_LABELS: Array<{ key: keyof OutreachResetCounts; label: string }> = [
  { key: "outboundEmails", label: "Outbound emails" },
  { key: "stepSends", label: "Sequence step-sends" },
  { key: "enrollments", label: "Enrollments" },
  { key: "inboundReplies", label: "Inbound replies" },
  { key: "providerEvents", label: "Provider events" },
  { key: "sendReservations", label: "Send reservations" },
];

function totalCount(c: OutreachResetCounts): number {
  return Object.values(c).reduce((a, b) => a + b, 0);
}

/**
 * ADMIN-only. Deletes pre-production test outreach (records created before a
 * cutoff date) for this client. Preview first — counts are shown before any
 * deletion, then a typed client-name confirmation is required.
 */
export function ResetClientOutreachPanel({
  clientId,
  clientName,
  defaultCutoff,
}: {
  clientId: string;
  clientName: string;
  /** YYYY-MM-DD */
  defaultCutoff: string;
}) {
  const router = useRouter();
  const [cutoff, setCutoff] = useState(defaultCutoff);
  const [preview, setPreview] = useState<{
    cutoffIso: string;
    counts: OutreachResetCounts;
  } | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<
    { type: "ok" | "err"; text: string } | null
  >(null);

  function handle(result: OutreachResetResult) {
    if (!result.ok) {
      setBanner({ type: "err", text: result.error });
      return;
    }
    if (result.mode === "preview") {
      setPreview({ cutoffIso: result.cutoffIso, counts: result.counts });
      setBanner(null);
    } else {
      const total = totalCount(result.counts);
      setBanner({
        type: "ok",
        text:
          total === 0
            ? "Nothing matched the cutoff — no records deleted."
            : `Deleted ${total} record${total === 1 ? "" : "s"} created before the cutoff.`,
      });
      setPreview(null);
      setConfirmation("");
      router.refresh();
    }
  }

  function runPreview() {
    startTransition(async () => {
      handle(
        await resetClientOutreachBeforeCutoff({
          clientId,
          cutoffIso: new Date(`${cutoff}T00:00:00Z`).toISOString(),
          mode: "preview",
        }),
      );
    });
  }

  function runDelete() {
    startTransition(async () => {
      handle(
        await resetClientOutreachBeforeCutoff({
          clientId,
          cutoffIso: new Date(`${cutoff}T00:00:00Z`).toISOString(),
          mode: "delete",
          confirmation,
        }),
      );
    });
  }

  const previewTotal = preview ? totalCount(preview.counts) : 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Permanently deletes outreach records created <span className="font-medium">before</span>{" "}
        the cutoff date for this client (sends, step-sends, enrollments, replies,
        provider events, reservations). Preserves contacts, unsubscribes /
        suppression, sequences, templates, and lists. Preview the counts first.
      </p>

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

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="reset-cutoff" className="text-xs">
            Delete records created before
          </Label>
          <Input
            id="reset-cutoff"
            type="date"
            value={cutoff}
            onChange={(e) => {
              setCutoff(e.target.value);
              setPreview(null);
            }}
            disabled={pending}
            className="w-44"
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={runPreview} disabled={pending}>
          {pending && !preview ? "Counting…" : "Preview"}
        </Button>
      </div>

      {preview && (
        <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm">
            Records created before{" "}
            <span className="font-medium">
              {new Date(preview.cutoffIso).toLocaleDateString()}
            </span>{" "}
            that will be <span className="font-medium">permanently deleted</span>:
          </p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {COUNT_LABELS.map(({ key, label }) => (
              <li key={key} className="flex justify-between">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium tabular-nums">{preview.counts[key]}</span>
              </li>
            ))}
          </ul>

          {previewTotal === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing to delete before this date.
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="reset-confirm" className="text-xs">
                  Type the client name to confirm:{" "}
                  <span className="font-mono font-medium">{clientName}</span>
                </Label>
                <Input
                  id="reset-confirm"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder={clientName}
                  disabled={pending}
                  autoComplete="off"
                />
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={pending || confirmation.trim() !== clientName.trim()}
                onClick={runDelete}
              >
                {pending ? "Deleting…" : `Permanently delete ${previewTotal} records`}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
