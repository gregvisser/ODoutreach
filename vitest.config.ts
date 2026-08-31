import path from "node:path";

import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // `e2e/*.test.ts` covers the e2e harness's own logic (the safe-database
    // guard). Playwright only claims `*.spec.ts`, so the two do not overlap.
    //
    // `relay/*.test.ts` covers the relay watcher's own queue parser by driving
    // the real `relay-watch.ps1`. It lives in the main suite on purpose: the
    // parser bug it guards against cost a whole overnight cycle silently, and a
    // test nobody runs would not have caught it.
    //
    // `standards/*.test.ts` covers logic in the shared BidlowAI tooling under
    // C:\Bidlowprojects\_standards (e.g. bidlow-deck.mjs) by importing the real
    // file from its fixed path on disk. That tree sits outside every project's
    // git repo, so on CI (ubuntu-latest, no C:\ drive) these tests skip
    // visibly rather than pass silently — see the file itself for why.
    include: ["src/**/*.test.ts", "e2e/**/*.test.ts", "relay/**/*.test.ts", "standards/**/*.test.ts"],
    // `*.integration.test.ts` needs a real database and runs via
    // `vitest.integration.config.ts` / `npm run test:integration`. This suite
    // must stay DB-free and fast (AGENTS.md), so it never claims them.
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // Measure the tested business logic; pages/UI are covered by e2e.
      include: ["src/lib/**", "src/server/**"],
      exclude: ["**/*.test.ts", "**/*.d.ts", "src/test/**"],
      // Ratcheted to just under the real numbers measured on 2026-07-20 after the
      // src/server test push (statements 56.60 · branches 78.42 · functions 76.30
      // · lines 56.60), so coverage cannot silently rot. ~0.3-0.6 of slack is
      // deliberate: v8 output drifts a few tenths between CI's Node 20 and local
      // Node 22, and a false red trains people to ignore the gate. Re-measure and
      // raise after adding tests; never lower to make a red build pass.
      thresholds: {
        lines: 56,
        functions: 76,
        branches: 78,
        statements: 56,
      },
      // NOTE: per-directory glob thresholds (e.g. `"src/lib/**": { ... }`) are
      // deliberately NOT used. Vitest matches globs with `picomatch(glob)` against
      // `path.relative(root, file)`, which yields backslashes on Windows — so a
      // forward-slash glob silently matches nothing locally while still enforcing
      // on Linux CI. A gate that is inert on the developer's machine is worse than
      // no gate. Revisit only if verified on both platforms.
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      "server-only": path.resolve(process.cwd(), "src/test/shims/server-only.ts"),
    },
  },
});
