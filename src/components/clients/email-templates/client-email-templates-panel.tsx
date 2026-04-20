import {
  approveClientEmailTemplateAction,
  archiveClientEmailTemplateAction,
  markClientEmailTemplateReadyAction,
  returnClientEmailTemplateToDraftAction,
} from "@/app/(app)/clients/[clientId]/outreach/template-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  ClientEmailTemplateCategory,
  ClientEmailTemplateStatus,
} from "@/generated/prisma/enums";
import {
  ALL_PLACEHOLDERS,
  RECIPIENT_PLACEHOLDERS,
  SENDER_PLACEHOLDERS,
  validateTemplatePlaceholders,
} from "@/lib/email-templates/placeholders";
import {
  TEMPLATE_CATEGORY_LABELS,
  TEMPLATE_CATEGORY_ORDER,
  TEMPLATE_STATUS_LABELS,
} from "@/lib/email-templates/template-policy";
import type {
  ClientEmailTemplatesOverview,
  TemplateSummary,
} from "@/server/email-templates/queries";

import { ClientEmailTemplateForm } from "./client-email-template-form";

/**
 * Outreach-page section for per-client approved email templates
 * (PR D4a). Server component — renders counts, placeholder helper,
 * the create/edit form, and the per-category list of existing rows.
 *
 * Sending is not wired. Every action is explicit about that in copy.
 */

type Props = {
  clientId: string;
  clientName: string;
  canMutate: boolean;
  overview: ClientEmailTemplatesOverview;
  flash: {
    ok: string | null;
    error: string | null;
    focusTemplateId: string | null;
  };
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadgeVariant(
  status: ClientEmailTemplateStatus,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "APPROVED":
      return "default";
    case "READY_FOR_REVIEW":
      return "secondary";
    case "DRAFT":
      return "outline";
    case "ARCHIVED":
      return "outline";
  }
}

function groupTemplates(
  templates: TemplateSummary[],
): Map<ClientEmailTemplateCategory, TemplateSummary[]> {
  const grouped = new Map<ClientEmailTemplateCategory, TemplateSummary[]>();
  for (const cat of TEMPLATE_CATEGORY_ORDER) grouped.set(cat, []);
  for (const t of templates) grouped.get(t.category)?.push(t);
  return grouped;
}

export function ClientEmailTemplatesPanel(props: Props) {
  const { clientId, clientName, canMutate, overview, flash } = props;
  const { templates, counts } = overview;
  const grouped = groupTemplates(templates);

  const statusTiles: Array<{
    label: string;
    value: number;
    hint: string;
  }> = [
    { label: "Total", value: counts.total, hint: "All templates for this client" },
    {
      label: TEMPLATE_STATUS_LABELS.APPROVED,
      value: counts.byStatus.APPROVED,
      hint: "Eligible for future sequences",
    },
    {
      label: TEMPLATE_STATUS_LABELS.READY_FOR_REVIEW,
      value: counts.byStatus.READY_FOR_REVIEW,
      hint: "Awaiting OpensDoors approval",
    },
    {
      label: TEMPLATE_STATUS_LABELS.DRAFT,
      value: counts.byStatus.DRAFT,
      hint: "Work in progress",
    },
    {
      label: TEMPLATE_STATUS_LABELS.ARCHIVED,
      value: counts.byStatus.ARCHIVED,
      hint: "Kept for history — not usable",
    },
  ];

  return (
    <Card
      id="client-email-templates"
      className="scroll-mt-20 border-border/80 shadow-sm"
    >
      <CardHeader>
        <CardTitle>Client email templates</CardTitle>
        <CardDescription>
          Templates are approved per client before they can be used in a sequence.
          Saving or approving a template does not send email — sequences and sending
          are not enabled in this step.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {(flash.ok || flash.error) && (
          <div
            className={
              flash.error
                ? "rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                : "rounded-md border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200"
            }
          >
            {flash.error ?? flash.ok}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {statusTiles.map((tile) => (
            <div
              key={tile.label}
              className="rounded-lg border border-border/70 bg-muted/30 p-3"
            >
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {tile.label}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {tile.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{tile.hint}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <ClientEmailTemplateForm
            clientId={clientId}
            clientName={clientName}
            canMutate={canMutate}
            focusTemplateId={flash.focusTemplateId}
            templates={templates}
          />
          <aside className="rounded-lg border border-border/70 bg-muted/20 p-4">
            <h3 className="text-sm font-semibold">Supported placeholders</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Use <code>{"{{ key }}"}</code> in subject or content. Unknown
              placeholders block approval. Snake_case is canonical.
            </p>
            <PlaceholderGroupList
              title="Target recipient / company"
              items={RECIPIENT_PLACEHOLDERS}
            />
            <PlaceholderGroupList
              title="Sender / client"
              items={SENDER_PLACEHOLDERS}
            />
            <p className="mt-3 rounded border border-dashed border-border/60 bg-background/60 px-2 py-1 text-[11px] text-muted-foreground">
              <strong>Heads up:</strong> <code>{"{{sender_company_name}}"}</code>{" "}
              is the sending client, <code>{"{{company_name}}"}</code> is the
              target company.
            </p>
          </aside>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Templates by category</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {TEMPLATE_CATEGORY_ORDER.map((cat) => {
              const rows = grouped.get(cat) ?? [];
              return (
                <div
                  key={cat}
                  className="rounded-lg border border-border/70 bg-background p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">
                      {TEMPLATE_CATEGORY_LABELS[cat]}
                    </p>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {rows.length} total · {counts.approvedByCategory[cat]} approved
                    </span>
                  </div>
                  {rows.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      No templates yet.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {rows.map((t) => (
                        <li
                          key={t.id}
                          className="rounded-md border border-border/60 bg-muted/20 p-2"
                        >
                          <TemplateRow
                            clientId={clientId}
                            template={t}
                            canMutate={canMutate}
                            isFocused={flash.focusTemplateId === t.id}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PlaceholderGroupList({
  title,
  items,
}: {
  title: string;
  items: readonly (typeof ALL_PLACEHOLDERS)[number][];
}) {
  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="mt-1 space-y-1 text-xs">
        {items.map((p) => (
          <li key={p.key} className="leading-tight">
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              {`{{${p.key}}}`}
            </code>
            <span className="ml-2 text-muted-foreground">{p.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TemplateRow({
  clientId,
  template,
  canMutate,
  isFocused,
}: {
  clientId: string;
  template: TemplateSummary;
  canMutate: boolean;
  isFocused: boolean;
}) {
  const placeholders = validateTemplatePlaceholders(
    template.subject,
    template.content,
  );
  const hasUnknown = placeholders.unknown.length > 0;

  return (
    <div
      className={
        isFocused
          ? "rounded-md bg-primary/5 p-1 ring-1 ring-primary/30"
          : undefined
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{template.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {template.subjectPreview || "(no subject)"}
          </p>
        </div>
        <Badge variant={statusBadgeVariant(template.status)}>
          {TEMPLATE_STATUS_LABELS[template.status]}
        </Badge>
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
        {template.contentPreview}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
        <dt className="font-medium">Updated</dt>
        <dd className="tabular-nums">{formatDate(template.updatedAtIso)}</dd>
        {template.status === "APPROVED" && template.approvedBy && (
          <>
            <dt className="font-medium">Approved by</dt>
            <dd className="truncate">
              {template.approvedBy.name ?? template.approvedBy.email}
            </dd>
            <dt className="font-medium">Approved</dt>
            <dd className="tabular-nums">{formatDate(template.approvedAtIso)}</dd>
          </>
        )}
      </dl>
      {hasUnknown && (
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
          Unknown placeholders:{" "}
          {placeholders.unknown.map((k) => `{{${k}}}`).join(", ")} — approval
          blocked.
        </p>
      )}
      {canMutate && (
        <div className="mt-2 flex flex-wrap gap-2">
          {template.status === "DRAFT" && (
            <form action={markClientEmailTemplateReadyAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="templateId" value={template.id} />
              <Button type="submit" size="sm" variant="outline">
                Mark ready for review
              </Button>
            </form>
          )}
          {template.status === "READY_FOR_REVIEW" && (
            <>
              <form action={approveClientEmailTemplateAction}>
                <input type="hidden" name="clientId" value={clientId} />
                <input type="hidden" name="templateId" value={template.id} />
                <Button type="submit" size="sm">
                  Approve
                </Button>
              </form>
              <form action={returnClientEmailTemplateToDraftAction}>
                <input type="hidden" name="clientId" value={clientId} />
                <input type="hidden" name="templateId" value={template.id} />
                <Button type="submit" size="sm" variant="outline">
                  Return to draft
                </Button>
              </form>
            </>
          )}
          {template.status === "APPROVED" && (
            <form action={returnClientEmailTemplateToDraftAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="templateId" value={template.id} />
              <Button type="submit" size="sm" variant="outline">
                Pull back to draft
              </Button>
            </form>
          )}
          {template.status === "ARCHIVED" && (
            <form action={returnClientEmailTemplateToDraftAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="templateId" value={template.id} />
              <Button type="submit" size="sm" variant="outline">
                Restore to draft
              </Button>
            </form>
          )}
          {template.status !== "ARCHIVED" && (
            <form action={archiveClientEmailTemplateAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="templateId" value={template.id} />
              <Button type="submit" size="sm" variant="ghost">
                Archive
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
