/**
 * Create Channel E2E Test with MetaMask (CDP Connection)
 */

import { test, expect, chromium, BrowserContext, Page, Browser } from '@playwright/test';

const APP_URL = process.env.APP_URL || 'http://localhost:3001';
const CDP_URL = 'http://localhost:9222';
const METAMASK_EXTENSION_ID = 'nkbihfbeogaeaoehlefnkodbefgpgknn';
const METAMASK_PASSWORD = 'temp12!!';

const TEST_PARTICIPANTS = [
  '0x6233A7c52652282b8b0b85C817537F072228587F',
  '0xc3f83F0cC8f3FA15ae5b1d7b21Dfa5E04B351FC7',
];

test.describe.serial('Create Channel with MetaMask', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async () => {
    console.log('Connecting to Chrome via CDP...');
    try {
      browser = await chromium.connectOverCDP(CDP_URL);
      console.log('Connected!');
    } catch (e) {
      console.error('Chrome not running with --remote-debugging-port=9222');
      throw e;
    }

    const contexts = browser.contexts();
    context = contexts[0] || await browser.newContext();
    page = await context.newPage();

    // Unlock MetaMask first
    await unlockMetaMask(page);
  });

  async function unlockMetaMask(p: Page) {
    console.log('MetaMask 잠금 해제 중...');
    await p.goto(`chrome-extension://${METAMASK_EXTENSION_ID}/home.html`);
    await p.waitForTimeout(2000);

    const passwordInput = p.locator('input[type="password"]');
    if (await passwordInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await passwordInput.fill(METAMASK_PASSWORD);
      await p.locator('button').filter({ hasText: /Unlock|잠금 해제/i }).first().click();
      await p.waitForTimeout(2000);
      console.log('MetaMask 잠금 해제 완료');
    } else {
      console.log('MetaMask 이미 잠금 해제됨');
    }
  }

  async function handleMetaMaskPopup(action: 'connect' | 'confirm' = 'connect') {
    console.log(`MetaMask 팝업 처리: ${action}`);
    const notificationPage = await context.newPage();
    await notificationPage.goto(`chrome-extension://${METAMASK_EXTENSION_ID}/notification.html`);
    await notificationPage.waitForTimeout(1500);

    if (action === 'connect') {
      // Next 버튼
      const nextBtn = notificationPage.locator('button').filter({ hasText: /Next|다음/i }).first();
      if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nextBtn.click();
        console.log('Next 클릭');
        await notificationPage.waitForTimeout(1000);
      }

      // Connect 버튼
      const connectBtn = notificationPage.locator('button').filter({ hasText: /Connect|연결/i }).first();
      if (await connectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await connectBtn.click();
        console.log('Connect 클릭');
        await notificationPage.waitForTimeout(1000);
      }
    } else {
      // Confirm 버튼 (트랜잭션)
      const confirmBtn = notificationPage.locator('button').filter({ hasText: /Confirm|확인|Approve/i }).first();
      if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await confirmBtn.click();
        console.log('Confirm 클릭');
        await notificationPage.waitForTimeout(1000);
      }
    }

    await notificationPage.close();
  }

  test.afterAll(async () => {
    if (page) await page.close();
  });

  test('1. 지갑 연결', async () => {
    // 앱 접속
    await page.goto(APP_URL);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/01-app.png' });

    // 계정 헤더 버튼 클릭하여 패널 열기
    const accountHeaderBtn = page.locator('[data-testid="account-header-button"]');
    if (await accountHeaderBtn.isVisible({ timeout: 5000 })) {
      await accountHeaderBtn.click();
      console.log('계정 패널 열기');
      await page.waitForTimeout(1000);
    }

    // Connect Wallet 버튼 클릭
    const connectWalletBtn = page.locator('[data-testid="connect-wallet-button"]');
    if (await connectWalletBtn.isVisible({ timeout: 5000 })) {
      await connectWalletBtn.click();
      console.log('Connect Wallet 클릭');
      await page.waitForTimeout(2000);

      // MetaMask 팝업 처리
      await handleMetaMaskPopup('connect');
      await page.waitForTimeout(3000);
    }

    await page.screenshot({ path: 'test-results/01-connected.png' });

    // 연결 확인 - 주소가 표시되는지 확인
    const headerText = await page.locator('[data-testid="account-header-button"]').textContent();
    console.log('계정 헤더 텍스트:', headerText);
    expect(headerText).toMatch(/0x|Sepolia/i);
  });

  test('2. Create Channel 페이지 이동', async () => {
    await page.goto(`${APP_URL}/create-channel`);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/02-create-page.png' });

    await expect(page.locator('h1').filter({ hasText: /Create Channel/i })).toBeVisible();
    console.log('Create Channel 페이지 로드 완료');
  });

  test('3. ERC20 앱 선택', async () => {
    const dropdown = page.locator('button').filter({ hasText: /Select App/i }).first();
    if (await dropdown.isVisible({ timeout: 3000 })) {
      await dropdown.click();
      await page.waitForTimeout(500);
      await page.locator('button').filter({ hasText: /^ERC20$/i }).first().click();
      console.log('ERC20 선택');
    }
    await page.screenshot({ path: 'test-results/03-erc20.png' });
  });

  test('4. Channel ID 생성', async () => {
    const generateBtn = page.locator('[data-testid="generate-channel-id-button"]');
    if (await generateBtn.isVisible({ timeout: 5000 })) {
      await generateBtn.click();
      console.log('Channel ID 생성 클릭');
      await page.waitForTimeout(1500);
    }
    await page.screenshot({ path: 'test-results/04-channel-id.png' });
  });

  test('5. 참가자 추가', async () => {
    // 첫 번째 참가자
    const input0 = page.locator('[data-testid="participant-address-input-0"]');
    if (await input0.isVisible({ timeout: 5000 })) {
      await input0.fill(TEST_PARTICIPANTS[0]);
      console.log('참가자 1 입력:', TEST_PARTICIPANTS[0]);
      await page.waitForTimeout(1500);
    }

    // 두 번째 참가자 (새 입력 필드가 나타남)
    const input1 = page.locator('[data-testid="participant-address-input-1"]');
    if (await input1.isVisible({ timeout: 5000 })) {
      await input1.fill(TEST_PARTICIPANTS[1]);
      console.log('참가자 2 입력:', TEST_PARTICIPANTS[1]);
      await page.waitForTimeout(1000);
    }

    await page.screenshot({ path: 'test-results/05-participant.png' });
  });

  test('6. 채널 생성', async () => {
    const createBtn = page.locator('[data-testid="create-channel-button"]');

    if (await createBtn.isVisible({ timeout: 5000 })) {
      const disabled = await createBtn.getAttribute('disabled');
      if (disabled === null) {
        await createBtn.click();
        console.log('Create Channel 클릭');
        await page.waitForTimeout(2000);

        // 모달 확인 버튼
        const modalBtn = page.locator('button').filter({ hasText: /Confirm|Create|확인/i }).last();
        if (await modalBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await modalBtn.click();
          console.log('모달 확인');
          await page.waitForTimeout(2000);

          // MetaMask 트랜잭션 승인
          await handleMetaMaskPopup('confirm');
          await page.waitForTimeout(15000);
        }
      } else {
        console.log('Create 버튼 비활성화 - Requirements 확인 필요');
        await page.screenshot({ path: 'test-results/06-disabled.png' });
      }
    }

    await page.screenshot({ path: 'test-results/06-result.png' });
  });
});
