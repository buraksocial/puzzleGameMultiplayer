import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 90000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5178', headless: true,
    trace: 'retain-on-failure',
    launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] }
  },
  webServer: [
    { command: 'node ../backend/index.js', env: { PORT: '3001' }, url: 'http://localhost:3001/peerjs/', reuseExistingServer: false },
    { command: 'npm run dev -- --host 127.0.0.1 --port 5178 --strictPort', url: 'http://localhost:5178', reuseExistingServer: false }
  ]
});
