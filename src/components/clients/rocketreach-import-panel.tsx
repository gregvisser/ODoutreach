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

type Props = {
  clientId: string;
  apiKeyConfigured: boolean;
};

export function RocketReachImportPanel({ clientId, apiKeyConfigured }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [currentTitle, setCurrentTitle] = useState("");
  const [location, setLocation] = useState("");
  const [rawJson, setRawJson] = useState(
    '{\n  "query": { "keyword": ["Example Co"] },\n  "page_size": 5,\n  "start": 1,\n  "order_by": "relevance"\n}',
  );

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
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!apiKeyConfigured ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            <strong>Not configured:</strong> set <code className="text-xs">ROCKETREACH_API_KEY</code>{" "}
            on the server to enable imports. No secrets are shown here.
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
              disabled={pending || !apiKeyConfigured}
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
                  });
                  if (r.ok) {
                    showResult(
                      `Imported ${String(r.imported)}, skipped (no email) ${String(r.skippedNoEmail)}, invalid ${String(r.skippedInvalid)}, duplicate ${String(r.skippedDuplicate)}.${r.errors.length ? ` Notes: ${r.errors.join("; ")}` : ""}`,
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
              disabled={pending || !apiKeyConfigured}
              onClick={() => {
                setMessage(null);
                startTransition(async () => {
                  const r = await runRocketReachImportAction({
                    clientId,
                    mode: "raw",
                    rawJson,
                  });
                  if (r.ok) {
                    showResult(
                      `Imported ${String(r.imported)}, skipped (no email) ${String(r.skippedNoEmail)}, invalid ${String(r.skippedInvalid)}, duplicate ${String(r.skippedDuplicate)}.${r.errors.length ? ` Notes: ${r.errors.join("; ")}` : ""}`,
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
