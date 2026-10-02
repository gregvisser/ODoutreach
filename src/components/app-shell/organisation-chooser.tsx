import { enterOrganisationAction } from "@/app/(app)/organisation/actions";

/**
 * Shown once, at sign-in, when a person belongs to more than one organisation
 * and has not chosen. The workspace side panel does not switch organisations.
 */
export function OrganisationChooser({
  organisations,
}: {
  organisations: { id: string; name: string; status: "ACTIVE" | "SUSPENDED" }[];
}) {
  const choices = organisations.filter((organisation) => organisation.status === "ACTIVE");
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Choose an organisation</h1>
      <p className="mt-2 text-muted-foreground">
        You belong to more than one organisation. Pick the one you are working in.
        You can sign out and choose again later.
      </p>
      <ul className="mt-8 space-y-3">
        {choices.map((organisation) => (
          <li key={organisation.id}>
            <form action={enterOrganisationAction}>
              <input type="hidden" name="organisationId" value={organisation.id} />
              <button
                type="submit"
                className="w-full rounded-lg border border-border bg-card px-4 py-3 text-left text-sm font-medium hover:bg-accent"
              >
                {organisation.name}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
