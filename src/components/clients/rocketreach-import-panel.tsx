"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { runRocketReachImportAction } from "@/app/(app)/clients/rocketreach-import-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ROCKETREACH_IMPORT_CONFIRMATION_PHRASE,
  isRocketReachImportConfirmationValid,
} from "@/lib/clients/rocketreach-import-safety";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
  const [maxResults, setMaxResults] = useState(10);
  const [existingListId, setExistingListId] = useState("");
  const [newListName, setNewListName] = useState("");
  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  const [rawJson, setRawJson] = useState(
    '{\n  "query": { "keyword": ["Example Co"] },\n  "page_size": 5,\n  "start": 1,\n  "order_by": "relevance"\n}',
  );

  const hasListTarget =
    existingListId.trim().length > 0 || newListName.trim().length > 0;
  const confirmationOk = isRocketReachImportConfirmationValid(confirmationPhrase);

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>RocketReach search</CardTitle>
        <CardDescription>
          Search RocketReach, then import up to 10 matching people into a named list in this workspace.
          Contacts are also saved to Universe. This never sends email. RocketReach charges may apply when
          the search runs — there is no separate free preview step in this workflow.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!apiKeyConfigured ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            <strong>Not configured:</strong> RocketReach is not enabled on this server yet.
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
                  ? "No lists yet — type a new name below"
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
            Pick an existing list or type a new list name before running a search.
          </p>
        ) : null}

        <div className="mt-4 rounded-md border border-amber-400/60 bg-amber-50/60 p-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-100">
          <p className="font-medium">RocketReach may use credits</p>
          <p className="mt-1 text-xs">
            Type <code className="text-xs">{ROCKETREACH_IMPORT_CONFIRMATION_PHRASE}</code> to continue.
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

        <div className="mt-6 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Search</p>
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
              <Label htmlFor="rr-company">Employer</Label>
              <Input
                id="rr-company"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Company name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rr-title">Job1 Title</Label>
              <Input
                id="rr-title"
                value={currentTitle}
                onChange={(e) => setCurrentTitle(e.target.value)}
                placeholder="Role or title"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rr-loc">Location</Label>
              <Input
                id="rr-loc"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City, region, or country"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rr-max">Max results</Label>
              <Input
                id="rr-max"
                type="number"
                min={1}
                max={10}
                value={maxResults}
                onChange={(e) => setMaxResults(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
              />
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
                  pageSize: maxResults,
                  existingListId: existingListId || undefined,
                  newListName: newListName || undefined,
                  confirmationPhrase,
                });
                if (r.ok) {
                  setMessage(
                    `Done — saved ${String(r.imported)} people to list “${r.contactListName}” and Universe (${String(r.universeCreated)} new, ${String(r.universeMatched)} matched). Skipped: no email ${String(r.skippedNoEmail)}, invalid ${String(r.skippedInvalid)}, duplicate ${String(r.skippedDuplicate)}.${r.errors.length ? ` Notes: ${r.errors.join("; ")}` : ""}`,
                  );
                  router.refresh();
                } else {
                  setMessage(r.error);
                }
              });
            }}
          >
            {pending ? "Working…" : "Search and import"}
          </Button>
        </div>

        <details className="mt-6 rounded-md border border-border/80 bg-muted/30 p-3 text-sm">
          <summary className="cursor-pointer font-medium text-foreground">Advanced (optional)</summary>
          <p className="mt-2 text-xs text-muted-foreground">
            For operators who already have a RocketReach People Search JSON body. Same credit rules apply.
          </p>
          <Label htmlFor="rr-raw" className="mt-3 block">
            Custom search JSON
          </Label>
          <Textarea
            id="rr-raw"
            rows={8}
            value={rawJson}
            onChange={(e) => setRawJson(e.target.value)}
            className="mt-1 font-mono text-xs"
          />
          <Button
            type="button"
            className="mt-2"
            variant="secondary"
            size="sm"
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
                  setMessage(
                    `Done — saved ${String(r.imported)} people to list “${r.contactListName}”. Universe: ${String(r.universeCreated)} new, ${String(r.universeMatched)} matched.${r.errors.length ? ` Notes: ${r.errors.join("; ")}` : ""}`,
                  );
                  router.refresh();
                } else {
                  setMessage(r.error);
                }
              });
            }}
          >
            {pending ? "Working…" : "Import from custom JSON"}
          </Button>
        </details>

        {message ? (
          <p className="mt-4 whitespace-pre-wrap text-sm text-foreground">{message}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
