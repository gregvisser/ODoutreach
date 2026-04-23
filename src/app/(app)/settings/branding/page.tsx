import Link from "next/link";

import { AppBrandLogo } from "@/components/brand/app-brand-logo";
import { BRAND } from "@/components/brand/brand-config";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireOpensDoorsStaff } from "@/server/auth/staff";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Branding",
};

export default async function SettingsBrandingPage() {
  const staff = await requireOpensDoorsStaff();
  const isAdmin = staff.role === "ADMIN";

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Settings · Branding
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Branding</h1>
        <p className="max-w-2xl text-muted-foreground">
          Controls how {BRAND.name} {BRAND.product} appears across the portal.
          Global branding is shared by every workspace. Per-client logos are
          managed on each client&rsquo;s brief.
        </p>
      </div>

      <section className="space-y-3">
        <div className="border-b border-border/60 pb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Global brand
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Shown in the header, sidebar, sign-in page, and browser tab.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">App logo</CardTitle>
              <CardDescription>
                Centered at the top of every page and linked to the dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/30 px-4 py-6">
                <AppBrandLogo static heightClassName="h-9" />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Source: <code className="font-mono text-[11px]">{BRAND.logoSrc}</code>
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Favicon &amp; app icon</CardTitle>
              <CardDescription>
                Browser tab icon and mobile home-screen shortcut. Uses the OD
                monogram mark.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex min-h-28 flex-wrap items-center justify-center gap-6 rounded-lg border border-dashed border-border/80 bg-muted/30 px-4 py-6">
                {/* eslint-disable-next-line @next/next/no-img-element -- Local SVG served from /public. */}
                <img
                  src={BRAND.markSrc}
                  alt=""
                  aria-hidden="true"
                  width={64}
                  height={64}
                  className="h-16 w-16 rounded-xl shadow-sm"
                />
                {/* eslint-disable-next-line @next/next/no-img-element -- Local SVG served from /public. */}
                <img
                  src={BRAND.markSrc}
                  alt=""
                  aria-hidden="true"
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-md shadow-sm"
                />
                {/* eslint-disable-next-line @next/next/no-img-element -- Local SVG served from /public. */}
                <img
                  src={BRAND.markSrc}
                  alt=""
                  aria-hidden="true"
                  width={16}
                  height={16}
                  className="h-4 w-4 rounded-sm"
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Source: <code className="font-mono text-[11px]">{BRAND.markSrc}</code>
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/80 bg-muted/30 shadow-none">
          <CardContent className="flex flex-col gap-2 py-4 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">How to update:</span>{" "}
              replace the SVG files at{" "}
              <code className="font-mono text-[12px]">{BRAND.logoSrc}</code> and{" "}
              <code className="font-mono text-[12px]">{BRAND.markSrc}</code>{" "}
              (plus{" "}
              <code className="font-mono text-[12px]">/src/app/icon.svg</code>{" "}
              for the favicon vector). A deploy picks up the new artwork — no
              code change required.
            </p>
            {isAdmin ? null : (
              <p className="text-xs">
                Only administrators can replace the stored brand assets.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="border-b border-border/60 pb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Client branding
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Each client workspace can carry its own logo — rendered on the
            client overview, brief, and client workspace header.
          </p>
        </div>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">
              Managed per client
              <Badge variant="outline" className="ml-2 align-middle">
                Brief → Client identity
              </Badge>
            </CardTitle>
            <CardDescription>
              Global branding represents {BRAND.name}. Client logos represent
              the workspace you&rsquo;re operating for.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              To add or replace a client&rsquo;s logo, open the client
              workspace and go to <strong className="text-foreground">Brief</strong>.
              Under <em>Client identity</em> you&rsquo;ll find a logo URL field
              with a live preview and a neutral placeholder tile when no logo
              is set yet.
            </p>
            <p>
              <Link
                href="/clients"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Open a client workspace →
              </Link>
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="border-b border-border/60 pb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Brand name
          </h2>
        </div>
        <Card className="border-border/80 shadow-sm">
          <CardContent className="grid gap-3 py-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Product name</p>
              <p className="font-medium">
                {BRAND.name} {BRAND.product}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Visible wordmark</p>
              <p className="font-medium">{BRAND.name}</p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
