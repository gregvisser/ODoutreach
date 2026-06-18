import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { hasGoogleServiceAccountConfig } from "@/server/integrations/google-sheets/auth";
import { getConsoleTestUsersUrl } from "@/server/integrations/google-oauth-test-users/test-users-api";
import { GoogleOauthTestUsersPanel } from "@/components/settings/google-oauth-test-users-panel";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const staff = await requireOpensDoorsStaff();
  const googleWorkspaceSuppressionConfigured = hasGoogleServiceAccountConfig();
  const rocketReachConfigured = Boolean(process.env.ROCKETREACH_API_KEY?.trim());
  const staffDomainAllowlist = process.env.STAFF_EMAIL_DOMAINS?.trim();
  const resendConfigured =
    (process.env.EMAIL_PROVIDER ?? "").trim().toLowerCase() === "resend";

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Workspace-wide controls for your team, sign-in, sending, and integrations.
          Per-client setup lives inside each client workspace.
        </p>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Where to change what</CardTitle>
          <CardDescription>
            Use this page for app-wide settings. Per-client configuration always
            lives inside the client&rsquo;s own workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <li className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <span className="font-medium text-foreground">Here (Settings):</span>{" "}
              Branding, who can sign in, sign-in provider, email-provider mode,
              cross-app integrations.
            </li>
            <li className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <span className="font-medium text-foreground">Inside each client:</span>{" "}
              Brief, Mailboxes, Sources, Lists, Do-not-contact, Templates,
              Outreach, Activity.
            </li>
          </ul>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <SectionHeading
          title="Branding"
          description="How OpensDoors Outreach appears across the portal. Per-client logos are managed on each client's brief."
        />

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Global brand</CardTitle>
            <CardDescription>
              Edit the centered app logo, sidebar mark, favicon, and brand
              name — changes apply to every signed-in operator.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Editor with live previews. Per-client logos are managed
              separately in each client&rsquo;s brief.
            </p>
            <Link
              href="/settings/branding"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Open branding →
            </Link>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeading
          title="Team access"
          description="Who can sign in to OpensDoors Outreach. Every active staff member gets the same full set of features."
        />

        {staff.isSuperAdmin ? (
          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Staff access</CardTitle>
              <CardDescription>
                Invite colleagues and turn their access on or off when people
                join or move on.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Sign-in is handled by Microsoft — invitations go out through your
                Microsoft 365 tenant.
              </p>
              <Link
                href="/settings/staff-access"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Open staff access →
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Staff access</CardTitle>
            <CardDescription>
              Only the owner account can invite or remove staff. Contact the
                owner if you need someone&rsquo;s access adjusted.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Your account</CardTitle>
            <CardDescription>
              Signed in via Microsoft. Name, photo, and password changes happen
              in your Microsoft 365 account.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Email</p>
              <p className="font-medium">{staff.email}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Access</p>
              <p className="font-medium">
                {staff.isSuperAdmin ? "Owner" : "Staff"}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {staff.isSuperAdmin ? (
        <section className="space-y-3">
          <SectionHeading
            title="Workspace administration"
            description="Super-admin controls for deleting and recovering whole client workspaces."
          />

          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Deleted workspaces</CardTitle>
              <CardDescription>
                Restore a soft-deleted workspace within its recovery window. The
                delete control itself lives on each workspace&apos;s overview
                page.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Soft-delete hides a workspace and stops its sending without
                touching any email, sequence, or suppression data.
              </p>
              <Link
                href="/settings/deleted-workspaces"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Open deleted workspaces →
              </Link>
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section className="space-y-3">
        <SectionHeading
          title="Sign-in and security"
          description="Authentication is delegated to Microsoft — your Microsoft 365 policies apply."
        />

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Sign-in provider</CardTitle>
            <CardDescription>
              Microsoft Entra ID (single sign-on).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              OpensDoors Outreach uses your organisation&apos;s Microsoft 365
              sign-in, including any multi-factor authentication and conditional
              access policies your team already has in place.
            </p>
            <p>
              To change MFA, session length, or sign-in method, an administrator
              updates the policy in the Microsoft 365 admin center.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Email domain allowlist</CardTitle>
            <CardDescription>
              Restricts which email domains can sign in, even if Microsoft lets
              them through.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {staffDomainAllowlist ? (
              <>
                <div className="flex items-center gap-2">
                  <StatusPill tone="ready">Enforced</StatusPill>
                  <span className="text-muted-foreground">
                    Only these email domains can use the app.
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {staffDomainAllowlist
                    .split(",")
                    .map((d) => d.trim())
                    .filter((d) => d.length > 0)
                    .map((d) => (
                      <Badge key={d} variant="secondary">
                        {d}
                      </Badge>
                    ))}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <StatusPill tone="attention">Not enforced</StatusPill>
                <span className="text-muted-foreground">
                  Any Microsoft-authenticated staff record can sign in. Ask an
                  administrator to add an allowlist if you need to restrict this.
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeading
          title="Sending and compliance"
          description="Workspace-level sending behaviour. Per-client sender addresses live on each client's Mailboxes page."
        />

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Email provider</CardTitle>
            <CardDescription>
              How outbound email is actually delivered.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-sm">
            {resendConfigured ? (
              <>
                <StatusPill tone="ready">Resend connected</StatusPill>
                <span className="text-muted-foreground">
                  Outbound email is delivered via Resend. Verify sender domains
                  and DKIM in the Resend dashboard.
                </span>
              </>
            ) : (
              <>
                <StatusPill tone="attention">Test mode</StatusPill>
                <span className="text-muted-foreground">
                  Outbound email is being simulated — no real messages leave
                  the system. An administrator switches to Resend in production.
                </span>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Unsubscribe and compliance</CardTitle>
            <CardDescription>
              One-click unsubscribe and suppression are built in and can&apos;t
              be turned off from the UI.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Every outbound email includes List-Unsubscribe headers and a
            one-click unsubscribe link. Unsubscribes automatically suppress
            future sends for that recipient in the originating client
            workspace.
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeading
          title="Integrations"
          description="Third-party services OpensDoors Outreach can talk to."
        />

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Google Workspace — suppression lists</CardTitle>
            <CardDescription>
              Pull suppression lists from shared Google Sheets so opt-outs stay
              in sync with your team&apos;s source of truth.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {googleWorkspaceSuppressionConfigured ? (
              <div className="flex items-center gap-2">
                <StatusPill tone="ready">Connected</StatusPill>
                <span className="text-muted-foreground">
                  Suppression sources can be attached on each client&apos;s
                  Suppression page.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <StatusPill tone="missing">Not connected</StatusPill>
                <span className="text-muted-foreground">
                  Ask an administrator to connect a Google service account so
                  operators can attach suppression sheets.
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">RocketReach — contact enrichment</CardTitle>
            <CardDescription>
              Optional. Allows operators to import enriched contact records
              directly from RocketReach.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {rocketReachConfigured ? (
              <div className="flex items-center gap-2">
                <StatusPill tone="ready">Connected</StatusPill>
                <span className="text-muted-foreground">
                  Operators can run RocketReach imports from each client&apos;s
                  Sources page.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <StatusPill tone="attention">Not connected</StatusPill>
                <span className="text-muted-foreground">
                  Optional — without this, CSV uploads and manual entry remain
                  fully available.
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {staff.isSuperAdmin && googleWorkspaceSuppressionConfigured && (
          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Google OAuth — test users</CardTitle>
              <CardDescription>
                While the Google OAuth app is in Testing status, only explicitly
                listed test users can connect Google Workspace mailboxes. Add
                addresses here instead of going to Google Cloud Console.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GoogleOauthTestUsersPanel consoleUrl={getConsoleTestUsersUrl()} />
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border-b border-border/60 pb-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function StatusPill({
  tone,
  children,
}: {
  tone: "ready" | "attention" | "missing";
  children: React.ReactNode;
}) {
  const className =
    tone === "ready"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
      : tone === "attention"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100"
        : "border-border bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}
