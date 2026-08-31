/**
 * Row 146: after creating a client list from Universe, the operator has no
 * signal where to go next (list creation and sequence creation are two
 * separate steps in the product). This builds the "build a sequence" CTA
 * shown in the success message, kept pure so the href-for-client-id logic is
 * testable without rendering the client component.
 */
export function universeListSequenceCtaHref(clientId: string): string {
  return `/clients/${clientId}/outreach`;
}

export function universeListSequenceCtaLabel(listName: string): string {
  return `Build a sequence with "${listName}"`;
}
