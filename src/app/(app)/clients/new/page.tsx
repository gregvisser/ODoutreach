import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">New client</h1>
        <p className="mt-1 text-muted-foreground">
          Provision a workspace — data stays partitioned per client. The operating brief is captured
          later under each client&apos;s Brief module.
        </p>
      </div>
      <OnboardingForm />
    </div>
  );
}
