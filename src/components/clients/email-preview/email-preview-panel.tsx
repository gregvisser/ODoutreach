"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  listPreviewableSequencesAction,
  previewOutreachEmailAction,
  type PreviewableSequence,
} from "@/app/(app)/clients/[clientId]/outreach/preview-actions";
import type { ClientEmailTemplateCategory } from "@/generated/prisma/enums";

type PreviewState = {
  subject: string;
  html: string;
  bodyText: string;
  sequenceName: string;
  category: string;
  contactLabel: string;
  mailboxLabel: string;
};

/**
 * Feature B — pre-send preview. Renders the EXACT final email (same render
 * pipeline as the live send) for a chosen sequence/step in a sandboxed iframe.
 * Mounted only when PRE_SEND_PREVIEW_ENABLED is on.
 */
export function EmailPreviewPanel({ clientId }: { clientId: string }) {
  const [sequences, setSequences] = useState<PreviewableSequence[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sequenceId, setSequenceId] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    listPreviewableSequencesAction(clientId).then((res) => {
      if (!active) return;
      if (res.ok) {
        setSequences(res.sequences);
        const first = res.sequences.find((s) => s.categories.length > 0);
        if (first) {
          setSequenceId(first.id);
          setCategory(first.categories[0]);
        }
      } else {
        setLoadError(res.error);
      }
    });
    return () => {
      active = false;
    };
  }, [clientId]);

  const selected = sequences.find((s) => s.id === sequenceId) ?? null;
  const categories = selected?.categories ?? [];

  function generate() {
    if (!sequenceId || !category) return;
    setError(null);
    startTransition(async () => {
      const res = await previewOutreachEmailAction({
        clientId,
        sequenceId,
        category: category as ClientEmailTemplateCategory,
      });
      if (res.ok) {
        setPreview({
          subject: res.preview.subject,
          html: res.preview.html,
          bodyText: res.preview.bodyText,
          sequenceName: res.preview.sequenceName,
          category: res.preview.category,
          contactLabel: res.preview.contactLabel,
          mailboxLabel: res.preview.mailboxLabel,
        });
      } else {
        setPreview(null);
        setError(res.error);
      }
    });
  }

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Pre-send preview</CardTitle>
        <CardDescription>
          See the exact email a recipient will receive — rendered through the
          same pipeline as a real send (merge fields, branded signature, and
          unsubscribe footer). Uses a sample recipient.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm">
            <span className="mb-1 block font-medium">Sequence</span>
            <select
              value={sequenceId}
              onChange={(e) => {
                const id = e.target.value;
                setSequenceId(id);
                const seq = sequences.find((s) => s.id === id);
                setCategory(seq?.categories[0] ?? "");
              }}
              className="w-full rounded-md border px-3 py-2"
            >
              {sequences.length === 0 ? (
                <option value="">No sequences</option>
              ) : (
                sequences.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="flex-1 text-sm">
            <span className="mb-1 block font-medium">Step</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
            >
              {categories.length === 0 ? (
                <option value="">No template steps</option>
              ) : (
                categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))
              )}
            </select>
          </label>
          <Button
            type="button"
            onClick={generate}
            disabled={pending || !sequenceId || !category}
            className="shrink-0"
          >
            {pending ? "Rendering…" : "Generate preview"}
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {preview ? (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <div>
                <span className="text-muted-foreground">Subject:</span>{" "}
                <span className="font-medium">{preview.subject}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                From <strong>{preview.mailboxLabel}</strong> · merge data:{" "}
                {preview.contactLabel}
              </div>
            </div>
            {/* Sandboxed: scripts/forms/popups disabled, same-origin denied. */}
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={preview.html}
              className="h-[28rem] w-full rounded-md border bg-white"
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
