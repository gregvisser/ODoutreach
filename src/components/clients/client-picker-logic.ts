export type ClientPickerOption = {
  id: string;
  name: string;
  /** Where to go when this client is chosen. A string so a server page can pass it. */
  href?: string;
};

/**
 * Case-insensitive name match for the client combobox.
 * An empty query returns every client, in the order given.
 */
export function filterClientPickerOptions(
  clients: readonly ClientPickerOption[],
  query: string,
): ClientPickerOption[] {
  const needle = query.trim().toLocaleLowerCase("en-GB");
  if (!needle) return [...clients];
  return clients.filter((client) =>
    client.name.toLocaleLowerCase("en-GB").includes(needle),
  );
}

/**
 * Label shown on the closed combobox.
 * `value` null means the "all clients" option is selected.
 */
export function clientPickerSelectionLabel(
  clients: readonly ClientPickerOption[],
  value: string | null,
  allLabel: string,
): string {
  if (!value) return allLabel;
  return clients.find((client) => client.id === value)?.name ?? "Selected client";
}
