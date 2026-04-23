import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { MicrosoftSignInButton } from "@/components/auth/microsoft-sign-in-button";
import { BRAND } from "@/components/brand/brand-config";

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  const sp = (await searchParams) ?? {};
  const callbackUrl = sp.callbackUrl?.startsWith("/") ? sp.callbackUrl : "/dashboard";

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/15 via-background to-background px-4">
      <div className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%239C92AC\' fill-opacity=\'0.06\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-40" />
      <div className="relative z-10 w-full max-w-md space-y-8 text-center">
        <div className="flex flex-col items-center space-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- Local SVG served from /public. */}
          <img
            src={BRAND.markSrc}
            alt=""
            aria-hidden="true"
            width={56}
            height={56}
            className="h-14 w-14 rounded-xl shadow-sm"
            decoding="async"
          />
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {BRAND.name}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Outreach operations
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in with your Microsoft work account. Multi-factor authentication is enforced by your
            organization in Microsoft Entra ID.
          </p>
        </div>
        <MicrosoftSignInButton callbackUrl={callbackUrl} />
      </div>
    </div>
  );
}
