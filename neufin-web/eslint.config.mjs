// ESLint 9 flat config with FlatCompat for `next/core-web-vitals` (legacy eslintrc shape).

import path from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import securityPlugin from "eslint-plugin-security";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/out/**",
      "**/dist/**",
      "**/coverage/**",
      "**/.turbo/**",
    ],
  },
  ...compat.extends("next/core-web-vitals"),

  {
    plugins: { security: securityPlugin },
    rules: {
      // High noise on chart maps / dynamic keys; rely on code review + typed access where it matters.
      "security/detect-object-injection": "off",
      "security/detect-non-literal-regexp": "warn",
      "security/detect-unsafe-regex": "error",
      "security/detect-buffer-noassert": "error",
      "security/detect-child-process": "error",
      "security/detect-disable-mustache-escape": "error",
      "security/detect-eval-with-expression": "error",
      "security/detect-no-csrf-before-method-override": "error",
      "security/detect-non-literal-fs-filename": "warn",
      "security/detect-non-literal-require": "warn",
      "security/detect-possible-timing-attacks": "warn",
      "security/detect-pseudoRandomBytes": "error",

      "no-console": ["warn", { allow: ["warn", "error"] }],

      // React Compiler / hooks rules: many false positives on legacy patterns; keep off for CI until refactors land.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },

  {
    files: [
      "qa/**/*",
      "**/*.spec.ts",
      "playwright.config.ts",
      "proxy.ts",
      "scripts/**/*",
    ],
    rules: {
      "no-console": "off",
    },
  },
];

export default eslintConfig;
