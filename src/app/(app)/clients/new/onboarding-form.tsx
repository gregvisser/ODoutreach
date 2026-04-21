"use client";

import { useMemo, useState } from "react";
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
import {
  CLIENT_NOTES_MAX,
  generateSlugFromName,
  validateNewClientShellInput,
} from "@/lib/clients/new-client-shell";

/**
 * PR I — Minimal new-client shell form. Collects only identity-level
 * fields. Mailboxes, suppression, templates, sequences, and daily caps
 * live in per-client workspace modules.
 */
export function OnboardingForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    industry: "",
    website: "",
    notes: "",
  });
  const [slugTouched, setSlugTouched] = useState(false);

  const derivedSlug = useMemo(() => generateSlugFromName(form.name), [form.name]);
  const effectiveSlug = slugTouched ? form.slug : derivedSlug;

  const clientValidation = useMemo(
    () =>
      validateNewClientShellInput({
        name: form.name,
        slug: effectiveSlug,
        industry: form.industry,
        website: form.website,
        notes: form.notes,
      }),
    [form.industry, form.name, form.notes, form.website, effectiveSlug],
  );
  const canSubmit = clientValidation.ok && !pending;

  async function onSubmit() {
    setError(null);
    if (!clientValidation.ok) {
      setError(clientValidation.message);
      return;
    }
    setPending(true);
    try {
      const res = await createClientFromOnboarding({
        name: form.name,
        slug: effectiveSlug,
        industry: form.industry || undefined,
        website: form.website || undefined,
        notes: form.notes || undefined,
      });
      if (res.ok) {
        router.push(`/clients/${res.clientId}?created=1`);
      } else {
        setError(res.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="mx-auto max-w-2xl border-border/80 shadow-lg">
      <CardHeader>
        <CardTitle>Create client workspace</CardTitle>
        <CardDescription>
          Creates an isolated tenant shell with <strong>ONBOARDING</strong> status.
          Mailboxes, suppression, contact lists, templates, and sequences are
          configured inside the client workspace modules — not here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-2">
          <Label htmlFor="name">Client name *</Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Acme Corp"
            required
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="slug">Workspace slug *</Label>
          <Input
            id="slug"
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setForm((f) => ({
                ...f,
                slug: e.target.value.toLowerCase().replace(/\s+/g, "-"),
              }));
            }}
            onBlur={() => {
              if (!form.slug && !slugTouched) {
                setForm((f) => ({ ...f, slug: derivedSlug }));
              }
            }}
            placeholder="acme-corp"
            required
          />
          <p className="text-xs text-muted-foreground">
            Auto-derived from the client name. Used in URLs; lowercase letters,
            numbers, and single hyphens only. Unique across OpensDoors.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="industry">Industry (optional)</Label>
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
            <Label htmlFor="website">Website (optional)</Label>
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
          <Label htmlFor="notes">Internal notes (optional)</Label>
          <Input
            id="notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Billing contact, tone preferences, handoff owner…"
            maxLength={CLIENT_NOTES_MAX}
          />
        </div>

        <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">After create</p>
          <p className="mt-1">
            You&apos;ll land on the workspace overview. Complete the setup
            modules in order: Brief → Mailboxes → Sources → Suppression →
            Contacts → Templates → Sequences → Activity. The client stays in{" "}
            <strong>ONBOARDING</strong> until launch is explicitly approved.
          </p>
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : !clientValidation.ok && (form.name || form.slug) ? (
          <p className="text-xs text-muted-foreground">
            {clientValidation.message}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="flex justify-end gap-2 border-t border-border/60">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/clients")}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="button" disabled={!canSubmit} onClick={onSubmit}>
          {pending ? "Creating…" : "Create workspace"}
        </Button>
      </CardFooter>
    </Card>
  );
}
