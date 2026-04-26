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
  sequenceTemplatesByCategory: Record<
    ClientEmailTemplateCategory,
    SequenceTemplateOption[]
  >;
  /** Eligible send mailboxes; empty = none connected. */
  launchMailboxOptions: Array<{ id: string; email: string; label: string }>;
};

type FormMode = { kind: "new" } | { kind: "edit"; sequenceId: string };

type StepFields = {
  templateId: string;
  delayDays: number;
  delayHours: number;
};

type EditableFields = {
  name: string;
  description: string;
  contactListId: string;
  launchPreferredMailboxId: string;
  steps: Record<ClientEmailTemplateCategory, StepFields>;
};

const FOLLOW_UP_CATS = TEMPLATE_CATEGORY_ORDER.filter(
  (c) => c !== "INTRODUCTION",
) as ClientEmailTemplateCategory[];

function followUpIndex(cat: ClientEmailTemplateCategory): number {
  if (cat === "INTRODUCTION") return 0;
  return Number.parseInt(cat.split("_").pop() ?? "0", 10) || 0;
}

function maxFollowUpSlotFromSequence(seq: SequenceSummary): number {
  let m = 0;
  for (const s of seq.steps) {
    if (s.category === "INTRODUCTION") continue;
    m = Math.max(m, followUpIndex(s.category));
  }
  return m;
}

function blankFields(): EditableFields {
  const steps = Object.fromEntries(
    TEMPLATE_CATEGORY_ORDER.map((c) => [
      c,
      {
        templateId: "",
        delayDays: c === "INTRODUCTION" ? 0 : 3,
        delayHours: 0,
      },
    ]),
  ) as Record<ClientEmailTemplateCategory, StepFields>;
  return {
    name: "",
    description: "",
    contactListId: "",
    launchPreferredMailboxId: "",
    steps,
  };
}

function fieldsFromSequence(seq: SequenceSummary): EditableFields {
  const steps = blankFields().steps;
  for (const step of seq.steps) {
    steps[step.category] = {
      templateId: step.template.id,
      delayDays: step.delayDays,
      delayHours: step.delayHours,
    };
  }
  return {
    name: seq.name,
    description: seq.description ?? "",
    contactListId: seq.contactList.id,
    launchPreferredMailboxId: seq.launchPreferredMailboxId ?? "",
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
  sequenceTemplatesByCategory,
  launchMailboxOptions,
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

  const [visibleFollowUpSlots, setVisibleFollowUpSlots] = useState(() => {
    if (mode.kind === "edit") {
      const hit = sequences.find((s) => s.id === mode.sequenceId);
      if (hit) return maxFollowUpSlotFromSequence(hit);
    }
    return 0;
  });

  const [isPending, startTransition] = useTransition();

  const action =
    mode.kind === "edit"
      ? updateClientEmailSequenceAction
      : createClientEmailSequenceAction;

  const disabled = !canMutate || isPending;

  const selectedList =
    contactLists.find((l) => l.id === fields.contactListId) ?? null;
  const noIntroTemplate =
    sequenceTemplatesByCategory.INTRODUCTION.length === 0;
  const noContactLists = contactLists.length === 0;

  const visibleCategories = useMemo((): ClientEmailTemplateCategory[] => {
    const fu = FOLLOW_UP_CATS.filter(
      (_, i) => i < visibleFollowUpSlots,
    ) as ClientEmailTemplateCategory[];
    return ["INTRODUCTION", ...fu];
  }, [visibleFollowUpSlots]);

  function switchToNew() {
    setMode({ kind: "new" });
    setFields(blankFields());
    setVisibleFollowUpSlots(0);
  }

  function switchToEdit(seq: SequenceSummary) {
    setMode({ kind: "edit", sequenceId: seq.id });
    setFields(fieldsFromSequence(seq));
    setVisibleFollowUpSlots(maxFollowUpSlotFromSequence(seq));
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

  function addFollowUp() {
    setVisibleFollowUpSlots((n) => Math.min(5, n + 1));
  }

  function removeLastFollowUp() {
    setVisibleFollowUpSlots((n) => {
      if (n <= 0) return 0;
      const cat = `FOLLOW_UP_${String(n)}` as ClientEmailTemplateCategory;
      setFields((f) => ({
        ...f,
        steps: {
          ...f.steps,
          [cat]: { templateId: "", delayDays: 3, delayHours: 0 },
        },
      }));
      return n - 1;
    });
  }

  return (
    <div className="rounded-lg border border-border/70 bg-background p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">
            {mode.kind === "edit" ? "Edit sequence" : "New sequence"}
          </h3>
          <p className="text-xs text-muted-foreground">
            For {clientName}. Configure steps here; sending runs from
            the Send section after you review.
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

      {noIntroTemplate && (
        <p className="mb-3 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
          No <strong>Introduction</strong> email template yet.{" "}
          <a
            href="#client-email-templates"
            className="font-medium underline underline-offset-2"
          >
            Create a template
          </a>{" "}
          in the section above, then return here to attach it to the
          sequence.
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
              placeholder="e.g. Q2 — logistics outreach"
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
                This list has 0 email-sendable contacts — add contacts before
                you can send.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="launch-mailbox">Sending mailbox</Label>
          <select
            id="launch-mailbox"
            name="launchPreferredMailboxId"
            value={fields.launchPreferredMailboxId}
            onChange={(e) =>
              setFields((f) => ({
                ...f,
                launchPreferredMailboxId: e.target.value,
              }))
            }
            disabled={disabled}
            className="flex h-9 w-full max-w-md rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">
              Auto-pick from eligible connected mailboxes
            </option>
            {launchMailboxOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({m.email})
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">
            Respects daily limits and the shared workspace mailbox pool. Choose a
            specific mailbox, or leave as auto-pick.
          </p>
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
            placeholder="Context for your team: audience, offer, and guardrails."
            rows={3}
            maxLength={1000}
            disabled={disabled}
          />
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Steps</p>
              <p className="text-xs text-muted-foreground">
                Start with an introduction. Add follow-ups only if you need
                them — they are optional.
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addFollowUp}
                disabled={disabled || visibleFollowUpSlots >= 5}
              >
                + Add follow-up
              </Button>
              {visibleFollowUpSlots > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={removeLastFollowUp}
                  disabled={disabled}
                >
                  Remove last follow-up
                </Button>
              ) : null}
            </div>
          </div>

          {TEMPLATE_CATEGORY_ORDER.map((category) => {
            if (!visibleCategories.includes(category)) {
              return (
                <div key={category} className="hidden">
                  <input
                    type="hidden"
                    name={`template_${category}`}
                    value=""
                  />
                  <input
                    type="hidden"
                    name={`delay_${category}`}
                    value="0"
                  />
                  <input
                    type="hidden"
                    name={`delayHours_${category}`}
                    value="0"
                  />
                </div>
              );
            }
            const options = sequenceTemplatesByCategory[category];
            const step = fields.steps[category];
            const isIntroduction = category === "INTRODUCTION";
            return (
              <div
                key={category}
                className="grid gap-2 rounded-md border border-border/60 bg-muted/20 p-3 md:grid-cols-[minmax(0,160px)_minmax(0,1fr)] md:items-start"
              >
                <div>
                  <p className="text-xs font-medium">
                    {SEQUENCE_STEP_LABELS[category]}
                    {isIntroduction ? " (required)" : ""}
                  </p>
                </div>
                <div className="space-y-2">
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
                        ? "No template for this step type"
                        : "— choose template —"}
                    </option>
                    {options.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name} ({opt.status})
                      </option>
                    ))}
                  </select>
                  {isIntroduction ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted-foreground">First send</span>
                      <Input
                        type="number"
                        name="delay_INTRODUCTION"
                        value={String(step.delayDays)}
                        onChange={(e) =>
                          updateStep(category, {
                            delayDays: Number.parseInt(e.target.value, 10) || 0,
                          })
                        }
                        min={0}
                        max={SEQUENCE_DELAY_DAYS_MAX}
                        disabled={disabled}
                        className="h-8 w-20"
                      />
                      <span className="text-muted-foreground">days</span>
                      <Input
                        type="number"
                        name="delayHours_INTRODUCTION"
                        value={String(step.delayHours)}
                        onChange={(e) =>
                          updateStep(category, {
                            delayHours: Number.parseInt(e.target.value, 10) || 0,
                          })
                        }
                        min={0}
                        max={23}
                        disabled={disabled}
                        className="h-8 w-16"
                      />
                      <span className="text-muted-foreground">hours</span>
                      <span className="text-[11px] text-muted-foreground">
                        (0/0 = send as soon as you launch; otherwise scheduled)
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted-foreground">After previous</span>
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
                        className="h-8 w-20"
                      />
                      <span className="text-muted-foreground">days</span>
                      <Input
                        type="number"
                        name={`delayHours_${category}`}
                        value={String(step.delayHours)}
                        onChange={(e) =>
                          updateStep(category, {
                            delayHours: Number.parseInt(e.target.value, 10) || 0,
                          })
                        }
                        min={0}
                        max={23}
                        disabled={disabled}
                        className="h-8 w-16"
                      />
                      <span className="text-muted-foreground">hours</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={disabled}>
            {mode.kind === "edit" ? "Save changes" : "Save sequence"}
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
            Saving does not send email — use the Send section when you are
            ready to queue messages.
          </span>
        </div>
      </form>
    </div>
  );
}
