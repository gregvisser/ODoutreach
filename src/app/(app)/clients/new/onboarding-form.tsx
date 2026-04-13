"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClientFromOnboarding } from "@/app/(app)/clients/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const steps = [
  { id: "basics", title: "Client profile" },
  { id: "suppression", title: "Suppression sources" },
  { id: "outreach", title: "Outreach setup" },
  { id: "review", title: "Review" },
];

export function OnboardingForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    industry: "",
    website: "",
    notes: "",
    emailSheetId: "",
    domainSheetId: "",
    senderName: "",
    dailyCap: "150",
  });

  async function onSubmit() {
    setPending(true);
    setError(null);
    try {
      const res = await createClientFromOnboarding({
        name: form.name,
        slug: form.slug,
        industry: form.industry || undefined,
        website: form.website || undefined,
        notes: form.notes || undefined,
        emailSheetId: form.emailSheetId || undefined,
        domainSheetId: form.domainSheetId || undefined,
        senderName: form.senderName || undefined,
        dailyCap: form.dailyCap ? Number(form.dailyCap) : undefined,
      });
      if (res.ok) router.push(`/clients/${res.clientId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="mx-auto max-w-2xl border-border/80 shadow-lg">
      <CardHeader>
        <CardTitle>Onboard a client workspace</CardTitle>
        <CardDescription>
          Creates an isolated tenant with suppression sources and outreach defaults.
          Google Sheets remain the system of record for suppression — connect sync in a
          later phase.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs
          value={steps[step]?.id}
          onValueChange={(v) => setStep(steps.findIndex((s) => s.id === v))}
        >
          <TabsList className="grid w-full grid-cols-4">
            {steps.map((s) => (
              <TabsTrigger key={s.id} value={s.id} className="text-xs sm:text-sm">
                {s.title}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="basics" className="space-y-4 pt-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Client name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Acme Corp"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="slug">Workspace slug</Label>
              <Input
                id="slug"
                value={form.slug}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    slug: e.target.value.toLowerCase().replace(/\s+/g, "-"),
                  }))
                }
                placeholder="acme-corp"
                required
              />
              <p className="text-xs text-muted-foreground">
                Used in URLs and internal references — unique across OpensDoors.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="industry">Industry</Label>
                <Input
                  id="industry"
                  value={form.industry}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, industry: e.target.value }))
                  }
                  placeholder="B2B SaaS"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  type="url"
                  value={form.website}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, website: e.target.value }))
                  }
                  placeholder="https://"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Internal notes</Label>
              <Input
                id="notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Billing contact, tone preferences…"
              />
            </div>
          </TabsContent>
          <TabsContent value="suppression" className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Each client connects their own Google Sheet for email and domain
              suppression. Paste spreadsheet IDs — OAuth/service account wiring is{" "}
              <span className="font-medium text-foreground">TODO</span>.
            </p>
            <div className="grid gap-2">
              <Label htmlFor="emailSheet">Email suppression spreadsheet ID</Label>
              <Input
                id="emailSheet"
                value={form.emailSheetId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, emailSheetId: e.target.value }))
                }
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="domainSheet">Domain suppression spreadsheet ID</Label>
              <Input
                id="domainSheet"
                value={form.domainSheetId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, domainSheetId: e.target.value }))
                }
                placeholder="Separate tab or file per client policy"
              />
            </div>
          </TabsContent>
          <TabsContent value="outreach" className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Placeholder operational defaults — sending provider integration comes later.
            </p>
            <div className="grid gap-2">
              <Label htmlFor="sender">Preferred sender display name</Label>
              <Input
                id="sender"
                value={form.senderName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, senderName: e.target.value }))
                }
                placeholder="OpensDoors · Alex"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cap">Daily send cap (soft target)</Label>
              <Input
                id="cap"
                type="number"
                min={1}
                value={form.dailyCap}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dailyCap: e.target.value }))
                }
              />
            </div>
          </TabsContent>
          <TabsContent value="review" className="space-y-3 pt-4 text-sm">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
              <p>
                <span className="text-muted-foreground">Name:</span>{" "}
                <span className="font-medium">{form.name || "—"}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Slug:</span>{" "}
                <span className="font-medium">{form.slug || "—"}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Suppression sheets:</span>{" "}
                {form.emailSheetId || form.domainSheetId
                  ? "Configured (IDs captured)"
                  : "Optional — add later"}
              </p>
            </div>
          </TabsContent>
        </Tabs>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="flex justify-between gap-2 border-t border-border/60">
        <Button
          type="button"
          variant="outline"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          Back
        </Button>
        {step < steps.length - 1 ? (
          <Button type="button" onClick={() => setStep((s) => s + 1)}>
            Continue
          </Button>
        ) : (
          <Button type="button" disabled={pending} onClick={onSubmit}>
            {pending ? "Creating…" : "Create workspace"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
