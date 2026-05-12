/**
 * Visible label for client workspace pickers. Values stay Prisma ids; labels
 * must never show raw CUIDs when a display name exists.
 */
export function formatClientWorkspaceSelectLabel(
  clients: readonly { id: string; name: string }[],
  clientId: string,
): string {
  const c = clients.find((x) => x.id === clientId);
  if (!c) return "Choose client";
  const name = (c.name ?? "").trim();
  if (!name) return `Workspace (${c.id.slice(0, 8)}…)`;
  const sameName = clients.filter((x) => (x.name ?? "").trim() === name);
  if (sameName.length > 1) return `${name} (${c.id.slice(0, 8)})`;
  return name;
}
