"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateOpensDoorsBriefAction } from "@/app/(app)/clients/opensdoors-brief-actions";
import type { OpensDoorsBriefFields } from "@/lib/opensdoors-brief";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Props = {
  clientId: string;
  initial: OpensDoorsBriefFields;
};

type FieldRow = {
  key: keyof OpensDoorsBriefFields;
  label: string;
  rows?: number;
  helper?: string;
};

const SECTIONS: {
  id: string;
  title: string;
  lead: string;
  fields: FieldRow[];
}[] = [
  {
    id: "basics",
    title: "Business basics",
    lead: "Legal and geographic context for the workspace.",
    fields: [
      {
        key: "tradingName",
        label: "Trading / business name",
        rows: 1,
        helper: "If different from the client workspace title.",
      },
      { key: "businessAddress", label: "Business address", rows: 2 },
      { key: "targetGeography", label: "Service areas / target geography", rows: 2 },
    ],
  },
  {
    id: "offer",
    title: "Offer and positioning",
    lead: "What you sell and why it matters — feeds messaging and sequencing.",
    fields: [
      { key: "usps", label: "USPs", rows: 3 },
      { key: "offer", label: "Offer / proposition", rows: 3 },
      { key: "campaignObjective", label: "Campaign objective", rows: 2 },
    ],
  },
  {
    id: "targeting",
    title: "Targeting rules",
    lead: "Who to pursue and who to avoid — reduces misfires before sourcing.",
    fields: [
      { key: "targetCustomerProfile", label: "Target customer profile", rows: 3 },
      { key: "exclusions", label: "Exclusions / do-not-target criteria", rows: 2 },
    ],
  },
  {
    id: "compliance",
    title: "Compliance and assets",
    lead: "Notes operators need before attaching or claiming compliance.",
    fields: [
      { key: "complianceNotes", label: "Compliance notes", rows: 2 },
      { key: "assetNotes", label: "Attachments / assets / notes", rows: 2 },
    ],
  },
  {
    id: "outreach",
    title: "Outreach setup",
    lead: "How sending is set up — mailboxes, voice, sequences, and tooling.",
    fields: [
      { key: "senderIdentityNotes", label: "Approved sender identity notes", rows: 2 },
      {
        key: "mailboxSetupNotes",
        label: "Outreach mailboxes — setup / naming / ownership",
        rows: 3,
        helper: "Recommended: up to five mailboxes; name owners and handoffs.",
      },
      { key: "sequenceNotes", label: "Sequence / message notes", rows: 3 },
      { key: "rocketReachSearchNotes", label: "RocketReach search / sourcing notes", rows: 2 },
      {
        key: "suppressionSheetUrl",
        label: "Suppression Google Sheet URL (reference)",
        rows: 1,
      },
      {
        key: "pilotSubjectTemplate",
        label: "Default pilot / first-step subject (template)",
        rows: 1,
      },
      {
        key: "pilotBodyTemplate",
        label: "Default pilot / first-step body (template)",
        rows: 4,
      },
    ],
  },
];

export function OpensDoorsBriefGuidedForm({ clientId, initial }: Props) {
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
    <form onSubmit={onSubmit} className="space-y-10">
      {SECTIONS.map((section, i) => (
        <section key={section.id} className="space-y-5">
          {i > 0 ? <Separator className="opacity-60" /> : null}
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">{section.title}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">{section.lead}</p>
          </div>
          <div className="space-y-5">
            {section.fields.map(({ key, label, rows, helper }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={key} className="text-foreground">
                  {label}
                </Label>
                {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
                {rows === 1 ? (
                  <Input
                    id={key}
                    className={cn("max-w-2xl")}
                    value={(form[key] as string | undefined) ?? ""}
                    onChange={(e) => setField(key, e.target.value)}
                  />
                ) : (
                  <Textarea
                    id={key}
                    rows={rows ?? 3}
                    className="min-h-[4.5rem] max-w-2xl resize-y"
                    value={(form[key] as string | undefined) ?? ""}
                    onChange={(e) => setField(key, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save onboarding brief"}
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
      </div>
    </form>
  );
}
