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

/**
 * Queue item 133, finding 2 — "a person cannot make out which intro goes
 * with which follow-up." The category-grouped list further down this page
 * (row 130) answers "what templates exist"; this answers the question Greg
 * actually asked: which templates belong to the SAME sequence, and in what
 * order they send. One card per sequence, steps left to right in send order.
 */
export function SequenceTemplateStructurePanel({
  structures,
}: {
  structures: readonly SequenceTemplateStructure[];
}) {
  if (structures.length === 0) return null;

  return (
    <Card id="sequence-template-structure" className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>Sequence structure</CardTitle>
        <CardDescription>
          Which templates belong to the same sequence, and the order they send in —
          the intro on the left, each follow-up after it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {structures.map((sequence) => (
          <div
            key={sequence.sequenceId}
            className="rounded-lg border border-border/70 bg-background p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">{sequence.sequenceName}</p>
              <Badge variant="outline">
                {SEQUENCE_STATUS_LABELS[sequence.sequenceStatus]}
              </Badge>
            </div>
            {sequence.steps.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No templates added to this sequence yet.
              </p>
            ) : (
              <ol className="mt-3 flex flex-wrap items-center gap-2">
                {sequence.steps.map((step, index) => (
                  <li key={step.id} className="flex items-center gap-2">
                    {index > 0 && (
                      <span aria-hidden className="text-muted-foreground">
                        →
                      </span>
                    )}
                    <div className="rounded-md border border-border/60 bg-muted/20 px-2 py-1">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {TEMPLATE_CATEGORY_LABELS[step.category]}
                      </p>
                      <p className="text-sm font-medium">{step.templateName}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
