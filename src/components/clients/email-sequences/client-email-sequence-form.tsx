"use client";

import { useMemo, useState, useTransition } from "react";

import {
  createClientEmailSequenceAction,
  updateClientEmailSequenceAction,
} from "@/app/(app)/clients/[clientId]/outreach/sequence-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ClientEmailTemplateCategory } from "@/generated/prisma/enums";
import {
  SEQUENCE_DELAY_DAYS_MAX,
  SEQUENCE_STEP_LABELS,
} from "@/lib/email-sequences/sequence-policy";
import { TEMPLATE_CATEGORY_ORDER } from "@/lib/email-templates/template-policy";
import type {
  SequenceListOption,
  SequenceSummary,
  SequenceTemplateOption,
} from "@/server/email-sequences/queries";

type Props = {
  clientId: string;
  clientName: string;
  canMutate: boolean;
  focusSequenceId: string | null;
  sequences: SequenceSummary[];
  contactLists: SequenceListOption[];
  approvedTemplatesByCategory: Record<
    ClientEmailTemplateCategory,
    SequenceTemplateOption[]
  >;
};

type FormMode = { kind: "new" } | { kind: "edit"; sequenceId: string };

type StepFields = {
  templateId: string;
  delayDays: number;
};

type EditableFields = {
  name: string;
  description: string;
  contactListId: string;
  steps: Record<ClientEmailTemplateCategory, StepFields>;
};

function blankFields(): EditableFields {
  const steps = Object.fromEntries(
    TEMPLATE_CATEGORY_ORDER.map((c) => [
      c,
      { templateId: "", delayDays: c === "INTRODUCTION" ? 0 : 3 },
    ]),
  ) as Record<ClientEmailTemplateCategory, StepFields>;
  return { name: "", description: "", contactListId: "", steps };
}

function fieldsFromSequence(seq: SequenceSummary): EditableFields {
  const steps = blankFields().steps;
  for (const step of seq.steps) {
    steps[step.category] = {
      templateId: step.template.id,
      delayDays: step.delayDays,
    };
  }
  return {
    name: seq.name,
    description: seq.description ?? "",
    contactListId: seq.contactList.id,
    steps,
  };
}

export function ClientEmailSequenceForm({
  clientId,
  clientName,
  canMutate,
  focusSequenceId,
  sequences,
  contactLists,
  approvedTemplatesByCategory,
}: Props) {
  const editableSequences = useMemo(
    () =>
      sequences.filter(
        (s) => s.status === "DRAFT" || s.status === "READY_FOR_REVIEW",
      ),
    [sequences],
  );

  const [mode, setMode] = useState<FormMode>(() => {
    if (focusSequenceId) {
      const hit = sequences.find((s) => s.id === focusSequenceId);
      if (hit && (hit.status === "DRAFT" || hit.status === "READY_FOR_REVIEW")) {
        return { kind: "edit", sequenceId: hit.id };
      }
    }
    return { kind: "new" };
  });

  const [fields, setFields] = useState<EditableFields>(() => {
    if (mode.kind === "edit") {
      const hit = sequences.find((s) => s.id === mode.sequenceId);
      if (hit) return fieldsFromSequence(hit);
    }
    return blankFields();
  });

  const [isPending, startTransition] = useTransition();

  const action =
    mode.kind === "edit"
      ? updateClientEmailSequenceAction
      : createClientEmailSequenceAction;

  const disabled = !canMutate || isPending;

  const selectedList =
    contactLists.find((l) => l.id === fields.contactListId) ?? null;
  const noApprovedIntro =
    approvedTemplatesByCategory.INTRODUCTION.length === 0;
  const noContactLists = contactLists.length === 0;

  function switchToNew() {
    setMode({ kind: "new" });
    setFields(blankFields());
  }

  function switchToEdit(seq: SequenceSummary) {
    setMode({ kind: "edit", sequenceId: seq.id });
    setFields(fieldsFromSequence(seq));
  }

  function updateStep(
    category: ClientEmailTemplateCategory,
    patch: Partial<StepFields>,
  ) {
    setFields((f) => ({
      ...f,
      steps: {
        ...f.steps,
        [category]: { ...f.steps[category], ...patch },
      },
    }));
  }

  return (
    <div className="rounded-lg border border-border/70 bg-background p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">
            {mode.kind === "edit" ? "Edit sequence" : "New sequence"}
          </h3>
          <p className="text-xs text-muted-foreground">
            For {clientName}. Saving or approving a sequence does not send email.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button
            type="button"
            size="sm"
            variant={mode.kind === "new" ? "default" : "outline"}
            onClick={switchToNew}
          >
            New
          </Button>
          {editableSequences.slice(0, 3).map((s) => (
            <Button
              key={s.id}
              type="button"
              size="sm"
              variant={
                mode.kind === "edit" && mode.sequenceId === s.id
                  ? "default"
                  : "outline"
              }
              onClick={() => switchToEdit(s)}
            >
              Edit “{s.name.length > 18 ? `${s.name.slice(0, 17)}…` : s.name}”
            </Button>
          ))}
        </div>
      </div>

      {!canMutate && (
        <p className="mb-3 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
          You have view-only access for this client — sequences cannot be edited
          here.
        </p>
      )}

      {noApprovedIntro && (
        <p className="mb-3 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
          No approved <strong>Introduction</strong> template yet.{" "}
          <a
            href="#client-email-templates"
            className="font-medium underline underline-offset-2"
          >
            Approve an Introduction template
          </a>{" "}
          before marking a sequence ready.
        </p>
      )}

      {noContactLists && (
        <p className="mb-3 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
          No contact lists yet.{" "}
          <a
            href={`/clients/${clientId}/sources`}
            className="font-medium underline underline-offset-2"
          >
            Add a list in Sources
          </a>{" "}
          before creating a sequence.
        </p>
      )}

      <form
        action={(formData) => startTransition(() => action(formData))}
        className="space-y-4"
      >
        <input type="hidden" name="clientId" value={clientId} />
        {mode.kind === "edit" && (
          <input type="hidden" name="sequenceId" value={mode.sequenceId} />
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sequence-name">Sequence name</Label>
            <Input
              id="sequence-name"
              name="name"
              value={fields.name}
              onChange={(e) =>
                setFields((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="e.g. UK logistics — Q2 outbound"
              maxLength={120}
              required
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sequence-contact-list">Target email list</Label>
            <select
              id="sequence-contact-list"
              name="contactListId"
              value={fields.contactListId}
              onChange={(e) =>
                setFields((f) => ({ ...f, contactListId: e.target.value }))
              }
              required
              disabled={disabled || noContactLists}
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="" disabled>
                {noContactLists ? "No contact lists available" : "Choose a list…"}
              </option>
              {contactLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name} ({String(list.emailSendableCount)} email-sendable)
                </option>
              ))}
            </select>
            {selectedList && selectedList.emailSendableCount === 0 && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                This list has 0 email-sendable contacts — approval will be
                blocked until at least one eligible contact exists.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sequence-description">Description (optional)</Label>
          <Textarea
            id="sequence-description"
            name="description"
            value={fields.description}
            onChange={(e) =>
              setFields((f) => ({ ...f, description: e.target.value }))
            }
            placeholder="Short context so future operators know the intent of this sequence."
            rows={3}
            maxLength={1000}
            disabled={disabled}
          />
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold">Steps</p>
          <p className="text-xs text-muted-foreground">
            Pick one approved template per step. Only the Introduction step is
            required. Delay is in days after the previous step — records only
            for now.
          </p>
          <div className="grid gap-2">
            {TEMPLATE_CATEGORY_ORDER.map((category) => {
              const options = approvedTemplatesByCategory[category];
              const step = fields.steps[category];
              const isIntroduction = category === "INTRODUCTION";
              return (
                <div
                  key={category}
                  className="grid gap-2 rounded-md border border-border/60 bg-muted/20 p-3 md:grid-cols-[200px_minmax(0,1fr)_140px]"
                >
                  <div className="flex items-center">
                    <p className="text-xs font-medium">
                      {SEQUENCE_STEP_LABELS[category]}
                      {isIntroduction ? " (required)" : ""}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <select
                      name={`template_${category}`}
                      value={step.templateId}
                      onChange={(e) =>
                        updateStep(category, { templateId: e.target.value })
                      }
                      disabled={disabled || options.length === 0}
                      className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="">
                        {options.length === 0
                          ? `No approved ${SEQUENCE_STEP_LABELS[category].toLowerCase()} template`
                          : "— leave empty —"}
                      </option>
                      {options.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    {isIntroduction ? (
                      <p className="text-[11px] text-muted-foreground">
                        Introduction is day 0.
                      </p>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          name={`delay_${category}`}
                          value={String(step.delayDays)}
                          onChange={(e) =>
                            updateStep(category, {
                              delayDays: Number.parseInt(e.target.value, 10) || 0,
                            })
                          }
                          min={0}
                          max={SEQUENCE_DELAY_DAYS_MAX}
                          disabled={disabled}
                          className="h-9"
                        />
                        <span className="text-[11px] text-muted-foreground">
                          days
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={disabled}>
            {mode.kind === "edit" ? "Save changes" : "Save draft"}
          </Button>
          {mode.kind === "edit" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={switchToNew}
              disabled={disabled}
            >
              Cancel
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            Saving or approving a sequence does not send email.
          </span>
        </div>
      </form>
    </div>
  );
}
