"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateClientBrandAction } from "@/app/(app)/clients/client-brand-actions";
import { ClientLogo } from "@/components/clients/client-logo";
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
import {
  CLIENT_LOGO_ALT_MAX,
  CLIENT_LOGO_URL_MAX,
  validateClientBrandInput,
} from "@/lib/clients/client-brand";

type Props = {
  clientId: string;
  clientName: string;
  initialLogoUrl: string | null;
  initialLogoAltText: string | null;
};

/**
 * Per-client branding editor. Renders a live preview (or neutral
 * placeholder when no logo is set), plus two inputs for the logo URL
 * and alt text. Uploads are intentionally not supported in this
 * release — hosting the logo on Azure Blob / S3 / a CDN and pasting the
 * URL is the lowest-risk first step.
 */
export function ClientBrandPanel({
  clientId,
  clientName,
  initialLogoUrl,
  initialLogoAltText,
}: Props) {
  const router = useRouter();
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl ?? "");
  const [logoAltText, setLogoAltText] = useState(initialLogoAltText ?? "");
  const [message, setMessage] = useState<
    { type: "ok" | "err"; text: string } | null
  >(null);
  const [pending, startTransition] = useTransition();

  const trimmedUrl = logoUrl.trim();
  const looksLikeValidUrl = /^https?:\/\/.+/i.test(trimmedUrl);
  const previewUrl = trimmedUrl && looksLikeValidUrl ? trimmedUrl : null;

  const dirty =
    (logoUrl.trim() || "") !== (initialLogoUrl ?? "") ||
    (logoAltText.trim() || "") !== (initialLogoAltText ?? "");

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);

    const validation = validateClientBrandInput({ logoUrl, logoAltText });
    if (!validation.ok) {
      setMessage({ type: "err", text: validation.message });
      return;
    }

    startTransition(async () => {
      const result = await updateClientBrandAction({
        clientId,
        logoUrl,
        logoAltText,
      });
      if (result.ok) {
        setMessage({ type: "ok", text: "Client branding saved." });
        router.refresh();
      } else {
        setMessage({ type: "err", text: result.error });
      }
    });
  }

  function onClear() {
    setLogoUrl("");
    setLogoAltText("");
    setMessage(null);
    startTransition(async () => {
      const result = await updateClientBrandAction({
        clientId,
        logoUrl: "",
        logoAltText: "",
      });
      if (result.ok) {
        setMessage({ type: "ok", text: "Client logo cleared." });
        router.refresh();
      } else {
        setMessage({ type: "err", text: result.error });
      }
    });
  }

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Client branding</CardTitle>
        <CardDescription>
          Optional. Shown on this client&rsquo;s overview, brief, and workspace
          header. Clear the fields to fall back to the {clientName} monogram
          tile.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border/70 bg-muted/30 p-4">
          <ClientLogo
            clientName={clientName}
            logoUrl={previewUrl}
            logoAltText={logoAltText}
            size={64}
          />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-foreground">
              {previewUrl ? "Logo preview" : "No client logo added yet"}
            </p>
            <p className="text-xs text-muted-foreground">
              {previewUrl
                ? "Looks good? Save to apply across the client workspace."
                : `We'll show the "${clientName}" monogram until you add a logo.`}
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="client-brand-logo-url" className="text-foreground">
              Logo URL
            </Label>
            <p className="text-xs text-muted-foreground">
              Full https:// URL to a PNG, SVG, or JPG hosted somewhere
              accessible (CDN, S3, the client&rsquo;s own site).
            </p>
            <Input
              id="client-brand-logo-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              maxLength={CLIENT_LOGO_URL_MAX}
              placeholder="https://…/logo.png"
              value={logoUrl}
              onChange={(event) => setLogoUrl(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-brand-logo-alt" className="text-foreground">
              Alt text
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <p className="text-xs text-muted-foreground">
              Read aloud by screen readers. Defaults to
              <span className="mx-1 rounded bg-muted px-1 font-mono text-[11px]">
                {clientName} logo
              </span>
              when blank.
            </p>
            <Input
              id="client-brand-logo-alt"
              autoComplete="off"
              maxLength={CLIENT_LOGO_ALT_MAX}
              placeholder={`${clientName} logo`}
              value={logoAltText}
              onChange={(event) => setLogoAltText(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button type="submit" disabled={pending || !dirty}>
              {pending ? "Saving…" : "Save branding"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                pending ||
                (initialLogoUrl === null && initialLogoAltText === null)
              }
              onClick={onClear}
            >
              Clear logo
            </Button>
            {message ? (
              <p
                className={
                  message.type === "ok"
                    ? "text-sm text-foreground"
                    : "text-sm text-destructive"
                }
              >
                {message.text}
              </p>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
