import { defineConfig } from "vitest/config";

// Tests run against the ONE database (DATABASE_URL = webnews_platform) and are non-destructive:
// every API test file creates its own "<random>@test.webnews.local" users and deletes exactly those
// in afterAll. Files run one at a time to keep connection counts and timings predictable.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      TRUST_PROXY: "1",
      // Test uploads live apart from real ones; each file removes its users' folders afterwards.
      LOCAL_UPLOAD_DIR: ".data/test-uploads",
      // Never touch a real bucket from tests.
      R2_ACCOUNT_ID: "",
      R2_ACCESS_KEY_ID: "",
      R2_SECRET_ACCESS_KEY: "",
      R2_BUCKET: "",
      R2_PUBLIC_BASE_URL: "",
      LOG_REQUESTS: "0",
      // Tests check the normal "start 10 minutes early" rule even when a dev .env allows starting any time.
      PRESS_MEET_START_ANYTIME: "0",
    },
  },
});
