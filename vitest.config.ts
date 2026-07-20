import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // Measure the tested business logic; pages/UI are covered by e2e.
      include: ["src/lib/**", "src/server/**"],
      exclude: ["**/*.test.ts", "**/*.d.ts", "src/test/**"],
      // Starting floor (BidlowAI Engineering Standard Â§3). Run `npm run test:coverage`
      // to see your real numbers, then ratchet these up to just under them and add
      // `test:coverage` to CI so coverage can't regress.
      thresholds: {
        lines: 55,
        functions: 74,
        branches: 76,
        statements: 55,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      "server-only": path.resolve(process.cwd(), "src/test/shims/server-only.ts"),
    },
  },
});
