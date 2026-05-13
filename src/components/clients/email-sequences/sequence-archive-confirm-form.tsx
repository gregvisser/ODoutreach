"use client";

import type { ReactNode } from "react";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  clientId: string;
  sequenceId: string;
  children: ReactNode;
  confirmMessage: string;
};

/**
 * Server-action archive with a single browser confirm — keeps the POST on the wire
 * while giving staff a clear safety prompt.
 */
export function ArchiveSequenceConfirmForm({
  action,
  clientId,
  sequenceId,
  children,
  confirmMessage,
}: Props) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="sequenceId" value={sequenceId} />
      {children}
    </form>
  );
}
