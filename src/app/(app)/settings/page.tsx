import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { hasGoogleServiceAccountConfig } from "@/server/integrations/google-sheets/auth";
import { requireStaffUser } from "@/server/auth/staff";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const staff = await requireStaffUser();
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

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Your account</CardTitle>
          <CardDescription>Synced from Clerk on sign-in</CardDescription>
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
            <code className="rounded bg-muted px-1 text-xs">opensdoors.com</code>), only
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
          <CardDescription>Clerk is the authority</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Configure MFA in the Clerk Dashboard (SMS, TOTP, backup codes) and set session /
            MFA policies for your production instance. This application does not implement a
            second factor UI itself — users complete MFA through Clerk when your policies
            require it.
          </p>
          <p>
            After signing in, manage devices under the user menu when your Clerk instance
            exposes account management.
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
          <p>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY — required</p>
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
