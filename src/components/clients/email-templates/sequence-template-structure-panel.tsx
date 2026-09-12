import Link from "next/link";
import type { TemplateSummary } from "@/server/email-templates/queries";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SEQUENCE_STATUS_LABELS } from "@/lib/email-sequences/sequence-policy";
import { TEMPLATE_CATEGORY_LABELS } from "@/lib/email-templates/template-policy";
import type { SequenceTemplateStructure } from "@/server/email-sequences/queries";

export function SequenceTemplateStructurePanel({
  structures, templates, clientId, canMutate,
}: {
  structures: readonly SequenceTemplateStructure[];
  templates: readonly TemplateSummary[];
  clientId: string;
  canMutate: boolean;
}) {
  if (structures.length === 0) return null;
  const byId = new Map(templates.map((template) => [template.id, template]));

  return (
    <Card id="sequence-template-structure" className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>Templates by sequence</CardTitle>
        <CardDescription>
          Open a named sequence to see its introduction and follow-ups together,
          in sending order. An email can be shared by more than one sequence.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {structures.map((sequence) => (
          <details
            key={sequence.sequenceId}
            className="rounded-lg border border-border/70 bg-background p-3"
          >
            <summary className="cursor-pointer rounded-md p-2 focus-visible:outline-2 focus-visible:outline-primary">
              <span className="ml-2 break-words text-sm font-semibold">{sequence.sequenceName}</span>{" "}
              <span className="mx-2 text-xs text-muted-foreground">{sequence.steps.length} emails</span>
              <Badge variant="outline">
                {SEQUENCE_STATUS_LABELS[sequence.sequenceStatus]}
              </Badge>
            </summary>
            {sequence.steps.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No templates added to this sequence yet.
              </p>
            ) : (
              <ol className="mt-3 space-y-3 border-t pt-3">
                {sequence.steps.map((step, index) => (
                  <li key={step.id}>
                    <div className="rounded-md border border-border/60 bg-muted/20 px-2 py-1">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Step {index + 1} Â· {TEMPLATE_CATEGORY_LABELS[step.category]}
                      </p>
                      <p className="break-words text-sm font-medium">{step.templateName}</p>
                      <p className="mt-2 break-words text-sm"><strong>Subject:</strong> {byId.get(step.templateId)?.subject ?? "Archived email — open the editor to view"}</p>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm">{byId.get(step.templateId)?.content}</p>
                      {canMutate && <Link prefetch={false} href={`/clients/${clientId}/templates?templateId=${encodeURIComponent(step.templateId)}${step.templateStatus === "ARCHIVED" ? "&showArchived=1" : ""}#client-email-templates`} className="mt-3 inline-block text-sm font-medium text-primary underline underline-offset-2">Open email editor</Link>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </details>
        ))}
      </CardContent>
    </Card>
  );
}
