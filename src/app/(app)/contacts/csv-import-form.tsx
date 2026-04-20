"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { importContactsCsvAction } from "@/app/(app)/contacts/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? "Importing…" : "Import CSV"}
    </Button>
  );
}

export type ClientListOption = {
  id: string;
  name: string;
  memberCount: number;
};

export function CsvImportForm({
  clients,
  listsByClientId = {},
}: {
  clients: { id: string; name: string }[];
  /** Per-client existing list options, for the "use existing list" picker. */
  listsByClientId?: Record<string, ClientListOption[]>;
}) {
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [existingListId, setExistingListId] = useState<string>("");
  const [newListName, setNewListName] = useState<string>("");

  const lists = useMemo(
    () => listsByClientId[selectedClientId] ?? [],
    [listsByClientId, selectedClientId],
  );

  const hasListTarget =
    existingListId.trim().length > 0 || newListName.trim().length > 0;

  return (
    <Card className="border-dashed border-primary/30 bg-primary/5 shadow-sm">
      <CardHeader>
        <CardTitle>CSV import</CardTitle>
        <CardDescription>
          Imports must be saved to a named email list. Lists are used later by
          sequences. Accepted headings (fields may be empty):{" "}
          <span className="font-mono text-foreground">
            Name, Employer, Title, First Name, Last Name, Location, City,
            Country, LinkedIn, Job1 Title, A Emails, Mobile Phone Number,
            Office Number
          </span>
          . A contact is <em>valid</em> if it is not suppressed and has at
          least one of: email, LinkedIn, mobile phone, or office phone. It is{" "}
          <em>email-sendable</em> only when it also has an email address.
          Email is still required for intake persistence today; rows without a
          valid email are skipped. Legacy aliases (email, full_name,
          first_name, last_name, company, title, domain, source) remain
          supported.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={importContactsCsvAction} className="space-y-4">
          <div className="grid gap-2 sm:max-w-md">
            <Label htmlFor="clientId">Client workspace</Label>
            <select
              id="clientId"
              name="clientId"
              required
              value={selectedClientId}
              onChange={(e) => {
                setSelectedClientId(e.target.value);
                setExistingListId("");
              }}
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 sm:max-w-md">
            <Label htmlFor="existingListId">Use existing list (optional)</Label>
            <select
              id="existingListId"
              name="existingListId"
              value={existingListId}
              onChange={(e) => {
                setExistingListId(e.target.value);
                if (e.target.value) setNewListName("");
              }}
              disabled={!selectedClientId || lists.length === 0}
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {selectedClientId && lists.length === 0
                  ? "No existing lists for this client — type a new name below"
                  : "None (create a new list)"}
              </option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.memberCount})
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 sm:max-w-md">
            <Label htmlFor="newListName">
              Or create a new list{" "}
              <span className="text-xs text-muted-foreground">
                (required if no existing list selected)
              </span>
            </Label>
            <Input
              id="newListName"
              name="newListName"
              type="text"
              placeholder="e.g. Manchester Finance Directors — April 2026"
              value={newListName}
              onChange={(e) => {
                setNewListName(e.target.value);
                if (e.target.value) setExistingListId("");
              }}
              maxLength={120}
            />
          </div>
          <div className="grid gap-2 sm:max-w-md">
            <Label htmlFor="file">CSV file</Label>
            <Input id="file" name="file" type="file" accept=".csv,text/csv" required />
          </div>
          <SubmitButton disabled={clients.length === 0 || !hasListTarget} />
          {clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No accessible workspaces — ask an admin to grant membership or use an ADMIN
              account.
            </p>
          ) : null}
          {!hasListTarget ? (
            <p className="text-xs text-muted-foreground">
              Pick an existing list or type a new list name to enable import.
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
