import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for pure frontend modules (no browser, no backend): `npm test`. The e2e suite is Playwright.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
});
