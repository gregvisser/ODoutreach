import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

export default function NewClientPage() {
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
