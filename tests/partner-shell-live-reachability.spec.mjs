import { test, expect } from '@playwright/test';

function observeRuntimeErrors(page) {
  const pageErrors = [];
  const consoleErrors = [];
  const unexpectedHttpErrors = [];
  let versionManifest404Count = 0;

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const url = new URL(response.url());
    if (response.status() === 404 && url.pathname.endsWith('/browser/gameroad-version.json')) {
      versionManifest404Count += 1;
      return;
    }
    unexpectedHttpErrors.push(`${response.status()} ${url.pathname}`);
  });

  return {
    assertClean(testInfo) {
      const remainingConsoleErrors = [...consoleErrors];
      for (let i = 0; i < versionManifest404Count; i += 1) {
        const index = remainingConsoleErrors.findIndex((message) =>
          message.includes('Failed to load resource') && message.includes('404'),
        );
        if (index >= 0) remainingConsoleErrors.splice(index, 1);
      }
      if (versionManifest404Count > 0) {
        testInfo.annotations.push({
          type: 'known-deployment-gap',
          description: `gameroad-version.json returned 404 ${versionManifest404Count} time(s); tracked separately from Partner Shell reachability`,
        });
      }
      expect(unexpectedHttpErrors, `unexpected HTTP errors:\n${unexpectedHttpErrors.join('\n')}`).toEqual([]);
      expect(pageErrors, `page errors:\n${pageErrors.join('\n')}`).toEqual([]);
      expect(remainingConsoleErrors, `console errors:\n${remainingConsoleErrors.join('\n')}`).toEqual([]);
    },
  };
}

function rootGo(page, target) {
  return page
    .locator(`[data-go="${target}"]:visible, [data-home-target="${target}"]:visible, [data-root-go="${target}"]:visible`)
    .first();
}

test('live Saasuna conversation reaches the current Partner Shell and keeps costume fail-closed', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'phone-touch-390x844', 'three standard viewport evidence only');
  const runtime = observeRuntimeErrors(page);

  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response, 'main HTML response').not.toBeNull();
  expect(response.ok(), `main HTML status ${response.status()}`).toBeTruthy();
  await page.waitForTimeout(400);

  const home = page.locator('section[data-screen="home"]');
  await expect(home, 'Home is the visible starting surface').toBeVisible();
  const charactersControl = rootGo(page, 'characters');
  await expect(charactersControl, 'visible Home-to-Partner/Characters control').toBeVisible();
  await charactersControl.click();

  const characters = page.locator('section[data-screen="characters"]');
  await expect(characters, 'Characters target reached through visible player control').toBeVisible();
  const conversation = characters.locator('[data-gr-partner-conversation="1"]');
  await expect(conversation, 'current Saasuna conversation is projected on the live Characters screen').toBeVisible({ timeout: 7_000 });
  await expect(conversation).toHaveAttribute('aria-label', 'サースナーとの会話');

  const input = conversation.locator('.grPartnerConversationInput');
  await expect(input, 'direct conversation remains visible before opening the Partner Shell').toBeVisible();
  await input.fill('導線QAの下書き');

  const trigger = conversation.locator('[data-partner-hub-trigger="1"]');
  await expect(trigger, 'visible Partner menu trigger').toBeVisible();
  await expect(trigger).toHaveText('パートナー');
  await trigger.click();

  const overlay = conversation.locator('[data-partner-hub-overlay="1"]');
  await expect(overlay, 'Partner Shell overlay opens from the live conversation').toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');

  const hub = overlay.locator('[data-partner-shell-view="hub"]');
  await expect(hub, 'current Partner hub is visible').toBeVisible();
  const idle = overlay.locator('.partner-shell-idle-readable');
  await expect(idle, 'approved idle/readable Partner line is visible').toBeVisible();
  await expect(idle).toHaveAttribute('data-partner-id', 'partner.saasuna');
  await expect(idle).toHaveAttribute('data-source-state', 'approved_current');
  await expect(idle).toHaveAttribute('data-presentation-only', 'true');
  expect((await idle.textContent())?.trim().length ?? 0, 'idle/readable line contains actual text').toBeGreaterThan(0);

  const visibleActions = await overlay.locator('[data-partner-shell-action]:visible').evaluateAll((nodes) =>
    nodes.map((node) => node.dataset.partnerShellAction),
  );
  expect(visibleActions, 'only current live actions are exposed').toEqual(['OPEN_ACTIVE_DETAIL', 'OPEN_CONVERSATION']);
  await expect(overlay.locator('[data-partner-shell-action="OPEN_COSTUME"]'), 'costume stays hidden without authoritative ownership/catalog/load/save provider').toHaveCount(0);
  await expect(overlay.locator('[data-partner-shell-action="OPEN_LIST"]'), 'unconnected roster action stays hidden').toHaveCount(0);
  await expect(input, 'direct conversation DOM is preserved behind the secondary overlay').toHaveValue('導線QAの下書き');

  const hubPng = await page.screenshot({ fullPage: true, animations: 'disabled' });
  await testInfo.attach(`${testInfo.project.name}-partner-shell-hub.png`, { body: hubPng, contentType: 'image/png' });

  const detailAction = overlay.locator('[data-partner-shell-action="OPEN_ACTIVE_DETAIL"]');
  await expect(detailAction).toBeVisible();
  await detailAction.click();
  await expect(overlay.locator('[data-partner-shell-view="detail"]'), 'detail opens inside the same Partner Shell').toBeVisible();
  await expect(overlay.getByText('サースナー', { exact: true }).first(), 'detail identifies the current Partner').toBeVisible();

  const backAction = overlay.locator('[data-partner-shell-action="BACK_HUB"]');
  await expect(backAction, 'detail exposes the current return-to-hub action').toBeVisible();
  await backAction.click();
  await expect(overlay.locator('[data-partner-shell-view="hub"]'), 'return action restores the Partner hub').toBeVisible();

  const close = conversation.locator('[data-partner-hub-close="1"]');
  await expect(close, 'explicit return-to-conversation control').toBeVisible();
  await expect(close).toHaveText('会話へ戻る');
  await close.click();
  await expect(overlay, 'explicit close hides only the secondary overlay').toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(input, 'direct conversation remains after closing the Partner Shell').toBeVisible();
  await expect(input).toHaveValue('導線QAの下書き');

  runtime.assertClean(testInfo);
  testInfo.annotations.push({
    type: 'partner-shell-live-reachability',
    description: `visible Home→Characters→Saasuna conversation→Partner Shell→detail→hub→conversation passed on ${testInfo.project.name}; approved idle content visible; unsupported costume/list actions absent; product/runtime/save/economy unchanged`,
  });
});
