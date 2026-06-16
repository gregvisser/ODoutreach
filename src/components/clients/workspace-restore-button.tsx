"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { restoreWorkspaceAction } from "@/app/(app)/clients/workspace-deletion-actions";
import { Button } from "@/components/ui/button";

type Props = {
  clientId: string;
  clientName: string;
};

/** F2 — super-admin restore control for a soft-deleted workspace. */
export function WorkspaceRestoreButton({ clientId, clientName }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          const ok = window.confirm(
            `Restore the “${clientName}” workspace? It will become visible and resume normal operation.`,
          );
          if (!ok) return;
          setError(null);
          startTransition(async () => {
            const res = await restoreWorkspaceAction({ clientId });
            if (!res.ok) {
              setError(res.message);
              return;
            }
            router.refresh();
          });
        }}
      >
        {pending ? "Restoring…" : "Restore"}
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}
