import { defineConfig } from "@playwright/test";
const webPort = Number(process.env.SECONDLOOK_E2E_WEB_PORT ?? 5174);
const apiPort = Number(process.env.SECONDLOOK_E2E_API_PORT ?? 3101);
for (const port of [webPort, apiPort])
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("测试端口必须为 1024～65535 的整数");
const webUrl = `http://127.0.0.1:${webPort}`;
const apiUrl = `http://127.0.0.1:${apiPort}`;
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: webUrl,
    channel: process.env.PLAYWRIGHT_CHANNEL,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node ../../scripts/e2e-api.mjs",
      url: `${apiUrl}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: `npm run dev -- --port ${webPort} --strictPort`,
      url: webUrl,
      reuseExistingServer: false,
      env: { VITE_API_PROXY: apiUrl },
    },
  ],
});
