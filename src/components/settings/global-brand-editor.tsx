"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  resetGlobalBrandAction,
  updateGlobalBrandAction,
} from "@/app/(app)/settings/branding/branding-actions";
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
  APP_BRAND_NAME_MAX,
  APP_FAVICON_URL_MAX,
  APP_LOGO_ALT_MAX,
  APP_LOGO_URL_MAX,
  APP_MARK_URL_MAX,
  APP_PRODUCT_NAME_MAX,
  DEFAULT_BRAND,
  type EffectiveBrand,
  validateGlobalBrandInput,
} from "@/lib/branding/global-brand";
import { cn } from "@/lib/utils";

type Props = {
  canEdit: boolean;
  effective: EffectiveBrand;
  stored: {
    appLogoUrl: string | null;
    appMarkUrl: string | null;
    appFaviconUrl: string | null;
    appBrandName: string | null;
    appProductName: string | null;
    appLogoAltText: string | null;
  };
};

/**
 * Admin-facing editor for the single `GlobalBrandSetting` row. Shows
 * the current effective brand (admin override OR shipped default)
 * side-by-side with URL / text inputs. Saving upserts the singleton
 * and revalidates the app shell so the header/favicon update
 * immediately. Clearing all fields (or pressing "Reset to defaults")
 * routes the UI back to the OpensDoors artwork shipped in this repo.
 */
export function GlobalBrandEditor({ canEdit, effective, stored }: Props) {
  const router = useRouter();
  const [appLogoUrl, setAppLogoUrl] = useState(stored.appLogoUrl ?? "");
  const [appMarkUrl, setAppMarkUrl] = useState(stored.appMarkUrl ?? "");
  const [appFaviconUrl, setAppFaviconUrl] = useState(
    stored.appFaviconUrl ?? "",
  );
  const [appBrandName, setAppBrandName] = useState(stored.appBrandName ?? "");
  const [appProductName, setAppProductName] = useState(
    stored.appProductName ?? "",
  );
  const [appLogoAltText, setAppLogoAltText] = useState(
    stored.appLogoAltText ?? "",
  );
  const [message, setMessage] = useState<
    { type: "ok" | "err"; text: string } | null
  >(null);
  const [pending, startTransition] = useTransition();

  const dirty =
    appLogoUrl.trim() !== (stored.appLogoUrl ?? "") ||
    appMarkUrl.trim() !== (stored.appMarkUrl ?? "") ||
    appFaviconUrl.trim() !== (stored.appFaviconUrl ?? "") ||
    appBrandName.trim() !== (stored.appBrandName ?? "") ||
    appProductName.trim() !== (stored.appProductName ?? "") ||
    appLogoAltText.trim() !== (stored.appLogoAltText ?? "");

  const hasAnyOverride =
    stored.appLogoUrl ||
    stored.appMarkUrl ||
    stored.appFaviconUrl ||
    stored.appBrandName ||
    stored.appProductName ||
    stored.appLogoAltText;

  // Live preview values — fall through to the effective brand when the
  // corresponding field is blank so the admin can see exactly what the
  // app will render on save.
  const previewLogoUrl = appLogoUrl.trim() || effective.logoUrl;
  const previewMarkUrl = appMarkUrl.trim() || effective.markUrl;
  const previewFaviconUrl =
    appFaviconUrl.trim() || appMarkUrl.trim() || effective.faviconUrl;
  const previewBrandName = appBrandName.trim() || DEFAULT_BRAND.brandName;
  const previewProductName =
    appProductName.trim() || DEFAULT_BRAND.productName;
  const previewAltText =
    appLogoAltText.trim() || `${previewBrandName} ${previewProductName}`;

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);

    const validation = validateGlobalBrandInput({
      appLogoUrl,
      appMarkUrl,
      appFaviconUrl,
      appBrandName,
      appProductName,
      appLogoAltText,
    });
    if (!validation.ok) {
      setMessage({ type: "err", text: validation.message });
      return;
    }

    startTransition(async () => {
      const result = await updateGlobalBrandAction({
        appLogoUrl,
        appMarkUrl,
        appFaviconUrl,
        appBrandName,
        appProductName,
        appLogoAltText,
      });
      if (result.ok) {
        setMessage({ type: "ok", text: "Global branding saved." });
        router.refresh();
      } else {
        setMessage({ type: "err", text: result.error });
      }
    });
  }

  function onReset() {
    setMessage(null);
    startTransition(async () => {
      const result = await resetGlobalBrandAction();
      if (result.ok) {
        setAppLogoUrl("");
        setAppMarkUrl("");
        setAppFaviconUrl("");
        setAppBrandName("");
        setAppProductName("");
        setAppLogoAltText("");
        setMessage({
          type: "ok",
          text: "Global branding reset to OpensDoors defaults.",
        });
        router.refresh();
      } else {
        setMessage({ type: "err", text: result.error });
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Live app logo</CardTitle>
            <CardDescription>
              Centered at the top of every signed-in page. The header resizes
              the logo to the correct height automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/30 px-4 py-6">
              {/* eslint-disable-next-line @next/next/no-img-element -- Preview URL can be admin-supplied or local. */}
              <img
                src={previewLogoUrl}
                alt={previewAltText}
                className="block h-12 w-auto"
                decoding="async"
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Currently rendering:{" "}
              <code className="break-all font-mono text-[11px]">
                {previewLogoUrl}
              </code>
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Live favicon &amp; mark</CardTitle>
            <CardDescription>
              The mark appears in the sidebar and sign-in card; the favicon
              appears in the browser tab.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid min-h-32 grid-cols-3 items-center gap-4 rounded-lg border border-dashed border-border/80 bg-muted/30 px-4 py-6">
              <div className="flex flex-col items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewMarkUrl}
                  alt=""
                  aria-hidden="true"
                  className="h-16 w-16 rounded-xl shadow-sm"
                  decoding="async"
                />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Mark 64
                </span>
              </div>
              <div className="flex flex-col items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewFaviconUrl}
                  alt=""
                  aria-hidden="true"
                  className="h-8 w-8 rounded-md shadow-sm"
                  decoding="async"
                />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Tab 32
                </span>
              </div>
              <div className="flex flex-col items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewFaviconUrl}
                  alt=""
                  aria-hidden="true"
                  className="h-4 w-4 rounded-sm"
                  decoding="async"
                />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Tab 16
                </span>
              </div>
            </div>
            <div className="mt-3 space-y-0.5 text-xs text-muted-foreground">
              <p>
                Mark:{" "}
                <code className="break-all font-mono text-[11px]">
                  {previewMarkUrl}
                </code>
              </p>
              <p>
                Favicon:{" "}
                <code className="break-all font-mono text-[11px]">
                  {previewFaviconUrl}
                </code>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Branding URLs</CardTitle>
            <CardDescription>
              Paste full https:// URLs to the hosted artwork, or a repo
              path like{" "}
              <code className="font-mono text-[11px]">/branding/logo.svg</code>.
              Leave blank to fall back to the OpensDoors defaults shipped
              with the portal.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <BrandField
              id="app-logo-url"
              label="App logo URL"
              hint="Horizontal wordmark, rendered centered in the header."
              value={appLogoUrl}
              onChange={setAppLogoUrl}
              maxLength={APP_LOGO_URL_MAX}
              placeholder={DEFAULT_BRAND.logoUrl}
              disabled={!canEdit}
              type="url"
            />
            <BrandField
              id="app-mark-url"
              label="App icon / mark URL"
              hint="Square mark used in the sidebar, sign-in card, and as the favicon fallback."
              value={appMarkUrl}
              onChange={setAppMarkUrl}
              maxLength={APP_MARK_URL_MAX}
              placeholder={DEFAULT_BRAND.markUrl}
              disabled={!canEdit}
              type="url"
            />
            <BrandField
              id="app-favicon-url"
              label="Favicon URL"
              hint={
                <>
                  Browser-tab icon. When blank, we fall back to the app
                  icon above.
                </>
              }
              value={appFaviconUrl}
              onChange={setAppFaviconUrl}
              maxLength={APP_FAVICON_URL_MAX}
              placeholder="(uses the app icon when blank)"
              disabled={!canEdit}
              type="url"
              className="md:col-span-2"
            />
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Brand text</CardTitle>
            <CardDescription>
              Shown in the browser title, the sidebar header, and as the
              accessible name for the logo.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <BrandField
              id="app-brand-name"
              label="Brand name"
              hint="Primary name. Example: OpensDoors."
              value={appBrandName}
              onChange={setAppBrandName}
              maxLength={APP_BRAND_NAME_MAX}
              placeholder={DEFAULT_BRAND.brandName}
              disabled={!canEdit}
            />
            <BrandField
              id="app-product-name"
              label="Product name"
              hint="Short product label. Example: Outreach."
              value={appProductName}
              onChange={setAppProductName}
              maxLength={APP_PRODUCT_NAME_MAX}
              placeholder={DEFAULT_BRAND.productName}
              disabled={!canEdit}
            />
            <BrandField
              id="app-logo-alt"
              label="Logo alt text"
              hint={
                <>
                  Read aloud by screen readers. Defaults to
                  <span className="mx-1 rounded bg-muted px-1 font-mono text-[11px]">
                    {previewBrandName} {previewProductName}
                  </span>
                  when blank.
                </>
              }
              value={appLogoAltText}
              onChange={setAppLogoAltText}
              maxLength={APP_LOGO_ALT_MAX}
              placeholder={`${previewBrandName} ${previewProductName}`}
              disabled={!canEdit}
              className="md:col-span-2"
            />
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button type="submit" disabled={!canEdit || pending || !dirty}>
            {pending ? "Saving…" : "Save branding"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEdit || pending || !hasAnyOverride}
            onClick={onReset}
          >
            Reset to defaults
          </Button>
          {message ? (
            <p
              className={cn(
                "text-sm",
                message.type === "ok"
                  ? "text-foreground"
                  : "text-destructive",
              )}
            >
              {message.text}
            </p>
          ) : null}
          {!canEdit ? (
            <p className="text-sm text-muted-foreground">
              Only administrators can change global branding.
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function BrandField({
  id,
  label,
  hint,
  value,
  onChange,
  maxLength,
  placeholder,
  disabled,
  type,
  className,
}: {
  id: string;
  label: string;
  hint: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder: string;
  disabled: boolean;
  type?: "url" | "text";
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-foreground">
        {label}
      </Label>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <Input
        id={id}
        type={type ?? "text"}
        autoComplete="off"
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        inputMode={type === "url" ? "url" : undefined}
      />
    </div>
  );
}
