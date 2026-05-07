/** User-facing OAuth mismatch — wrong Microsoft account chosen at sign-in. */
export function formatMicrosoftMailboxOAuthAccountMismatch(
  signedInAs: string,
  mailboxRowEmail: string,
): string {
  return `You signed in as ${signedInAs}, but this row is for ${mailboxRowEmail}. Try again and choose ${mailboxRowEmail}.`;
}
