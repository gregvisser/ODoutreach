"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { runRocketReachImportAction } from "@/app/(app)/clients/rocketreach-import-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ROCKETREACH_IMPORT_CONFIRMATION_PHRASE } from "@/lib/clients/rocketreach-import-safety";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ExistingList = {
  id: string;
  name: string;
  memberCount: number;
};

type Props = {
  clientId: string;
  apiKeyConfigured: boolean;
  existingLists: ExistingList[];
};

export function RocketReachImportPanel({
  clientId,
  apiKeyConfigured,
  existingLists,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [currentTitle, setCurrentTitle] = useState("");
  const [location, setLocation] = useState("");
  const [existingListId, setExistingListId] = useState("");
  const [newListName, setNewListName] = useState("");
  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  const [rawJson, setRawJson] = useState(
    '{\n  "query": { "keyword": ["Example Co"] },\n  "page_size": 5,\n  "start": 1,\n  "order_by": "relevance"\n}',
  );

  const hasListTarget =
    existingListId.trim().length > 0 || newListName.trim().length > 0;
  const confirmationOk =
    confirmationPhrase.trim() === ROCKETREACH_IMPORT_CONFIRMATION_PHRASE;

  function showResult(text: string) {
    setMessage(text);
  }

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>RocketReach import</CardTitle>
        <CardDescription>
          Search RocketReach and add matching contacts to a client list. Searching uses
          live RocketReach credits and imports at most 10 contacts per run; it never sends mail.
          <br />
          <strong>
            Imports must be saved to a named email list. Lists are used later
            by sequences.
          </strong>
          <br />
          <span className="text-xs text-muted-foreground">
            RocketReach does not have a free preview in this workflow: search and lookup use credits.
            Type the confirmation phrase before searching, then review the result message.
            Do-not-contact checks are applied after import.
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!apiKeyConfigured ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            <strong>Not configured:</strong> set <code className="text-xs">ROCKETREACH_API_KEY</code>{" "}
            on the server to enable imports. No secrets are shown here.
          </p>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="rr-existing-list">Use existing list</Label>
            <select
              id="rr-existing-list"
              value={existingListId}
              onChange={(e) => {
                setExistingListId(e.target.value);
                if (e.target.value) setNewListName("");
              }}
              disabled={existingLists.length === 0}
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {existingLists.length === 0
                  ? "No existing lists yet — type a new name →"
                  : "None (create a new list)"}
              </option>
              {existingLists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.memberCount})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rr-new-list">Or create a new list</Label>
            <Input
              id="rr-new-list"
              value={newListName}
              onChange={(e) => {
                setNewListName(e.target.value);
                if (e.target.value) setExistingListId("");
              }}
              placeholder="e.g. Manchester FDs — April 2026"
              maxLength={120}
            />
          </div>
        </div>
        {!hasListTarget ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Pick an existing list or type a new list name to enable import.
          </p>
        ) : null}

        <div className="mt-4 rounded-md border border-amber-400/60 bg-amber-50/60 p-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-100">
          <p className="font-medium">Credit warning</p>
          <p className="mt-1 text-xs">
            This search calls RocketReach People Search and Person Lookup. It may consume credits and
            write contacts immediately after the server validates results. Type{" "}
            <code className="text-xs">{ROCKETREACH_IMPORT_CONFIRMATION_PHRASE}</code> to continue.
          </p>
          <div className="mt-2 max-w-md space-y-1">
            <Label htmlFor="rr-confirm">Confirmation phrase</Label>
            <Input
              id="rr-confirm"
              value={confirmationPhrase}
              onChange={(e) => setConfirmationPhrase(e.target.value)}
              placeholder={ROCKETREACH_IMPORT_CONFIRMATION_PHRASE}
              autoComplete="off"
            />
          </div>
        </div>

        <Tabs defaultValue="builder" className="mt-4 w-full">
          <TabsList>
            <TabsTrigger value="builder">Simple search</TabsTrigger>
            <TabsTrigger value="raw">Raw JSON</TabsTrigger>
          </TabsList>
          <TabsContent value="builder" className="space-y-3 pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rr-keyword">Keyword</Label>
                <Input
                  id="rr-keyword"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rr-company">Company name</Label>
                <Input
                  id="rr-company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rr-title">Current title</Label>
                <Input
                  id="rr-title"
                  value={currentTitle}
                  onChange={(e) => setCurrentTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rr-loc">Location</Label>
                <Input id="rr-loc" value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
            </div>
            <Button
              type="button"
              disabled={pending || !apiKeyConfigured || !hasListTarget || !confirmationOk}
              onClick={() => {
                setMessage(null);
                startTransition(async () => {
                  const r = await runRocketReachImportAction({
                    clientId,
                    mode: "builder",
                    keyword: keyword || undefined,
                    companyName: companyName || undefined,
                    currentTitle: currentTitle || undefined,
                    location: location || undefined,
                    pageSize: 10,
                    existingListId: existingListId || undefined,
                    newListName: newListName || undefined,
                    confirmationPhrase,
                  });
                  if (r.ok) {
                    showResult(
                      `Imported ${String(r.imported)} into list "${r.contactListName}" (attached ${String(r.listAttachedAdded)} / skipped ${String(r.listAttachedSkipped)}). Skipped — no email: ${String(r.skippedNoEmail)}, invalid: ${String(r.skippedInvalid)}, duplicate: ${String(r.skippedDuplicate)}.${r.errors.length ? ` Notes: ${r.errors.join("; ")}` : ""}`,
                    );
                    router.refresh();
                  } else {
                    showResult(r.error);
                  }
                });
              }}
            >
              {pending ? "Importing…" : "Run import (max 10)"}
            </Button>
          </TabsContent>
          <TabsContent value="raw" className="space-y-3 pt-4">
            <Label htmlFor="rr-raw">POST body for /api/v2/person/search</Label>
            <Textarea
              id="rr-raw"
              rows={10}
              value={rawJson}
              onChange={(e) => setRawJson(e.target.value)}
              className="font-mono text-xs"
            />
            <Button
              type="button"
              disabled={pending || !apiKeyConfigured || !hasListTarget || !confirmationOk}
              onClick={() => {
                setMessage(null);
                startTransition(async () => {
                  const r = await runRocketReachImportAction({
                    clientId,
                    mode: "raw",
                    rawJson,
                    existingListId: existingListId || undefined,
                    newListName: newListName || undefined,
                    confirmationPhrase,
                  });
                  if (r.ok) {
                    showResult(
                      `Imported ${String(r.imported)} into list "${r.contactListName}" (attached ${String(r.listAttachedAdded)} / skipped ${String(r.listAttachedSkipped)}). Skipped — no email: ${String(r.skippedNoEmail)}, invalid: ${String(r.skippedInvalid)}, duplicate: ${String(r.skippedDuplicate)}.${r.errors.length ? ` Notes: ${r.errors.join("; ")}` : ""}`,
                    );
                    router.refresh();
                  } else {
                    showResult(r.error);
                  }
                });
              }}
            >
              {pending ? "Importing…" : "Run import from JSON"}
            </Button>
          </TabsContent>
        </Tabs>

        {message ? (
          <p className="mt-4 whitespace-pre-wrap text-sm text-foreground">{message}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
