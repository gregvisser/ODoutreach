"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteClientContactListAction } from "@/app/(app)/clients/contact-list-actions";
import { Button } from "@/components/ui/button";

type ListRow = {
  id: string;
  name: string;
  memberCount: number;
  updatedAt: string;
};

type Props = {
  clientId: string;
  lists: ListRow[];
};

export function ClientWorkspaceContactLists({ clientId, lists }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {message ? (
        <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">{message}</p>
      ) : null}

      {lists.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/80 bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
          No lists yet. Import contacts below to create the first one.
        </p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-md border border-border/80">
          {lists.map((l) => (
            <li
              key={l.id}
              className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{l.name}</p>
                <p className="text-xs text-muted-foreground">
                  {l.memberCount} {l.memberCount === 1 ? "member" : "members"} · Updated {l.updatedAt}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={pending}
                onClick={() => {
                  const ok = window.confirm(
                    "Delete this client list?\n\nContacts will stay in Universe and can still be reused.",
                  );
                  if (!ok) return;
                  setMessage(null);
                  startTransition(async () => {
                    const fd = new FormData();
                    fd.set("clientId", clientId);
                    fd.set("listId", l.id);
                    const r = await deleteClientContactListAction(fd);
                    if (!r.ok) {
                      setMessage(r.error);
                      return;
                    }
                    if (r.mode === "archived") {
                      setMessage(r.message);
                    } else {
                      setMessage(`List “${l.name}” was removed from this workspace.`);
                    }
                    router.refresh();
                  });
                }}
              >
                Delete list
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
