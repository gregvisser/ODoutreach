import { requireOpensDoorsStaff } from "@/server/auth/staff";
import Link from "next/link";
import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  const staff = await requireOpensDoorsStaff();
  if (!staff.isSuperAdmin) {
    return <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Add a client</h1>
      <p>Only the owner can add a client workspace. You can continue working with existing clients.</p>
      <Link prefetch={false} href="/clients">Back to clients</Link>
    </div>;
  }
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Add a client</h1>
        <p className="mt-1 text-muted-foreground">
          Create the client workspace. You&apos;ll set up the brief, mailboxes,
          suppression, contacts, and sequences inside the client afterwards.
        </p>
      </div>
      <OnboardingForm />
    </div>
  );
}
