// @ts-check
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "drizzle/**", "node_modules/**", ".data/**", "coverage/**", "src/shared/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node }, ecmaVersion: 2023, sourceType: "module" },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "no-console": "off",
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
);
