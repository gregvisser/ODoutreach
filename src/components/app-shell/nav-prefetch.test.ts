import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The navigation must not stampede the server on page load.
 *
 * Next.js prefetches every `<Link>` that enters the viewport. On a client
 * screen that is the eight sidebar links, the brand link and the nine subnav
 * tabs — about eighteen server-rendered `?_rsc=` requests fired at once.
 * Measured against production on 2026-08-26 (signed in, after cf5a752):
 * App Service returned 503 for /clients, /reporting, /suppression, brief,
 * mailboxes, sources, contacts, templates, outreach and activity. It sheds
 * under that burst. Requested one at a time a moment later the same paths
 * returned 200 twelve times out of twelve.
 *
 * So the prefetches were not filling the cache — they were failing, and taking
 * a real server-action POST down with them. This test exists because the fix is
 * a single prop that is very easy to drop in a later refactor, and because the
 * symptom ("the system takes very long to load") points nowhere near the cause.
 *
 * If the App Service plan is scaled beyond B1/one instance, re-measure before
 * relaxing this — do not simply delete it.
 */

const root = process.cwd();

const NAV_FILES = [
  join(root, "src/components/app-shell/app-sidebar.tsx"),
  join(root, "src/components/clients/client-workspace-subnav.tsx"),
];

/**
 * Strip comments before counting.
 *
 * Both files explain the opt-out in prose that quotes the prop verbatim. Left
 * in, those words count as if they were code — which would let a comment keep
 * the tally up while a real `<Link>` quietly lost its prop. Caught by this very
 * test on first run, which is also the proof it can go red.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Count `<Link` element openings, ignoring the `import Link from` line. */
function countLinkElements(src: string): number {
  return (stripComments(src).match(/<Link\b/g) ?? []).length;
}

function countDisabledPrefetch(src: string): number {
  return (stripComments(src).match(/prefetch=\{false\}/g) ?? []).length;
}

describe("navigation does not prefetch every route on page load", () => {
  for (const file of NAV_FILES) {
    const name = file.split(/[\\/]/).slice(-1)[0] ?? file;

    it(`${name}: every Link opts out of prefetch`, () => {
      const src = readFileSync(file, "utf8");
      const links = countLinkElements(src);

      // Guard the guard: if the file stops using <Link>, this test would pass
      // vacuously and we would never know the protection had evaporated.
      expect(links).toBeGreaterThan(0);
      expect(countDisabledPrefetch(src)).toBe(links);
    });

    it(`${name}: does not re-enable prefetch explicitly`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/prefetch=\{true\}/);
      expect(src).not.toMatch(/prefetch="?auto"?/);
    });
  }

  it("covers both halves of the burst — sidebar and client tabs", () => {
    expect(NAV_FILES).toHaveLength(2);
    const total = NAV_FILES.reduce(
      (n, f) => n + countLinkElements(readFileSync(f, "utf8")),
      0,
    );
    // Ten or more simultaneous prefetches is what production shed. If the nav
    // ever grows past that again without opting out, the tests above fail.
    expect(total).toBeGreaterThanOrEqual(2);
  });
});
