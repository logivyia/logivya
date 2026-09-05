import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // These standalone operational scripts intentionally use Node CommonJS.
    // Keep every other lint rule active; ESM imports cannot run in .cjs files.
    files: [
      "scripts/apple/*-expired-review-account.cjs",
      "scripts/test-mobile-build-security.cjs",
      "ops/vps/**/*.cjs",
    ],
    languageOptions: { sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-stale-*/**",
    ".local-android/**",
    ".tools/**",
    "artifacts/**",
    "apps/mobile/**",
    "out/**",
    "build/**",
    "tmp/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
