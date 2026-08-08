import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/playwright",
  use: { baseURL: "http://localhost:5173" },
  webServer: {
    command: "bun run dev -- --port 5173",
    port: 5173,
    reuseExistingServer: true,
  },
});
