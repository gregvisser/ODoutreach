import Link from "next/link";

import { GlobalBrandEditor } from "@/components/settings/global-brand-editor";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  getGlobalBrand,
  loadStoredBrand,
} from "@/server/branding/get-global-brand";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Branding",
};

export default async function SettingsBrandingPage() {
  const staff = await requireOpensDoorsStaff();
  const isAdmin = staff.role === "ADMIN";
  const [effective, storedRow] = await Promise.all([
    getGlobalBrand(),
    loadStoredBrand(),
  ]);

  const stored = {
    appLogoUrl: storedRow?.appLogoUrl ?? null,
    appMarkUrl: storedRow?.appMarkUrl ?? null,
    appFaviconUrl: storedRow?.appFaviconUrl ?? null,
    appBrandName: storedRow?.appBrandName ?? null,
    appProductName: storedRow?.appProductName ?? null,
    appLogoAltText: storedRow?.appLogoAltText ?? null,
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Settings · Branding
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Branding</h1>
        <p className="max-w-2xl text-muted-foreground">
          {`Controls how ${effective.brandName} ${effective.productName} appears across the portal. Global branding is shared by every workspace. Per-client logos are managed on each client\u2019s brief.`}
        </p>
      </div>

      <section className="space-y-4">
        <div className="border-b border-border/60 pb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Global brand
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Shown in the header, sidebar, sign-in page, and browser tab. Save
            to push changes to every signed-in operator immediately.
          </p>
        </div>

        <GlobalBrandEditor
          canEdit={isAdmin}
          effective={effective}
          stored={stored}
        />
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
            <CardTitle className="text-base">Managed per client</CardTitle>
            <CardDescription>
              Global branding represents {effective.brandName}. Client logos
              represent the workspace you&rsquo;re operating for.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              To add or replace a client&rsquo;s logo, open the client
              workspace and go to{" "}
              <strong className="text-foreground">Brief</strong>. Under{" "}
              <em>Client identity</em> you&rsquo;ll find a logo URL field
              with a live preview and a neutral placeholder tile when no
              logo is set yet.
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
    </div>
  );
}
