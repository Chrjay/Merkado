import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    env: { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'e2e-key' },
  },
  use: {
    baseURL: 'http://localhost:4173',
  },
  projects: [{ name: 'mobile-chrome', use: { ...devices['Pixel 7'] } }],
});
