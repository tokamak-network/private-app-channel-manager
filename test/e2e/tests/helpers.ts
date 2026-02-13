/**
 * E2E Test Helpers for Chrome CDP + MetaMask
 *
 * Common utilities extracted from createChannel.test.ts
 * for reuse across all lifecycle test files.
 */

import { chromium, Browser, BrowserContext, Page } from '@playwright/test';

export const APP_URL = process.env.APP_URL || 'http://localhost:3001';
export const CDP_URL = 'http://localhost:9222';
export const METAMASK_EXTENSION_ID = 'nkbihfbeogaeaoehlefnkodbefgpgknn';
export const METAMASK_PASSWORD = 'temp12!!';

export const TEST_PARTICIPANTS = [
  '0x6233A7c52652282b8b0b85C817537F072228587F',
  '0xc3f83F0cC8f3FA15ae5b1d7b21Dfa5E04B351FC7',
];

/**
 * Connect to Chrome via CDP (Chrome DevTools Protocol)
 */
export async function connectToCDP(): Promise<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
}> {
  console.log('Connecting to Chrome via CDP...');
  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
    console.log('Connected!');
  } catch (e) {
    console.error('Chrome not running with --remote-debugging-port=9222');
    throw e;
  }

  const contexts = browser.contexts();
  const context = contexts[0] || (await browser.newContext());
  const page = await context.newPage();

  return { browser, context, page };
}

/**
 * Unlock MetaMask if locked
 */
export async function unlockMetaMask(page: Page): Promise<void> {
  console.log('MetaMask 잠금 해제 중...');
  await page.goto(`chrome-extension://${METAMASK_EXTENSION_ID}/home.html`);
  await page.waitForTimeout(2000);

  const passwordInput = page.locator('input[type="password"]');
  if (await passwordInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await passwordInput.fill(METAMASK_PASSWORD);
    await page.locator('button').filter({ hasText: /Unlock|잠금 해제/i }).first().click();
    await page.waitForTimeout(2000);
    console.log('MetaMask 잠금 해제 완료');
  } else {
    console.log('MetaMask 이미 잠금 해제됨');
  }
}

/**
 * Handle MetaMask popup for connect or confirm actions.
 * Opens notification.html directly and clicks the appropriate button.
 */
export async function handleMetaMaskPopup(
  context: BrowserContext,
  action: 'connect' | 'confirm' | 'sign' = 'connect'
): Promise<void> {
  console.log(`MetaMask 팝업 처리: ${action}`);
  const notificationPage = await context.newPage();
  await notificationPage.goto(`chrome-extension://${METAMASK_EXTENSION_ID}/notification.html`);
  await notificationPage.waitForTimeout(1500);

  if (action === 'connect') {
    // Next button
    const nextBtn = notificationPage.locator('button').filter({ hasText: /Next|다음/i }).first();
    if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nextBtn.click();
      console.log('Next 클릭');
      await notificationPage.waitForTimeout(1000);
    }

    // Connect button
    const connectBtn = notificationPage.locator('button').filter({ hasText: /Connect|연결/i }).first();
    if (await connectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await connectBtn.click();
      console.log('Connect 클릭');
      await notificationPage.waitForTimeout(1000);
    }
  } else if (action === 'sign') {
    // Sign button (for personal_sign / signTypedData)
    const signBtn = notificationPage.locator('button').filter({ hasText: /Sign|서명/i }).first();
    if (await signBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await signBtn.click();
      console.log('Sign 클릭');
      await notificationPage.waitForTimeout(1000);
    }
  } else {
    // Confirm button (for transactions)
    const confirmBtn = notificationPage.locator('button').filter({ hasText: /Confirm|확인|Approve/i }).first();
    if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await confirmBtn.click();
      console.log('Confirm 클릭');
      await notificationPage.waitForTimeout(1000);
    }
  }

  await notificationPage.close();
}

/**
 * Connect wallet in the app UI via MetaMask
 */
export async function connectWallet(
  page: Page,
  context: BrowserContext
): Promise<void> {
  // Check if already connected
  const headerText = await page.locator('[data-testid="account-header-button"]').textContent().catch(() => '');
  if (headerText && (/0x/i.test(headerText) || /Sepolia/i.test(headerText))) {
    console.log('지갑 이미 연결됨');
    return;
  }

  // Open account panel
  const accountHeaderBtn = page.locator('[data-testid="account-header-button"]');
  if (await accountHeaderBtn.isVisible({ timeout: 5000 })) {
    await accountHeaderBtn.click();
    console.log('계정 패널 열기');
    await page.waitForTimeout(1000);
  }

  // Click Connect Wallet
  const connectWalletBtn = page.locator('[data-testid="connect-wallet-button"]');
  if (await connectWalletBtn.isVisible({ timeout: 5000 })) {
    await connectWalletBtn.click();
    console.log('Connect Wallet 클릭');
    await page.waitForTimeout(2000);

    // Handle MetaMask popup
    await handleMetaMaskPopup(context, 'connect');
    await page.waitForTimeout(3000);
  }
}

/**
 * Wait for a transaction to be mined.
 * Watches for success indicators or tx hash appearance.
 */
export async function waitForTx(
  page: Page,
  timeout: number = 60000
): Promise<void> {
  console.log('트랜잭션 완료 대기...');
  // Wait for either a success message or tx hash to appear
  await page.waitForFunction(
    () => {
      const body = document.body.innerText;
      return (
        body.includes('Completed') ||
        body.includes('Success') ||
        body.includes('completed') ||
        body.includes('Tx Hash')
      );
    },
    { timeout }
  );
  console.log('트랜잭션 완료');
}

/**
 * Navigate to a channel's state explorer page.
 * The app redirects to the appropriate sub-page based on channel state.
 */
export async function navigateToChannel(
  page: Page,
  channelId: string
): Promise<void> {
  // The app uses Zustand store, so we need to set the channelId via URL
  // Navigate to state-explorer which reads channelId from query param
  await page.goto(`${APP_URL}/state-explorer?channelId=${channelId}`);
  await page.waitForTimeout(3000);
}

/**
 * Take a screenshot with a descriptive name in test-results/
 */
export async function screenshot(
  page: Page,
  name: string
): Promise<void> {
  await page.screenshot({ path: `test-results/${name}.png` });
}
