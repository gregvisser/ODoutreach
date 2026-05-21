"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { clearClientReplies } from "@/app/(app)/clients/clear-client-replies-action";

/**
 * ADMIN-only destructive action: deletes every InboundReply for a client.
 * Requires typing the exact client name to confirm before the delete fires.
 */
export function ClearClientRepliesButton({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<
    { type: "ok" | "err"; text: string } | null
  >(null);

  function reset() {
    setOpen(false);
    setConfirmation("");
  }

  function submit() {
    startTransition(async () => {
      setBanner(null);
      const r = await clearClientReplies({ clientId, confirmation });
      if (r.ok) {
        setBanner({
          type: "ok",
          text:
            r.deleted === 0
              ? "No replies to clear — this client already has none."
              : `Cleared ${r.deleted} ${r.deleted === 1 ? "reply" : "replies"}.`,
        });
        reset();
        router.refresh();
      } else {
        setBanner({ type: "err", text: r.error });
      }
    });
  }

  return (
    <div className="space-y-3">
      {banner && (
        <div
          role="status"
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            banner.type === "ok"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {banner.text}
        </div>
      )}

      {!open ? (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => {
            setBanner(null);
            setOpen(true);
          }}
        >
          Clear all replies for this client
        </Button>
      ) : (
        <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm text-foreground">
            This permanently deletes <span className="font-medium">every</span>{" "}
            reply record for this client. This cannot be undone.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="clear-replies-confirm" className="text-xs">
              Type the client name to confirm:{" "}
              <span className="font-mono font-medium">{clientName}</span>
            </Label>
            <Input
              id="clear-replies-confirm"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={clientName}
              disabled={pending}
              autoComplete="off"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending || confirmation.trim() !== clientName.trim()}
              onClick={submit}
            >
              {pending ? "Clearing…" : "Permanently delete replies"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={reset}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
