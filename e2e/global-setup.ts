/**
 * Playwright global setup: seed the throwaway database, then mint a signed
 * next-auth session cookie for each persona.
 *
 * Why mint rather than drive the real Microsoft login: `src/auth.ts` registers no
 * adapter, so next-auth v5 uses **JWT sessions** — the cookie is self-contained
 * and verified purely from `AUTH_SECRET`. We therefore call next-auth's own
 * `encode()` rather than reimplementing its crypto, which keeps these fixtures
 * correct if the library changes its algorithm. Automating the real Entra OAuth
 * flow would need live tenant credentials and MFA, and is deliberately avoided.
 *
 * The payload mirrors what `src/auth.ts` puts on the token at sign-in: the
 * `jwt` callback stores `oid` + `email`, and the `session` callback maps
 * `token.oid` to `session.user.id`, which `loadStaffRecord` matches against
 * `StaffUser.entraObjectId`.
 */
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { encode } from "next-auth/jwt";

import { E2E_AUTH_SECRET, E2E_BASE_URL, E2E_DATABASE_URL } from "./env";
import { E2E_STAFF, E2E_STORAGE_STATE, E2E_SUPER_ADMIN } from "./fixtures";

/**
 * next-auth derives the JWE salt from the session cookie name
 * (`@auth/core/lib/actions/callback` → `salt = cookies.sessionToken.name`).
 * The `__Secure-` prefix is only added for HTTPS origins.
 */
function sessionCookieName(baseUrl: string): string {
  return baseUrl.startsWith("https://")
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

const SESSION_MAX_AGE_SECONDS = 60 * 60;

async function writeStorageState(params: {
  entraObjectId: string;
  email: string;
  displayName: string;
  filePath: string;
}): Promise<void> {
  const cookieName = sessionCookieName(E2E_BASE_URL);

  const value = await encode({
    salt: cookieName,
    secret: E2E_AUTH_SECRET,
    maxAge: SESSION_MAX_AGE_SECONDS,
    token: {
      sub: params.entraObjectId,
      oid: params.entraObjectId,
      email: params.email,
      name: params.displayName,
    },
  });

  const storageState = {
    cookies: [
      {
        name: cookieName,
        value,
        domain: new URL(E2E_BASE_URL).hostname,
        path: "/",
        expires: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
        httpOnly: true,
        secure: E2E_BASE_URL.startsWith("https://"),
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  };

  const absolutePath = path.resolve(params.filePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(storageState, null, 2), "utf8");
}

/**
 * Runs the fixture seed in its own `tsx` process. The generated Prisma client is
 * ESM; Playwright's TypeScript loader is CommonJS and cannot import it here.
 */
function seedFixtures(): void {
  const result = spawnSync("npx", ["tsx", "e2e/seed-e2e.ts"], {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, E2E_DATABASE_URL },
  });

  if (result.status !== 0) {
    throw new Error(
      `e2e fixture seed failed (exit code ${String(result.status)}). Is the e2e database running and migrated?`,
    );
  }
}

async function globalSetup(): Promise<void> {
  seedFixtures();

  await writeStorageState({
    ...E2E_SUPER_ADMIN,
    filePath: E2E_STORAGE_STATE.superAdmin,
  });
  await writeStorageState({
    ...E2E_STAFF,
    filePath: E2E_STORAGE_STATE.staff,
  });
}

export default globalSetup;
