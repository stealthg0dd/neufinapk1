// ESLint 9 flat config — replaces .eslintrc.json
// eslint-config-next@16 exports native flat config arrays; no FlatCompat needed.
// Eliminates the "Converting circular structure to JSON" error caused by the
// react plugin's circular references when serialized through the legacy eslintrc shim.

import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import securityPlugin from "eslint-plugin-security";

export default [
  // Next.js core-web-vitals: includes React, React-hooks, import, and @next/next rules
  ...nextCoreWebVitals,

  // Security plugin + project-wide rule overrides
  {
    plugins: { security: securityPlugin },
    rules: {
      // ── Security ───────────────────────────────────────────────────────────
      "security/detect-object-injection": "warn",
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

      // ── Console ────────────────────────────────────────────────────────────
      "no-console": ["warn", { allow: ["warn", "error"] }],

      // ── React Compiler rules (new in Next.js 16 / eslint-config-next@16) ──
      // Downgraded from error → warn: the codebase pre-dates React Compiler
      // requirements and these patterns (setState in effects, etc.) are
      // intentional in existing components.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
];
