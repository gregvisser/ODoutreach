"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { softDeleteWorkspaceAction } from "@/app/(app)/clients/workspace-deletion-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  WORKSPACE_RECOVERY_WINDOW_DAYS,
  workspaceDeletionConfirmationMatches,
} from "@/lib/clients/workspace-deletion-confirm";

type Props = {
  clientId: string;
  clientName: string;
};

/**
 * F2 — super-admin-only "danger zone" for soft-deleting a workspace.
 *
 * The delete button stays disabled until the operator types the exact
 * workspace name. Deletion is reversible (Settings → Deleted workspaces) for
 * the recovery window; it does NOT remove suppression / DNC data and does NOT
 * permanently destroy anything. Only render this when the viewer is a
 * super-admin — the server action re-checks regardless.
 */
export function WorkspaceDangerZone({ clientId, clientName }: Props) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirmed = workspaceDeletionConfirmationMatches(typed, clientName);

  return (
    <Card className="border-destructive/40 bg-destructive/5 shadow-sm">
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>
        <CardDescription>
          Delete this workspace. It is hidden everywhere and stops sending
          immediately, but stays recoverable for {WORKSPACE_RECOVERY_WINDOW_DAYS}{" "}
          days in Settings → Deleted workspaces. No emails, sequences or
          suppression / do-not-contact records are altered or removed.
          Permanent destruction is a separate, deliberate step.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <label className="block text-sm font-medium" htmlFor="workspace-delete-confirm">
          Type the workspace name{" "}
          <span className="font-semibold">“{clientName}”</span> to confirm:
        </label>
        <Input
          id="workspace-delete-confirm"
          autoComplete="off"
          value={typed}
          disabled={pending}
          placeholder={clientName}
          onChange={(e) => {
            setTyped(e.target.value);
            if (error) setError(null);
          }}
        />

        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={!confirmed || pending}
          onClick={() => {
            if (!confirmed) return;
            const ok = window.confirm(
              `Delete the “${clientName}” workspace?\n\nIt will be hidden and stop sending. You can restore it within ${String(
                WORKSPACE_RECOVERY_WINDOW_DAYS,
              )} days from Settings → Deleted workspaces.`,
            );
            if (!ok) return;
            setError(null);
            startTransition(async () => {
              const res = await softDeleteWorkspaceAction({
                clientId,
                typedConfirmation: typed,
              });
              if (!res.ok) {
                setError(res.message);
                return;
              }
              router.push("/clients");
              router.refresh();
            });
          }}
        >
          {pending ? "Deleting…" : "Delete workspace"}
        </Button>
      </CardContent>
    </Card>
  );
}
