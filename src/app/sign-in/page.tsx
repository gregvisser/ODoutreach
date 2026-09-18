import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { MicrosoftSignInButton } from "@/components/auth/microsoft-sign-in-button";
import { LegalFooterLinks } from "@/components/legal/legal-footer-links";
import { getGlobalBrand } from "@/server/branding/get-global-brand";

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    redirect("/reporting");
  }

  const sp = (await searchParams) ?? {};
  const callbackUrl = sp.callbackUrl?.startsWith("/") ? sp.callbackUrl : "/reporting";
  const brand = await getGlobalBrand();

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="relative z-10 w-full max-w-md space-y-8 rounded-xl border border-border bg-card p-8 text-center">
        <div className="flex flex-col items-center space-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL can be external (admin-supplied) or local SVG; optimizer is unnecessary. */}
          <img
            src={brand.markUrl}
            alt=""
            aria-hidden="true"
            width={72}
            height={72}
            className="h-[72px] w-[72px] rounded-xl"
            decoding="async"
          />
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {brand.brandName}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {brand.productName} operations
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in with your Microsoft work account. Multi-factor authentication is enforced by your
            organization in Microsoft Entra ID.
          </p>
        </div>
        <MicrosoftSignInButton callbackUrl={callbackUrl} />
        <LegalFooterLinks />
      </div>
    </div>
  );
}
