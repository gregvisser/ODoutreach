"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addUniverseMatchesAction,
  previewSequenceListTopUpAction,
  previewUniverseMatchesAction,
  saveSequenceListRefillAction,
} from "@/app/(app)/clients/list-refill-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ROCKETREACH_TOP_UP_DISABLE_PHRASE,
  ROCKETREACH_TOP_UP_ENABLE_PHRASE,
} from "@/lib/clients/rocketreach-import-safety";
import { AUTOMATIC_LIST_TOP_UP_TRAINING } from "@/lib/clients/rocketreach-top-up-copy";
import {
  ROCKETREACH_AUTO_TOP_UP_HORIZON_DAYS,
  ROCKETREACH_AUTO_TOP_UP_MAX_BATCH,
} from "@/lib/clients/rocketreach-import-cap";
import { DEFAULT_TOP_UP_DAILY_SAFETY_BUDGET } from "@/lib/clients/rocketreach-refill-policy";
import { formatStaffDate, formatStaffDateTime } from "@/lib/datetime/staff-datetime";
import type { SequenceListTopUpView } from "@/lib/clients/rocketreach-top-up-view";

type PreviewMatch = {
  name: string;
  title: string | null;
  employer: string | null;
  location: string | null;
  wouldLookup: boolean;
  source: "Universe" | "RocketReach";
};

type UniverseMatch = {
  universeId: string;
  name: string;
  title: string | null;
  employer: string | null;
  location: string | null;
  kind: "attach" | "create";
};

export function AutomaticListTopUpPanel({
  clientId,
  topUp,
  canMutate,
}: {
  clientId: string;
  topUp: SequenceListTopUpView;
  canMutate: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<PreviewMatch[] | null>(null);
  const [universeMatches, setUniverseMatches] = useState<UniverseMatch[] | null>(null);
  const [pending, startTransition] = useTransition();
  const rule = topUp.rule;
  const status = !rule?.enabled
    ? "Off"
    : !topUp.killSwitchOn
      ? "On for this sequence, but the server switch ROCKETREACH_AUTO_REFILL is off, so nothing will be searched."
      : !topUp.clientAllows
        ? `On for this sequence, but it will not run. ${topUp.clientBlockReason ?? ""}`
        : "On. When the list falls below the threshold, the scheduled job adds a batch of 10 to 30 people, Universe first.";

  return (
    <section aria-label="Automatic list top-up" className="space-y-3 rounded-lg border border-border/80 bg-muted/10 p-4">
      <div>
        <h4 className="text-sm font-semibold">Automatic list top-up</h4>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{AUTOMATIC_LIST_TOP_UP_TRAINING}</p>
      </div>
      <p className="text-sm">
        <span className="font-medium">Status:</span> {status}
      </p>
      <p className="text-xs text-muted-foreground">
        List: {topUp.listName}. Ready and not enrolled: {String(topUp.readyNotEnrolled)}.
        {rule?.enabledByName ? ` Turned on by ${rule.enabledByName}${rule.enabledAt ? ` on ${formatStaffDate(rule.enabledAt)}` : ""}.` : ""}
      </p>
      <p className="text-xs text-muted-foreground">
        Last run: {topUp.lastRun ? `${topUp.lastRun.status} · ${formatStaffDateTime(topUp.lastRun.finishedAt)} · credits ${String(topUp.lastRun.creditsUsed)} · added ${String(topUp.lastRun.contactsAdded)}. ${topUp.lastRun.detail ?? ""}` : "None yet."}
      </p>
      <p className="text-xs text-muted-foreground">
        {topUp.nextTopUp.batch > 0
          ? `Next top-up: ${String(topUp.nextTopUp.batch)} people, sized to about ${String(topUp.nextTopUp.sendCapacity ?? 0)} emails the connected mailboxes can safely send over the next ${String(ROCKETREACH_AUTO_TOP_UP_HORIZON_DAYS)} days.`
          : `Next top-up: none right now. ${topUp.nextTopUp.note ?? ""}`}
        {" "}Each top-up is 10 to 30 people and repeats whenever the list runs low. There is no monthly credit cap; the client pays its own RocketReach bill.
      </p>
      <p className="text-xs text-muted-foreground">
        Credits reserved today: {String(topUp.creditsUsedToday)}
        {topUp.budgetLeftToday !== null ? ` · daily safety budget left ${String(topUp.budgetLeftToday)}` : ""}.
        The day uses UTC.
      </p>
      {canMutate ? (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const enabled = data.get("enabled") === "on";
            startTransition(async () => {
              const result = await saveSequenceListRefillAction(clientId, {
                sequenceId: topUp.sequenceId,
                planId: String(data.get("planId") ?? ""),
                enabled,
                lowWaterMark: Number(data.get("lowWaterMark")),
                maxCreditsPerDay: Number(data.get("maxCreditsPerDay")),
                balanceFloor: Number(data.get("balanceFloor")),
                confirmationPhrase: String(data.get("confirmationPhrase") ?? ""),
              });
              setMessage(result.ok ? (enabled ? "Automatic list top-up is on for this sequence." : "Automatic list top-up is off for this sequence.") : result.error);
              if (result.ok) {
                setPreview(null);
                setUniverseMatches(null);
                router.refresh();
              }
            });
          }}
        >
          <label className="block text-xs sm:col-span-2">
            Research plan
            <select name="planId" defaultValue={rule?.planId ?? ""} required className="mt-1 block h-9 w-full rounded-lg border border-input bg-background px-3 text-sm">
              <option value="" disabled>Choose a saved plan</option>
              {topUp.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </select>
          </label>
          <Field name="lowWaterMark" label="Keep at least this many ready, not enrolled" defaultValue={rule?.lowWaterMark ?? 25} min={1} max={500} />
          <Field
            name="maxCreditsPerDay"
            label="Daily safety budget (credits)"
            defaultValue={Math.max(rule?.maxCreditsPerDay ?? DEFAULT_TOP_UP_DAILY_SAFETY_BUDGET, ROCKETREACH_AUTO_TOP_UP_MAX_BATCH)}
            min={ROCKETREACH_AUTO_TOP_UP_MAX_BATCH}
            max={200}
          />
          <Field name="balanceFloor" label="Stop when the account balance is at or below" defaultValue={rule?.balanceFloor ?? 50} min={0} max={1000000} />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="enabled" defaultChecked={rule?.enabled ?? false} />
            Top-up this sequence&apos;s list
          </label>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor={`top-up-confirm-${topUp.sequenceId}`}>Confirmation</Label>
            <Input id={`top-up-confirm-${topUp.sequenceId}`} name="confirmationPhrase" autoComplete="off" placeholder={rule?.enabled ? ROCKETREACH_TOP_UP_DISABLE_PHRASE : ROCKETREACH_TOP_UP_ENABLE_PHRASE} required />
            <p className="text-xs text-muted-foreground">
              Type {ROCKETREACH_TOP_UP_ENABLE_PHRASE} to turn it on, or {ROCKETREACH_TOP_UP_DISABLE_PHRASE} to turn it off.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" disabled={pending || topUp.plans.length === 0}>{pending ? "Saving…" : rule?.enabled ? "Save top-up" : "Save top-up"}</Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending || topUp.plans.length === 0}
              onClick={(event) => {
                const form = event.currentTarget.form;
                const planId = String(new FormData(form ?? undefined).get("planId") ?? "");
                setMessage("");
                startTransition(async () => {
                  const result = await previewSequenceListTopUpAction(clientId, topUp.sequenceId, planId);
                  if (!result.ok) {
                    setPreview(null);
                    setMessage(result.error);
                    return;
                  }
                  setUniverseMatches(null);
                  setPreview(result.matches);
                  setMessage(result.detail);
                });
              }}
            >
              Preview top-up
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending || topUp.plans.length === 0}
              onClick={(event) => {
                const form = event.currentTarget.form;
                const planId = String(new FormData(form ?? undefined).get("planId") ?? "");
                setMessage("");
                startTransition(async () => {
                  const result = await previewUniverseMatchesAction(clientId, topUp.sequenceId, planId);
                  if (!result.ok) {
                    setUniverseMatches(null);
                    setMessage(result.error);
                    return;
                  }
                  setPreview(null);
                  setUniverseMatches(result.matches);
                  setMessage(result.detail);
                });
              }}
            >
              Find matches in Universe
            </Button>
            {universeMatches && universeMatches.length > 0 ? (
              <Button
                type="button"
                disabled={pending}
                onClick={(event) => {
                  const planId = String(new FormData(event.currentTarget.form ?? undefined).get("planId") ?? "");
                  startTransition(async () => {
                    const result = await addUniverseMatchesAction(clientId, topUp.sequenceId, planId);
                    setMessage(result.ok ? result.detail : result.error);
                    if (result.ok) {
                      setUniverseMatches(null);
                      router.refresh();
                    }
                  });
                }}
              >
                Add Universe matches to the list
              </Button>
            ) : null}
          </div>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">You can review top-up status here. Changing it needs a staff member who can edit this sequence.</p>
      )}
      {universeMatches && universeMatches.length > 0 ? (
        <ul className="space-y-1 text-xs">
          {universeMatches.map((match) => (
            <li key={match.universeId}>
              {match.name}{match.title ? ` · ${match.title}` : ""}{match.employer ? ` · ${match.employer}` : ""}{match.location ? ` · ${match.location}` : ""} — {match.kind === "create" ? "Re-harvest from Universe, no credit" : "Already held by this client, no credit"}
            </li>
          ))}
        </ul>
      ) : null}
      {preview && preview.length > 0 ? (
        <ul className="space-y-1 text-xs">
          {preview.map((match) => (
            <li key={`${match.source}-${match.name}-${match.employer ?? ""}`}>
              {match.name}{match.title ? ` · ${match.title}` : ""}{match.employer ? ` · ${match.employer}` : ""}{match.location ? ` · ${match.location}` : ""} — {match.source === "Universe" ? "Universe, no credit" : match.wouldLookup ? "RocketReach, would use 1 credit" : "RocketReach, already known, no credit"}
            </li>
          ))}
        </ul>
      ) : null}
      {message ? <p role="status" className="text-sm">{message}</p> : null}
    </section>
  );
}

function Field({ name, label, defaultValue, min, max }: { name: string; label: string; defaultValue: number; min: number; max: number }) {
  return (
    <label className="block text-xs">
      {label}
      <Input name={name} type="number" required min={min} max={max} step={1} defaultValue={defaultValue} className="mt-1" />
    </label>
  );
}
