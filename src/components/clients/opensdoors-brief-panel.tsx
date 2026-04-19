"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateOpensDoorsBriefAction } from "@/app/(app)/clients/opensdoors-brief-actions";
import type { OpensDoorsBriefFields } from "@/lib/opensdoors-brief";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  clientId: string;
  initial: OpensDoorsBriefFields;
};

const FIELDS: { key: keyof OpensDoorsBriefFields; label: string; rows?: number }[] = [
  { key: "tradingName", label: "Trading / business name (if different from workspace title)", rows: 1 },
  { key: "businessAddress", label: "Business address", rows: 2 },
  { key: "targetGeography", label: "Service areas / target geography", rows: 2 },
  { key: "targetCustomerProfile", label: "Target customer profile", rows: 3 },
  { key: "usps", label: "USPs", rows: 3 },
  { key: "offer", label: "Offer / proposition", rows: 3 },
  { key: "exclusions", label: "Exclusions / do-not-target criteria", rows: 2 },
  { key: "assetNotes", label: "Attachments / assets / notes", rows: 2 },
  { key: "complianceNotes", label: "Compliance notes", rows: 2 },
  { key: "senderIdentityNotes", label: "Approved sender identity notes", rows: 2 },
  { key: "campaignObjective", label: "Campaign objective", rows: 2 },
  { key: "sequenceNotes", label: "Sequence / message notes", rows: 3 },
  { key: "suppressionSheetUrl", label: "Suppression Google Sheet URL (reference)", rows: 1 },
  { key: "rocketReachSearchNotes", label: "RocketReach search / sourcing notes", rows: 2 },
  { key: "pilotSubjectTemplate", label: "Default pilot / first-step subject (template)", rows: 1 },
  { key: "pilotBodyTemplate", label: "Default pilot / first-step body (template)", rows: 4 },
];

export function OpensDoorsBriefPanel({ clientId, initial }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<OpensDoorsBriefFields>(initial);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function setField<K extends keyof OpensDoorsBriefFields>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const r = await updateOpensDoorsBriefAction({ clientId, brief: form });
      if (r.ok) {
        setMessage({ type: "ok", text: "Brief saved." });
        router.refresh();
      } else {
        setMessage({ type: "err", text: r.error });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {FIELDS.map(({ key, label, rows }) => (
        <div key={key} className="space-y-1.5">
          <Label htmlFor={key}>{label}</Label>
          {rows === 1 ? (
            <Input
              id={key}
              value={(form[key] as string | undefined) ?? ""}
              onChange={(e) => setField(key, e.target.value)}
            />
          ) : (
            <Textarea
              id={key}
              rows={rows ?? 3}
              value={(form[key] as string | undefined) ?? ""}
              onChange={(e) => setField(key, e.target.value)}
            />
          )}
        </div>
      ))}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save OpensDoors brief"}
      </Button>
      {message ? (
        <p
          className={
            message.type === "ok" ? "text-sm text-foreground" : "text-sm text-destructive"
          }
        >
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
