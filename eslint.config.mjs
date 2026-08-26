import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated artefacts — not source, and not linted.
    "coverage/**",
    "src/generated/**",
    // Scratch space. `.tmp/` is gitignored and never ships, but eslint still
    // walked into it, so a throwaway diagnostic script written during an
    // investigation turned `npm run lint` red and looked like a real failure
    // in the repository. Found cycle 12: 11 errors, every one of them from a
    // read-only production query script that is not part of the product.
    ".tmp/**",
  ]),
]);

export default eslintConfig;
