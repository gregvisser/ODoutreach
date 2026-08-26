/**
 * Where the "I dismissed the install banner" flag lives, and how it is read.
 *
 * Split out of the component so it can be unit-tested: the Vitest suite runs in
 * the `node` environment and only claims `*.test.ts`, so nothing renders React.
 * The rules below are the whole behaviour, and they are testable in isolation.
 *
 * WHY IT IS SPLIT BY DEVICE. The BidlowAI standing PWA rule says the install
 * prompt must keep appearing on every visit until the app is actually
 * installed — that is right for a phone, where the whole point is to get the
 * app onto the home screen. It is wrong for a staff desktop: this is a
 * data-dense admin app, the banner is a fixed bottom overlay, and on a
 * workstation "no" means no. So:
 *
 *   - touch-primary device (phone/tablet) -> sessionStorage. Dismiss hides it
 *     for this visit; it returns next visit, exactly as the standing rule says.
 *   - pointer-primary device (desktop)    -> localStorage. Dismiss is final,
 *     across new tabs and browser restarts, until the app is installed.
 */

export const INSTALL_DISMISS_KEY = "odoutreach:pwa-install-dismissed";

/** Which web-storage area holds the dismissal flag for this device. */
export type InstallDismissStorageKind = "local" | "session";

/** The only two `Storage` methods this module uses — keeps tests trivial. */
export type StorageLike = Pick<Storage, "getItem" | "setItem">;

/**
 * Both storage areas, either of which may be unavailable (Safari private
 * browsing, hardened enterprise policy, and SSR all produce a null here).
 */
export type InstallDismissStores = {
  local: StorageLike | null;
  session: StorageLike | null;
};

/** What the component measured about the device it is running on. */
export type InstallDismissEnvironment = {
  /** `matchMedia("(pointer: coarse)")` — true on phones and tablets. */
  isTouchPrimary: boolean;
};

export function resolveDismissStorageKind(
  environment: InstallDismissEnvironment,
): InstallDismissStorageKind {
  return environment.isTouchPrimary ? "session" : "local";
}

function pick(
  stores: InstallDismissStores,
  kind: InstallDismissStorageKind,
): StorageLike | null {
  return kind === "local" ? stores.local : stores.session;
}

/**
 * True when this device has already been told no. Storage that throws is
 * treated as "not dismissed" — the prompt showing once too often is a far
 * smaller failure than the prompt never showing at all.
 */
export function isInstallPromptDismissed(
  stores: InstallDismissStores,
  kind: InstallDismissStorageKind,
): boolean {
  const store = pick(stores, kind);
  if (!store) return false;
  try {
    return store.getItem(INSTALL_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Record the dismissal. Never throws — a blocked storage just means it reappears. */
export function recordInstallPromptDismissed(
  stores: InstallDismissStores,
  kind: InstallDismissStorageKind,
): void {
  const store = pick(stores, kind);
  if (!store) return;
  try {
    store.setItem(INSTALL_DISMISS_KEY, "1");
  } catch {
    // Storage unavailable — the banner will come back. Acceptable, not fatal.
  }
}
