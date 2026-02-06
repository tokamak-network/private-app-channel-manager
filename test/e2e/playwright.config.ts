import { defineConfig } from '@playwright/test';
import path from 'path';

/**
 * Playwright Configuration for MetaMask E2E Tests
 *
 * These tests use Chrome DevTools Protocol (CDP) to connect to an existing
 * Chrome instance with MetaMask installed.
 *
 * Prerequisites:
 * 1. Start Chrome with: --remote-debugging-port=9222
 * 2. Have MetaMask installed and configured (Sepolia testnet)
 * 3. App running at http://localhost:3000
 */
export default defineConfig({
  testDir: path.resolve(__dirname, './tests'),
  timeout: 180000, // 3 minutes for blockchain operations
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0, // No retries for manual MetaMask testing
  workers: 1,
  reporter: [
    ['html', { outputFolder: path.resolve(__dirname, './playwright-report') }],
    ['list'],
  ],
  use: {
    headless: false,
    trace: 'on-first-retry',
    screenshot: 'on',
  },
  projects: [
    {
      name: 'metamask',
      testMatch: /.*\.test\.ts$/,
    },
  ],
  outputDir: path.resolve(__dirname, './test-results'),
});
