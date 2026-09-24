"use client";

import { useState } from "react";

import { draftClientSequenceWithAiAction } from "@/app/(app)/clients/[clientId]/outreach/ai-sequence-actions";
import {
  SEQUENCE_DRAFT_START_FAILED_MESSAGE,
  isSequenceDraftRedirectError,
} from "@/lib/ai/sequence-draft-start";
import { AiBadge } from "@/components/ai/ai-badge";
import { FormSubmitButton } from "@/components/ui/form-submit-button";

/**
 * Submits the draft action and keeps a failed action on this card.
 *
 * A server-action rejection — an uncaught throw, an unrecognised action, or
 * a non-RSC response — is what `error.tsx` shows as "The action didn't
 * complete", often in under a second. Catching it here shows the same
 * sentence as `templateError` and does not submit again, so a timed-out or
 * crashed start is not billed twice.
 */
export function AiSequenceDraftForm({ clientId }: { clientId: string }) {
  const [startError, setStartError] = useState<string | null>(null);

  return (
    <form
      action={async (formData) => {
        setStartError(null);
        try {
          await draftClientSequenceWithAiAction(formData);
          setStartError(SEQUENCE_DRAFT_START_FAILED_MESSAGE);
        } catch (err) {
          if (isSequenceDraftRedirectError(err)) return;
          setStartError(SEQUENCE_DRAFT_START_FAILED_MESSAGE);
        }
      }}
    >
      {startError ? (
        <div
          role="alert"
          className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {startError}
        </div>
      ) : null}
      <input type="hidden" name="clientId" value={clientId} />
      <FormSubmitButton pendingLabel="Starting the draft…">
        <AiBadge>Write a sequence with AI</AiBadge>
      </FormSubmitButton>
    </form>
  );
}
