"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { runRocketReachImportAction } from "@/app/(app)/clients/rocketreach-import-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  const [rawJson, setRawJson] = useState(
    '{\n  "query": { "keyword": ["Example Co"] },\n  "page_size": 5,\n  "start": 1,\n  "order_by": "relevance"\n}',
  );

  const hasListTarget =
    existingListId.trim().length > 0 || newListName.trim().length > 0;

  function showResult(text: string) {
    setMessage(text);
  }

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>RocketReach import</CardTitle>
        <CardDescription>
          Server-side import via RocketReach People Search + Person Lookup (
          <code className="text-xs">api.rocketreach.co/api/v2</code>
          ). Uses <code className="text-xs">ROCKETREACH_API_KEY</code> — lookup consumes export
          credits per their billing. Imports at most 10 contacts per run; does not send mail.
          <br />
          <strong>
            Imports must be saved to a named email list. Lists are used later
            by sequences.
          </strong>
          <br />
          <span className="text-xs text-muted-foreground">
            Preview for RocketReach is deferred — a dry-run would still
            consume search/lookup credits against the live API, so this panel
            writes immediately up to the cap. CSV imports run through the
            Preview → Confirm flow on the global Contacts page.
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
              disabled={pending || !apiKeyConfigured || !hasListTarget}
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
              disabled={pending || !apiKeyConfigured || !hasListTarget}
              onClick={() => {
                setMessage(null);
                startTransition(async () => {
                  const r = await runRocketReachImportAction({
                    clientId,
                    mode: "raw",
                    rawJson,
                    existingListId: existingListId || undefined,
                    newListName: newListName || undefined,
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
