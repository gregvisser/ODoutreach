import { draftClientSequenceWithAiAction } from "@/app/(app)/clients/[clientId]/outreach/ai-sequence-actions";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SEQUENCE_CADENCE_DAYS } from "@/lib/ai/sequence-drafting";

/**
 * "Write a whole sequence with AI" — the button that makes the feature real.
 *
 * Two things this panel is careful about, both from the spec:
 *
 * 1. IT TELLS THE TRUTH WHEN IT CANNOT RUN. The spec's instruction is to ship
 *    visible rather than dark, and that a feature which cannot yet run safely
 *    should SHOW an honest state rather than hide. So when the AI is switched
 *    off or unconfigured, the card still renders and says which — it does not
 *    disappear, and it does not offer a button that would fail on click.
 * 2. IT NEVER IMPLIES THE DRAFTS ARE READY TO SEND. The copy says drafts, says
 *    a person must approve each one, and says the client is charged. An
 *    operator who believes this button "writes the campaign" is the way an
 *    unread AI email reaches a stranger.
 */

export function AiSequenceDraftPanel({
  clientId,
  clientName,
  canMutate,
  aiEnabled,
  aiConfigured,
}: {
  clientId: string;
  clientName: string;
  canMutate: boolean;
  aiEnabled: boolean;
  aiConfigured: boolean;
}) {
  const cadence = SEQUENCE_CADENCE_DAYS.join(", ");

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>Write a whole sequence with AI</CardTitle>
        <CardDescription>
          Drafts {SEQUENCE_CADENCE_DAYS.length} emails for {clientName} in one go — sent on days{" "}
          {cadence} — using this client&apos;s brief. They are written as{" "}
          <strong>drafts</strong>: nobody can send them until a person has read and
          approved each one. The cost of writing them is added to this client&apos;s AI
          spend.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!aiEnabled ? (
          <p className="text-sm text-muted-foreground">
            AI features are currently switched off, so nothing can be drafted.
          </p>
        ) : !aiConfigured ? (
          <p className="text-sm text-muted-foreground">
            The AI is not configured on this environment yet, so nothing can be
            drafted. Ask an administrator to add the API key.
          </p>
        ) : !canMutate ? (
          <p className="text-sm text-muted-foreground">
            You do not have permission to add templates to this workspace.
          </p>
        ) : (
          <form action={draftClientSequenceWithAiAction}>
            <input type="hidden" name="clientId" value={clientId} />
            <FormSubmitButton pendingLabel="Writing the sequence…">
              Write a sequence with AI
            </FormSubmitButton>
          </form>
        )}
        <p className="text-xs text-muted-foreground">
          The AI writes the words only. The schedule — days {cadence} — is fixed by
          the system and cannot be changed by the AI.
        </p>
      </CardContent>
    </Card>
  );
}
