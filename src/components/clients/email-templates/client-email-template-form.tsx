"use client";

import { useMemo, useState, useTransition } from "react";

import {
  createClientEmailTemplateAction,
  updateClientEmailTemplateAction,
} from "@/app/(app)/clients/[clientId]/outreach/template-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ClientEmailTemplateCategory } from "@/generated/prisma/enums";
import { validateTemplatePlaceholders } from "@/lib/email-templates/placeholders";
import {
  TEMPLATE_CATEGORY_LABELS,
  TEMPLATE_CATEGORY_ORDER,
} from "@/lib/email-templates/template-policy";
import type { TemplateSummary } from "@/server/email-templates/queries";

type Props = {
  clientId: string;
  clientName: string;
  canMutate: boolean;
  focusTemplateId: string | null;
  templates: TemplateSummary[];
};

type FormMode = { kind: "new" } | { kind: "edit"; templateId: string };

type EditableFields = {
  name: string;
  category: ClientEmailTemplateCategory | "";
  subject: string;
  content: string;
};

const BLANK: EditableFields = {
  name: "",
  category: "",
  subject: "",
  content: "",
};

/**
 * Client-side form for creating or editing a `ClientEmailTemplate`.
 * The approve / archive / status actions live in the server-component
 * row so they stay progressively-enhanced even without JS.
 *
 * This component intentionally does NOT render a "Send test" button —
 * PR D4a does not wire templates to any mailbox.
 */
export function ClientEmailTemplateForm({
  clientId,
  clientName,
  canMutate,
  focusTemplateId,
  templates,
}: Props) {
  const editableTemplates = useMemo(
    () =>
      templates.filter(
        (t) => t.status === "DRAFT" || t.status === "READY_FOR_REVIEW",
      ),
    [templates],
  );

  const [mode, setMode] = useState<FormMode>(() => {
    if (focusTemplateId) {
      const hit = templates.find((t) => t.id === focusTemplateId);
      if (hit && (hit.status === "DRAFT" || hit.status === "READY_FOR_REVIEW")) {
        return { kind: "edit", templateId: hit.id };
      }
    }
    return { kind: "new" };
  });

  const [fields, setFields] = useState<EditableFields>(() => {
    if (mode.kind === "edit") {
      const hit = templates.find((t) => t.id === mode.templateId);
      if (hit) {
        return {
          name: hit.name,
          category: hit.category,
          subject: hit.subject,
          content: hit.content,
        };
      }
    }
    return BLANK;
  });

  const [isPending, startTransition] = useTransition();

  const placeholders = useMemo(
    () => validateTemplatePlaceholders(fields.subject, fields.content),
    [fields.subject, fields.content],
  );

  function switchToNew() {
    setMode({ kind: "new" });
    setFields(BLANK);
  }

  function switchToEdit(template: TemplateSummary) {
    setMode({ kind: "edit", templateId: template.id });
    setFields({
      name: template.name,
      category: template.category,
      subject: template.subject,
      content: template.content,
    });
  }

  const action =
    mode.kind === "edit"
      ? updateClientEmailTemplateAction
      : createClientEmailTemplateAction;

  const disabled = !canMutate || isPending;

  return (
    <div className="rounded-lg border border-border/70 bg-background p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">
            {mode.kind === "edit" ? "Edit template" : "New template"}
          </h3>
          <p className="text-xs text-muted-foreground">
            For {clientName}. Saving or approving a template does not send email.
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
          {editableTemplates.slice(0, 3).map((t) => (
            <Button
              key={t.id}
              type="button"
              size="sm"
              variant={
                mode.kind === "edit" && mode.templateId === t.id
                  ? "default"
                  : "outline"
              }
              onClick={() => switchToEdit(t)}
            >
              Edit “{t.name.length > 18 ? `${t.name.slice(0, 17)}…` : t.name}”
            </Button>
          ))}
        </div>
      </div>

      {!canMutate && (
        <p className="mb-3 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
          You have view-only access for this client — templates cannot be edited
          here.
        </p>
      )}

      <form
        action={(formData) => startTransition(() => action(formData))}
        className="space-y-4"
      >
        <input type="hidden" name="clientId" value={clientId} />
        {mode.kind === "edit" && (
          <input type="hidden" name="templateId" value={mode.templateId} />
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="template-name">Template name</Label>
            <Input
              id="template-name"
              name="name"
              value={fields.name}
              onChange={(e) =>
                setFields((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="e.g. Intro v1 — logistics"
              maxLength={120}
              required
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="template-category">Category</Label>
            <select
              id="template-category"
              name="category"
              value={fields.category}
              onChange={(e) =>
                setFields((f) => ({
                  ...f,
                  category: e.target.value as
                    | ClientEmailTemplateCategory
                    | "",
                }))
              }
              required
              disabled={disabled}
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="" disabled>
                Choose a category…
              </option>
              {TEMPLATE_CATEGORY_ORDER.map((cat) => (
                <option key={cat} value={cat}>
                  {TEMPLATE_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="template-subject">Email subject</Label>
          <Input
            id="template-subject"
            name="subject"
            value={fields.subject}
            onChange={(e) =>
              setFields((f) => ({ ...f, subject: e.target.value }))
            }
            placeholder="Hi {{first_name}} — quick question"
            maxLength={200}
            required
            disabled={disabled}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="template-content">Email content</Label>
          <Textarea
            id="template-content"
            name="content"
            value={fields.content}
            onChange={(e) =>
              setFields((f) => ({ ...f, content: e.target.value }))
            }
            placeholder={
              "Hi {{first_name}},\n\nShort plain-text opener about {{company_name}}…\n\n{{sender_name}}\n{{email_signature}}\n{{unsubscribe_link}}"
            }
            rows={10}
            required
            disabled={disabled}
          />
        </div>

        <PlaceholderPreview
          knownUsed={placeholders.knownUsed}
          unknown={placeholders.unknown}
        />

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
            Saving a template does not send email.
          </span>
        </div>
      </form>
    </div>
  );
}

function PlaceholderPreview({
  knownUsed,
  unknown,
}: {
  knownUsed: string[];
  unknown: string[];
}) {
  if (knownUsed.length === 0 && unknown.length === 0) return null;
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
      <p className="font-medium">Placeholders in this draft</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {knownUsed.map((k) => (
          <code
            key={`ok-${k}`}
            className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200"
          >
            {`{{${k}}}`}
          </code>
        ))}
        {unknown.map((k) => (
          <code
            key={`bad-${k}`}
            className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900 dark:bg-amber-500/15 dark:text-amber-200"
          >
            {`{{${k}}}`} — unknown
          </code>
        ))}
      </div>
      {unknown.length > 0 && (
        <p className="mt-1 text-amber-700 dark:text-amber-300">
          Approval will be blocked until unknown placeholders are removed.
        </p>
      )}
    </div>
  );
}
