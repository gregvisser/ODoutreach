"use client";

import { enterOrganisationAction } from "@/app/(app)/organisation/actions";

export function OrganisationSwitcher({
  organisations,
  actingOrganisationId,
}: {
  organisations: { id: string; name: string }[];
  actingOrganisationId: string | null;
}) {
  return (
    <form action={enterOrganisationAction}>
      <label
        htmlFor="acting-organisation"
        className="mb-1 block text-xs font-medium text-sidebar-foreground/65"
      >
        Organisation
      </label>
      <select
        id="acting-organisation"
        name="organisationId"
        defaultValue={actingOrganisationId ?? ""}
        onChange={(event) => {
          event.currentTarget.form?.requestSubmit();
        }}
        className="h-9 w-full rounded-md border border-sidebar-border bg-sidebar px-2 text-sm text-sidebar-foreground"
      >
        {actingOrganisationId ? null : <option value="">Choose an organisation</option>}
        {organisations.map((organisation) => (
          <option key={organisation.id} value={organisation.id}>
            {organisation.name}
          </option>
        ))}
      </select>
    </form>
  );
}
