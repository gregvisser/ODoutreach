import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { hasGoogleServiceAccountConfig } from "@/server/integrations/google-sheets/auth";
import Link from "next/link";

import { requireOpensDoorsStaff } from "@/server/auth/staff";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const staff = await requireOpensDoorsStaff();
  const google = hasGoogleServiceAccountConfig();
  const domainPolicy = process.env.STAFF_EMAIL_DOMAINS?.trim();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Internal staff profile and security — tenant data is configured per client.
        </p>
      </div>

      {staff.role === "ADMIN" ? (
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle>Staff Access</CardTitle>
            <CardDescription>
              Invite guests to the Bidlow tenant and manage staff roles (Microsoft sends the
              invitation email).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/settings/staff-access"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Open Staff Access →
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Your account</CardTitle>
          <CardDescription>Synced from Microsoft Entra on sign-in</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Email:</span>{" "}
            <span className="font-medium">{staff.email}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Role:</span>{" "}
            <span className="font-medium">{staff.role}</span>
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Staff access policy</CardTitle>
          <CardDescription>Optional email domain allowlist</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            When <code className="rounded bg-muted px-1 text-xs">STAFF_EMAIL_DOMAINS</code>{" "}
            is set (comma-separated, e.g.{" "}
            <code className="rounded bg-muted px-1 text-xs">bidlow.co.uk</code>,{" "}
            <code className="rounded bg-muted px-1 text-xs">opensdoors.co.uk</code>), only
            matching staff can use the app shell. Leave unset in development to allow any
            signed-in user.
          </p>
          <p className="font-mono text-xs text-foreground">
            {domainPolicy ? `Active: ${domainPolicy}` : "Not set — all signed-in users pass."}
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Multi-factor authentication</CardTitle>
          <CardDescription>Microsoft Entra is the authority</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Configure Conditional Access, per-user MFA, and authentication methods in the
            Microsoft Entra admin center for your tenant. This app does not implement a second
            factor UI — users complete MFA when Entra policies require it.
          </p>
          <p>
            Account security and device management are handled in Microsoft 365 / Entra, not in
            this application.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Integrations (env)</CardTitle>
          <CardDescription>Required vs optional</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 font-mono text-xs text-muted-foreground">
          <p>DATABASE_URL — required</p>
          <p>AUTH_SECRET, AUTH_MICROSOFT_ENTRA_ID_ID / SECRET / ISSUER — required for sign-in</p>
          <p>STAFF_EMAIL_DOMAINS — optional staff allowlist</p>
          <p>
            GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 — for
            suppression sync (Sheets API read-only)
            {google ? (
              <span className="text-foreground"> — detected</span>
            ) : (
              <span> — not set</span>
            )}
          </p>
          <p>ROCKETREACH_API_KEY — optional enrichment</p>
        </CardContent>
      </Card>
    </div>
  );
}
