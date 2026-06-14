import { resolve } from 'node:path';

import { defineConfig } from '@playwright/test';

const ROOT = resolve(__dirname, '..');

export default defineConfig({
  testDir: './tests',
  snapshotDir: './screenshots',
  snapshotPathTemplate: '{snapshotDir}/{testFilePath}/{projectName}/{arg}{ext}',
  timeout: 30_000,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
    },
  },
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command:
      'echo \'{"rewrites":[{"source":"/listing/:id","destination":"/listing/[id].html"}]}\' > apps/mobile/dist/serve.json && bunx serve apps/mobile/dist -l 3000 --no-clipboard',
    cwd: ROOT,
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium-light',
      use: { colorScheme: 'light' },
    },
    {
      name: 'chromium-dark',
      use: { colorScheme: 'dark' },
    },
  ],
});
