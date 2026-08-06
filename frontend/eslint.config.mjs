import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // This application intentionally hydrates API-backed screen state inside effects.
      // Keep purity, dependency, hook-order, and compiler diagnostics enabled while
      // avoiding a forced architectural rewrite solely for React Compiler eligibility.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: [
      "src/components/landing-page.tsx",
      "src/components/login-page.tsx",
      "src/components/register-page.tsx",
      "src/components/connected-assessment-session.tsx",
    ],
    rules: {
      // These components use approved public medical illustrations whose exact intrinsic
      // sizing and existing layout must remain stable. They are intentionally not migrated
      // to next/image as part of the interaction/release-stabilization scope.
      "@next/next/no-img-element": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
