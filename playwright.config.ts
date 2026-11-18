import { defineConfig } from "@playwright/test";

// `LIVE=1` runs the tests against the real search service, skipping the
// `@stub` ones, which assert on the stub's made-up data. Otherwise the `@live`
// tests are skipped and the rest run against tests/stub-api.ts, on their own
// ports so a dev server left running against the real service is never reused
// by mistake.
const live = !!process.env.LIVE;
const port = live ? 5173 : 5175;

export default defineConfig({
  testDir: "tests/playwright",
  grepInvert: live ? /@stub/ : /@live/,
  use: { baseURL: `http://localhost:${port}` },
  webServer: [
    ...(live ? [] : [{ command: "bun tests/stub-api.ts", port: 5174 }]),
    {
      command: `bun run dev -- --port ${port}`,
      port,
      reuseExistingServer: live,
      env: live ? {} : { API_BASE: "http://localhost:5174" },
    },
  ],
});
