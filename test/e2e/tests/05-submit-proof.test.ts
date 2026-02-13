/**
 * Step 5: Submit Proof E2E Test with MetaMask (CDP Connection)
 *
 * Tests proof approval and on-chain submission:
 * 1. Navigate to transaction page (state 2 = Open)
 * 2. Select proof from proof list
 * 3. Click "Approve Selected Proof"
 * 4. Click "Submit Proof" button
 * 5. Confirm in modal, MetaMask transaction approval
 * 6. Verify state change (redirect to state3 page)
 */

import { test, expect, BrowserContext, Page, Browser } from '@playwright/test';
import {
  APP_URL,
  connectToCDP,
  unlockMetaMask,
  handleMetaMaskPopup,
  connectWallet,
  navigateToChannel,
  screenshot,
} from './helpers';
import { loadState, saveState } from './shared-state';

test.setTimeout(180_000);

test.describe.serial('Step 5: Submit Proof', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let channelId: string;

  test.beforeAll(async () => {
    const state = loadState();
    if (!state.channelId) {
      throw new Error('No channelId in shared state. Run previous tests first.');
    }
    channelId = state.channelId;
    console.log('Channel ID:', channelId);

    const cdp = await connectToCDP();
    browser = cdp.browser;
    context = cdp.context;
    page = cdp.page;

    await unlockMetaMask(page);
  });

  test.afterAll(async () => {
    if (page) await page.close();
  });

  test('1. Transaction 페이지 이동', async () => {
    await page.goto(APP_URL);
    await page.waitForTimeout(3000);

    await connectWallet(page, context);

    await navigateToChannel(page, channelId);
    await page.waitForTimeout(3000);

    await screenshot(page, '05-01-transaction-page');

    await expect(page).toHaveURL(/transaction/, { timeout: 10_000 });
    console.log('Transaction 페이지 로드 완료');
  });

  test('2. Proof 선택 및 Approve', async () => {
    // Wait for proof list to load
    await expect(page.locator('text=proof#')).toBeVisible({ timeout: 10_000 });

    // Select proof (click on the radio button or proof item)
    const proofItem = page.locator('[data-testid^="proof-list-item"]').first();
    if (await proofItem.isVisible({ timeout: 5000 }).catch(() => false)) {
      await proofItem.click();
      console.log('Proof 아이템 선택');
    } else {
      // Try clicking on the first proof radio/checkbox
      const radioBtn = page.locator('input[type="radio"]').first();
      if (await radioBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await radioBtn.click();
        console.log('Proof 라디오 버튼 클릭');
      }
    }
    await page.waitForTimeout(1000);

    // Click "Approve Selected Proof" button
    const approveBtn = page.locator('button').filter({ hasText: /Approve Selected Proof/i }).first();
    if (await approveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await approveBtn.click();
      console.log('Approve Selected Proof 클릭');
      await page.waitForTimeout(2000);

      // Confirm in modal if shown
      const confirmBtn = page.locator('button').filter({ hasText: /^Confirm$/i }).first();
      if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await confirmBtn.click();
        console.log('Approve 모달 Confirm 클릭');
        await page.waitForTimeout(2000);
      }
    }

    await screenshot(page, '05-02-proof-approved');
    console.log('Proof Approve 완료');
  });

  test('3. Submit Proof', async () => {
    // Click Submit Proof button
    const submitBtn = page.locator('[data-testid="submit-proof-button"]');
    await expect(submitBtn).toBeVisible({ timeout: 10_000 });
    await expect(submitBtn).toBeEnabled({ timeout: 10_000 });

    await submitBtn.click();
    console.log('Submit Proof 버튼 클릭');
    await page.waitForTimeout(2000);

    await screenshot(page, '05-03-submit-modal');

    // Confirm in submit modal
    const submitConfirmBtn = page.locator('button').filter({ hasText: /Submit|Confirm/i }).last();
    if (await submitConfirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await submitConfirmBtn.click();
      console.log('Submit 모달 Confirm 클릭');
      await page.waitForTimeout(2000);
    }
  });

  test('4. MetaMask 트랜잭션 승인', async () => {
    await handleMetaMaskPopup(context, 'confirm');
    console.log('MetaMask 트랜잭션 승인');
    await page.waitForTimeout(15_000);

    await screenshot(page, '05-04-tx-confirming');
  });

  test('5. 제출 완료 및 state3 리다이렉트', async () => {
    // Wait for completion
    await page.waitForFunction(
      () => {
        const body = document.body.innerText;
        return (
          body.includes('Proof Submitted') ||
          body.includes('Submitted') ||
          body.includes('completed') ||
          body.includes('Close Channel')
        );
      },
      { timeout: 60_000 }
    );

    await screenshot(page, '05-05-submitted');

    // Close modal if present
    const closeBtn = page.locator('button').filter({ hasText: /^Close$/i }).first();
    if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await closeBtn.click();
      await page.waitForTimeout(3000);
    }

    // Verify redirect to state3 page (Closing state)
    await expect(page).toHaveURL(/state3/, { timeout: 15_000 });
    console.log('State3 페이지로 리다이렉트 확인');

    await screenshot(page, '05-05-state3-page');

    saveState({ proofSubmittedAt: Date.now() });
  });
});
