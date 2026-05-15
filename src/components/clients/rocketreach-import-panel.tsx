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
  ROCKETREACH_LIST_IMPORT_STAFF_FALLBACK,
  ROCKETREACH_SAVED_LIST_GREG_NOTE,
  ROCKETREACH_SAVED_LIST_IMPORT_SUPPORTED,
} from "@/lib/clients/rocketreach-list-import-capability";
import { ROCKETREACH_SIMPLE_SEARCH_LABELS } from "@/lib/clients/rocketreach-simple-search-labels";
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
  /**
   * Raw JSON import — server should set this only when `ROCKETREACH_IMPORT_JSON_DEBUG`
   * is enabled; never for normal staff.
   */
  allowAdvancedRocketReachJson?: boolean;
};

export function RocketReachImportPanel({
  clientId,
  apiKeyConfigured,
  existingLists,
  allowAdvancedRocketReachJson = false,
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border/80 bg-gradient-to-br from-sky-500/20 via-violet-500/20 to-rose-500/20 text-base font-bold tracking-tight text-foreground"
            >
              RR
            </div>
            <div>
              <CardTitle>
                Search prospects on{" "}
                <span className="font-semibold">RocketReach</span>
              </CardTitle>
              <CardDescription>
                Search prospects, review results, then create a client list.
                This card never sends email from OpensDoors.
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!apiKeyConfigured ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            <strong>Not configured:</strong> RocketReach is not enabled on this server yet.
          </p>
        ) : null}

        <div className="mt-4 space-y-2 rounded-md border border-border/80 bg-muted/30 px-3 py-3">
          <h3 className="text-sm font-semibold text-foreground">Lists you build in RocketReach</h3>
          <p className="text-sm text-muted-foreground">
            OpensDoors does not read RocketReach saved lists over the API today.{" "}
            <span className="text-foreground">{ROCKETREACH_LIST_IMPORT_STAFF_FALLBACK}</span>
          </p>
          {ROCKETREACH_SAVED_LIST_IMPORT_SUPPORTED ? null : (
            <p className="text-xs text-muted-foreground">{ROCKETREACH_SAVED_LIST_GREG_NOTE}</p>
          )}
        </div>

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
            Pick an existing list or type a new list name before using optional in-app search.
          </p>
        ) : null}

        <section
          aria-label="RocketReach prospect search"
          className="mt-6 rounded-md border border-border/80 bg-card p-4 text-sm shadow-sm"
        >
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-foreground">
              Search prospects on RocketReach
            </h3>
            <p className="text-xs text-muted-foreground">
              Run a small RocketReach People Search and write matches to a
              client list. Results land in this client&rsquo;s workspace and
              in the global Universe.
            </p>
          </div>

          <div className="mt-3 rounded-md border border-amber-400/60 bg-amber-50/60 p-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-100">
            <p className="font-medium">RocketReach may use credits</p>
            <p className="mt-1 text-xs text-muted-foreground dark:text-amber-100/90">
              Charges depend on your RocketReach plan. Searches only run after
              you submit this form — opening the page does not consume
              credits.
            </p>
            <p className="mt-2 text-xs">
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

          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rr-keyword">{ROCKETREACH_SIMPLE_SEARCH_LABELS.keyword}</Label>
                <Input
                  id="rr-keyword"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rr-company">{ROCKETREACH_SIMPLE_SEARCH_LABELS.employer}</Label>
                <Input
                  id="rr-company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Company name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rr-title">{ROCKETREACH_SIMPLE_SEARCH_LABELS.job1Title}</Label>
                <Input
                  id="rr-title"
                  value={currentTitle}
                  onChange={(e) => setCurrentTitle(e.target.value)}
                  placeholder="Role or title"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rr-loc">{ROCKETREACH_SIMPLE_SEARCH_LABELS.locality}</Label>
                <Input
                  id="rr-loc"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="City, region, or country"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rr-max">{ROCKETREACH_SIMPLE_SEARCH_LABELS.maxResults}</Label>
                <Input
                  id="rr-max"
                  type="number"
                  min={1}
                  max={10}
                  value={maxResults}
                  onChange={(e) =>
                    setMaxResults(Math.min(10, Math.max(1, Number(e.target.value) || 1)))
                  }
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
        </section>

        {allowAdvancedRocketReachJson ? (
          <details className="mt-4 rounded-md border border-border/80 bg-muted/30 p-3 text-sm">
            <summary className="cursor-pointer font-medium text-foreground">
              Advanced JSON (debug only)
            </summary>
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
        ) : null}

        {message ? (
          <p className="mt-4 whitespace-pre-wrap text-sm text-foreground">{message}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
