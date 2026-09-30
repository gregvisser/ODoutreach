/**
 * Build commit baked into the browser bundle at compile time (see deploy workflow).
 * Must reference `process.env.NEXT_PUBLIC_*` literally so Next.js inlines it.
 */
const INLINED_CLIENT_BUILD_COMMIT: string | undefined =
  process.env.NEXT_PUBLIC_BUILD_COMMIT;

export function getClientBuildCommit(): string | null {
  const value = INLINED_CLIENT_BUILD_COMMIT?.trim();
  return value && value.length > 0 ? value : null;
}
