import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // `e2e/*.test.ts` covers the e2e harness's own logic (the safe-database
    // guard). Playwright only claims `*.spec.ts`, so the two do not overlap.
    include: ["src/**/*.test.ts", "e2e/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // Measure the tested business logic; pages/UI are covered by e2e.
      include: ["src/lib/**", "src/server/**"],
      exclude: ["**/*.test.ts", "**/*.d.ts", "src/test/**"],
      // Ratcheted to just under the real numbers measured on 2026-07-20
      // (statements 55.85 · branches 77.26 · functions 75.58 · lines 55.85), so
      // coverage cannot silently rot. ~0.3-0.6 of slack is deliberate: v8 output
      // drifts a few tenths between CI's Node 20 and local Node 22, and a false
      // red trains people to ignore the gate. Re-measure and raise after adding
      // tests; never lower to make a red build pass.
      thresholds: {
        lines: 55.5,
        functions: 75,
        branches: 77,
        statements: 55.5,
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
