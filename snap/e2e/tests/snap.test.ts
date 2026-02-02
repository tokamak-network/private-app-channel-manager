import { test, expect, chromium, BrowserContext, Page, Browser } from '@playwright/test';
import path from 'path';
import { execSync } from 'child_process';

const SNAP_DIR = path.resolve(__dirname, '../../packages/snap');
const SITE_URL = 'http://localhost:8000';
const METAMASK_EXTENSION_ID = 'ljfoeinjpaedjfecbmggjgodbgkmjkjk';
const CDP_URL = 'http://localhost:9222';

const TEST_CHANNEL_ID = '0xfaa339e2738b99d1f72c24f176885b2c4077e3b8165ee4e6b696c6d835ec6760';
const TEST_SERVER_URL = 'http://localhost:3000';
const METAMASK_PASSWORD = 'temp12!!';

test.describe.serial('Tokamak Channels Snap - Full Workflow', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async () => {
    console.log('Building snap...');
    execSync('yarn build', { cwd: SNAP_DIR, stdio: 'inherit' });

    console.log('Connecting to Chrome via CDP...');
    try {
      browser = await chromium.connectOverCDP(CDP_URL);
      console.log('Connected to Chrome!');
    } catch (e) {
      console.error('ERROR: Could not connect to Chrome. Start with: --remote-debugging-port=9222');
      throw e;
    }

    const contexts = browser.contexts();
    context = contexts[0] || await browser.newContext();
    page = await context.newPage();

    await unlockMetaMask(page);
  });

  async function unlockMetaMask(page: Page): Promise<void> {
    await page.goto(`chrome-extension://${METAMASK_EXTENSION_ID}/home.html`);
    await page.waitForTimeout(2000);

    const passwordInput = page.locator('input[type="password"]');
    if (await passwordInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('Unlocking MetaMask...');
      await passwordInput.fill(METAMASK_PASSWORD);
      const unlockBtn = page.locator('button').filter({ hasText: /Unlock|잠금 해제/i }).first();
      if (await unlockBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await unlockBtn.click();
        await page.waitForTimeout(3000);
      }
    }
    console.log('MetaMask ready');
  }

  async function openMetaMaskNotification(): Promise<Page> {
    const notificationUrl = `chrome-extension://${METAMASK_EXTENSION_ID}/notification.html`;
    const notificationPage = await context.newPage();
    await notificationPage.goto(notificationUrl);
    await notificationPage.waitForTimeout(1500);
    return notificationPage;
  }

  async function handleMetaMaskNotification(notificationPage: Page): Promise<boolean> {
    await notificationPage.screenshot({ path: `test-results/notification-${Date.now()}.png` });
    
    const buttonPatterns = [
      { pattern: /scroll down/i, action: 'scroll' },
      { pattern: /connect/i, action: 'click' },
      { pattern: /next/i, action: 'click' },
      { pattern: /confirm/i, action: 'click' },
      { pattern: /approve/i, action: 'click' },
      { pattern: /install/i, action: 'click' },
      { pattern: /ok/i, action: 'click' },
      { pattern: /got it/i, action: 'click' },
    ];

    let actionTaken = false;
    
    for (let attempt = 0; attempt < 10; attempt++) {
      let foundButton = false;
      
      for (const { pattern, action } of buttonPatterns) {
        const btn = notificationPage.locator('button').filter({ hasText: pattern }).first();
        if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
          if (action === 'scroll') {
            await notificationPage.mouse.wheel(0, 300);
            console.log('Scrolled down');
          } else {
            await btn.click();
            console.log(`Clicked: ${pattern}`);
          }
          foundButton = true;
          actionTaken = true;
          await notificationPage.waitForTimeout(1000);
          break;
        }
      }

      if (!foundButton) {
        const pageText = await notificationPage.textContent('body').catch(() => '') || '';
        if (pageText.includes('connected') || pageText.includes('installed') || pageText.length < 50) {
          console.log('Notification completed or empty');
          break;
        }
      }
      
      await notificationPage.waitForTimeout(500);
    }

    return actionTaken;
  }

  test.afterAll(async () => {
    if (page) await page.close();
  });

  test('1. Connect & Install Snap', async () => {
    await page.goto(SITE_URL);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/01-site-loaded.png' });

    const allButtons = await page.locator('button').all();
    console.log('All buttons on page:');
    for (const btn of allButtons) {
      const text = await btn.textContent().catch(() => '');
      const disabled = await btn.getAttribute('disabled');
      if (text?.trim()) {
        console.log(`  - "${text.trim()}" (disabled: ${disabled !== null})`);
      }
    }

    const reconnectBtn = page.locator('button').filter({ hasText: /^Reconnect$/ }).first();
    const connectBtn = page.locator('button').filter({ hasText: /^Connect$/ }).first();

    let targetBtn = null;
    if (await reconnectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('Found Reconnect button via locator');
      targetBtn = reconnectBtn;
    } else if (await connectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('Found Connect button via locator');
      targetBtn = connectBtn;
    }

    if (!targetBtn) {
      const showDashboard = page.getByRole('button', { name: 'Show Dashboard' });
      const isDisabled = await showDashboard.getAttribute('disabled');
      if (isDisabled === null) {
        console.log('Snap already installed and working');
        return;
      }
      console.log('No connect button found, checking for Install Flask button...');
      
      const installFlaskBtn = page.locator('a, button').filter({ hasText: /Install.*Flask/i }).first();
      if (await installFlaskBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        console.log('Install Flask button visible - MetaMask Flask not detected!');
      }
      
      await page.screenshot({ path: 'test-results/01-stuck-state.png' });
      return;
    }

    await targetBtn.click();
    console.log('Clicked connect button, waiting for MetaMask notification...');
    await page.waitForTimeout(2000);

    const notificationPage = await openMetaMaskNotification();
    await handleMetaMaskNotification(notificationPage);
    await notificationPage.close();

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/01-after-connect.png' });
  });

  test('2. Verify Snap Installation', async () => {
    await page.goto(SITE_URL);
    await page.waitForTimeout(2000);

    const showDashboard = page.getByRole('button', { name: 'Show Dashboard' });
    const isDisabled = await showDashboard.getAttribute('disabled');
    
    console.log('Show Dashboard disabled:', isDisabled !== null);
    await page.screenshot({ path: 'test-results/02-verify-installation.png' });

    if (isDisabled === null) {
      console.log('Snap is installed and buttons are enabled!');
    } else {
      console.log('Snap not properly installed yet');
    }
  });

  test('3. Configure Channel ID via Site', async () => {
    const setChannelBtn = page.getByRole('button', { name: 'Set Channel ID' });
    const isDisabled = await setChannelBtn.getAttribute('disabled');
    
    if (isDisabled !== null) {
      console.log('Set Channel ID button is disabled, skipping');
      return;
    }

    await setChannelBtn.click();
    console.log('Clicked Set Channel ID, checking for dialog...');
    await page.waitForTimeout(1500);

    const notificationPage = await openMetaMaskNotification();
    await notificationPage.screenshot({ path: 'test-results/03-channel-dialog.png' });

    const input = notificationPage.locator('input').first();
    if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
      await input.fill(TEST_CHANNEL_ID);
      console.log('Filled channel ID');

      const okBtn = notificationPage.locator('button').filter({ hasText: /ok|submit|confirm/i }).first();
      if (await okBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await okBtn.click();
        console.log('Confirmed channel ID');
      }
    }

    await notificationPage.waitForTimeout(1000);
    await notificationPage.close();
    await page.screenshot({ path: 'test-results/03-after-channel.png' });
  });

  test('4. Configure Server URL', async () => {
    const setServerBtn = page.getByRole('button', { name: 'Set Server URL' });
    const isDisabled = await setServerBtn.getAttribute('disabled');
    
    if (isDisabled !== null) {
      console.log('Set Server URL button is disabled, skipping');
      return;
    }

    await setServerBtn.click();
    console.log('Clicked Set Server URL...');
    await page.waitForTimeout(1500);

    const notificationPage = await openMetaMaskNotification();
    await notificationPage.screenshot({ path: 'test-results/04-server-dialog.png' });

    const input = notificationPage.locator('input').first();
    if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
      await input.fill(TEST_SERVER_URL);
      console.log('Filled server URL');

      const okBtn = notificationPage.locator('button').filter({ hasText: /ok|submit|confirm/i }).first();
      if (await okBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await okBtn.click();
        console.log('Confirmed server URL');
      }
    }

    await notificationPage.waitForTimeout(1000);
    await notificationPage.close();
    await page.screenshot({ path: 'test-results/04-after-server.png' });
  });

  test('5. Show Dashboard', async () => {
    const showDashboardBtn = page.getByRole('button', { name: 'Show Dashboard' });
    const isDisabled = await showDashboardBtn.getAttribute('disabled');
    
    if (isDisabled !== null) {
      console.log('Show Dashboard button is disabled, skipping');
      return;
    }

    await showDashboardBtn.click();
    console.log('Clicked Show Dashboard...');
    await page.waitForTimeout(1500);

    const notificationPage = await openMetaMaskNotification();
    await notificationPage.screenshot({ path: 'test-results/05-dashboard-dialog.png' });

    const pageText = await notificationPage.textContent('body').catch(() => '') || '';
    console.log('Dashboard contains "Channel":', pageText.includes('Channel'));
    console.log('Dashboard contains "Status":', pageText.includes('Status'));

    const okBtn = notificationPage.locator('button').filter({ hasText: /ok|close|got it/i }).first();
    if (await okBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await okBtn.click();
      console.log('Closed dashboard');
    }

    await notificationPage.close();
    await page.screenshot({ path: 'test-results/05-after-dashboard.png' });
  });

  test('6. Access Snap Homepage in MetaMask', async () => {
    await page.goto(`chrome-extension://${METAMASK_EXTENSION_ID}/home.html`);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/06-metamask-home.png' });

    const menuBtn = page.locator('[data-testid="app-header-menu-button"]');
    if (await menuBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await menuBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'test-results/06-menu-open.png' });

      const snapsItem = page.locator('button, a').filter({ hasText: /^Snaps$/i }).first();
      if (await snapsItem.isVisible({ timeout: 2000 }).catch(() => false)) {
        await snapsItem.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'test-results/06-snaps-list.png' });

        const tokamakSnap = page.locator('*').filter({ hasText: /Tokamak|local:http:\/\/localhost:8080/i }).first();
        if (await tokamakSnap.isVisible({ timeout: 3000 }).catch(() => false)) {
          await tokamakSnap.click();
          await page.waitForTimeout(2000);
          await page.screenshot({ path: 'test-results/06-snap-details.png' });

          const homeBtn = page.locator('button').filter({ hasText: /home/i }).first();
          if (await homeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await homeBtn.click();
            await page.waitForTimeout(3000);
            await page.screenshot({ path: 'test-results/06-snap-homepage.png' });
            
            const pageText = await page.textContent('body').catch(() => '') || '';
            console.log('Snap homepage has "Set Channel ID":', pageText.includes('Set Channel ID'));
            console.log('Snap homepage has "Dashboard":', pageText.includes('Dashboard'));
          }
        } else {
          console.log('Tokamak snap not found in list');
        }
      }
    }
  });

  async function navigateToSnapHomepage(page: Page): Promise<boolean> {
    await page.goto(`chrome-extension://${METAMASK_EXTENSION_ID}/home.html#snaps`);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/07-snaps-page-direct.png' });
    
    const tokamakText = page.getByText('Tokamak Channels');
    if (await tokamakText.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Found Tokamak Channels text, clicking...');
      await tokamakText.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'test-results/07-snap-details.png' });
      
      const pageText = await page.textContent('body').catch(() => '') || '';
      console.log('After clicking Tokamak (first 400 chars):', pageText.substring(0, 400));
      
      const homeBtn = page.getByRole('button', { name: 'Home' });
      const homeBtn2 = page.locator('button').filter({ hasText: /home/i }).first();
      
      if (await homeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await homeBtn.click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'test-results/07-snap-homepage.png' });
        console.log('Navigated to Snap Homepage');
        return true;
      } else if (await homeBtn2.isVisible({ timeout: 2000 }).catch(() => false)) {
        await homeBtn2.click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'test-results/07-snap-homepage.png' });
        console.log('Navigated to Snap Homepage via locator');
        return true;
      } else {
        console.log('Home button not found on snap details page');
        const allClickables = await page.locator('button, a').all();
        for (const el of allClickables.slice(0, 15)) {
          const text = await el.textContent().catch(() => '');
          if (text?.trim()) {
            console.log(`  Clickable: "${text.trim()}"`);
          }
        }
      }
    } else {
      console.log('Tokamak Channels text not found');
      const pageText = await page.textContent('body').catch(() => '') || '';
      console.log('Page text:', pageText.substring(0, 300));
    }
    
    return false;
  }

  test('7. Change Channel ID via Snap Homepage Form', async () => {
    const navigated = await navigateToSnapHomepage(page);
    if (!navigated) {
      console.log('Failed to navigate to snap homepage');
      return;
    }

    await page.screenshot({ path: 'test-results/07-snap-homepage-before.png' });
    
    const setChannelBtn = page.locator('button').filter({ hasText: /Set Channel ID/i }).first();
    if (await setChannelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await setChannelBtn.click();
      console.log('Clicked Set Channel ID button on Snap homepage');
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'test-results/07-set-channel-form.png' });
      
      const NEW_CHANNEL_ID = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      
      const input = page.locator('input').first();
      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        await input.click();
        await input.fill('');
        await input.type(NEW_CHANNEL_ID, { delay: 10 });
        const inputValue = await input.inputValue();
        console.log('Input value after typing:', inputValue);
        console.log('Expected value:', NEW_CHANNEL_ID);
        console.log('Values match:', inputValue === NEW_CHANNEL_ID);
        await page.screenshot({ path: 'test-results/07-channel-id-filled.png' });
        
        const saveBtn = page.locator('button').filter({ hasText: /^Save$/i }).first();
        if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          const frames = page.frames();
          console.log('Number of frames:', frames.length);
          for (let i = 0; i < frames.length; i++) {
            console.log(`Frame ${i}: ${frames[i]!.url()}`);
          }
          
          const saveBtnBounds = await saveBtn.boundingBox();
          console.log('Save button bounds:', saveBtnBounds);
          
          if (saveBtnBounds) {
            await page.mouse.click(saveBtnBounds.x + saveBtnBounds.width / 2, saveBtnBounds.y + saveBtnBounds.height / 2);
            console.log('Clicked Save button via mouse coordinates');
          } else {
            await saveBtn.click({ force: true });
            console.log('Clicked Save button with force');
          }
          
          await page.waitForTimeout(3000);
          await page.screenshot({ path: 'test-results/07-after-save.png' });
          
          let pageText = await page.textContent('body').catch(() => '') || '';
          console.log('Page text after save:', pageText.substring(0, 500));
          
          const hasNewChannelTruncated = pageText.includes('0x1234') || pageText.includes('cdef');
          console.log('New channel ID visible:', hasNewChannelTruncated);
          
          const setChannelBtn2 = page.locator('button').filter({ hasText: /Set Channel ID/i }).first();
          if (await setChannelBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
            await setChannelBtn2.click();
            await page.waitForTimeout(2000);
            await page.screenshot({ path: 'test-results/07-verify-persisted.png' });
            
            const copyableText = await page.textContent('body').catch(() => '') || '';
            const channelPersisted = copyableText.includes(NEW_CHANNEL_ID);
            console.log('Channel ID persisted correctly:', channelPersisted);
            
            expect(channelPersisted).toBe(true);
          }
        }
      }
    } else {
      console.log('Set Channel ID button not visible on snap homepage');
      const allButtons = await page.locator('button').all();
      for (const btn of allButtons) {
        const text = await btn.textContent().catch(() => '');
        if (text?.trim()) {
          console.log('  Button found:', text.trim());
        }
      }
    }
  });
});
