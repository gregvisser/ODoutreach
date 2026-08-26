"use client";

import { useState, useTransition } from "react";

import {
  addDomainToFamilyAction,
  removeDomainFromFamilyAction,
} from "@/app/(app)/clients/do-not-contact-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type FamilyView = {
  label: string;
  isBlocking: boolean;
  members: { id: string; domain: string; isSuppressed: boolean }[];
};

/**
 * Related-company domains (Ruling 3).
 *
 * A client says "do not contact BT" and gives you bt.com. Someone at
 * bteurope.com is on the list. This is where a human records that they are the
 * same company — nothing is guessed, because bteurope.com and bt.com share no
 * text and any rule that connected them would connect unrelated things too.
 */
export function DomainFamilyPanel({
  clientId,
  families,
}: {
  clientId: string;
  families: FamilyView[];
}) {
  const [label, setLabel] = useState("");
  const [domain, setDomain] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    startTransition(async () => {
      const r = await addDomainToFamilyAction({ clientId, label, domain });
      if (!r.ok) {
        setIsError(true);
        setMessage(r.error);
        return;
      }
      setIsError(false);
      setMessage(
        r.blocking
          ? `Added ${r.domain} to ${r.label}. Anyone at that domain is now blocked${
              r.contactsFlagged > 0
                ? ` — ${String(r.contactsFlagged)} contact${r.contactsFlagged === 1 ? "" : "s"} in this workspace are affected`
                : ""
            }.`
          : `Added ${r.domain} to ${r.label}. Nothing is blocked yet — no domain in ${r.label} is on the do-not-contact list, so add one above.`,
      );
      setDomain("");
    });
  }

  function remove(id: string) {
    if (pending) return;
    startTransition(async () => {
      const r = await removeDomainFromFamilyAction({ clientId, id });
      if (!r.ok) {
        setIsError(true);
        setMessage(r.error);
        return;
      }
      setIsError(false);
      setMessage("Removed. That domain can receive outreach again.");
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="family-label">Company</Label>
          <Input
            id="family-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="BT"
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="family-domain">Their domain</Label>
          <Input
            id="family-domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="bteurope.com"
            disabled={pending}
          />
        </div>
        <Button type="submit" disabled={pending || !label.trim() || !domain.trim()}>
          {pending ? "Saving…" : "Add domain"}
        </Button>
      </form>

      {message ? (
        <p className={isError ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {message}
        </p>
      ) : null}

      {families.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No related companies listed yet. Add one whenever a client blocks a
          company that trades under more than one domain.
        </p>
      ) : (
        <ul className="space-y-3">
          {families.map((f) => (
            <li key={f.label} className="rounded-lg border border-border/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{f.label}</span>
                {f.isBlocking ? (
                  <Badge variant="default">Blocking</Badge>
                ) : (
                  <Badge variant="outline">Listed, not blocking</Badge>
                )}
              </div>
              {!f.isBlocking ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  None of these domains is on the do-not-contact list, so this
                  group is not stopping any sends yet.
                </p>
              ) : null}
              <ul className="mt-2 space-y-1">
                {f.members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-mono">
                      {m.domain}
                      {m.isSuppressed ? (
                        <span className="ml-2 font-sans text-xs text-muted-foreground">
                          on the do-not-contact list
                        </span>
                      ) : null}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => remove(m.id)}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
