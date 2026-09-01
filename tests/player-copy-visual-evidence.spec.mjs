import { test, expect } from '@playwright/test';

async function boot(page) {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response?.ok(), `main HTML status ${response?.status()}`).toBeTruthy();
  await page.waitForTimeout(700);
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
}

function homeGo(page, target) {
  return page.locator(`[data-home-target="${target}"]:visible, [data-go="${target}"]:visible, [data-root-go="${target}"]:visible`).first();
}

async function snap(page, testInfo, name) {
  await testInfo.attach(`${testInfo.project.name}-${name}.png`, {
    body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
    contentType: 'image/png',
  });
}

test('player-copy evidence: Deck storage keeps only useful title/count context', async ({ page }, testInfo) => {
  await boot(page);
  const go = homeGo(page, 'cards');
  await expect(go).toBeVisible();
  await go.click();
  const cards = page.locator('section[data-screen="cards"]');
  await expect(cards).toBeVisible();

  const storage = cards.locator('[data-role="deck-storage-button"]:visible').first();
  await expect(storage, 'Deck storage remains visibly operable').toBeVisible();
  await storage.click();

  const dialog = page.locator('[data-role="deck-storage-backdrop"] .gr-storage-window:visible');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.gr-storage-title')).toHaveText('ストレージ');
  await expect(dialog.locator('.gr-storage-title')).not.toContainText('コーナー');
  await expect(dialog.locator('.gr-storage-title')).not.toContainText('+');
  await expect(dialog.locator('.gr-storage-column h3')).toHaveCount(2);
  await expect(dialog.locator('.gr-storage-column h3').nth(0)).toContainText(/^その他\s+\d+$/);
  await expect(dialog.locator('.gr-storage-column h3').nth(1)).toContainText(/^ロイヤル\s+\d+$/);
  await expect(dialog.locator('.gr-storage-close')).toHaveText('閉じる');
  await expect(dialog).not.toContainText('ストレージコーナー');
  await snap(page, testInfo, 'deck-storage-copy-current');
});

test('player-copy evidence: Saasuna conversation hides provider/debug guidance copy', async ({ page }, testInfo) => {
  await boot(page);
  const go = homeGo(page, 'characters');
  await expect(go).toBeVisible();
  await go.click();
  const characters = page.locator('section[data-screen="characters"]');
  await expect(characters).toBeVisible();

  const conversation = characters.locator('.grPartnerConversation[data-gr-partner-conversation="1"]:visible');
  await expect(conversation).toBeVisible();
  await expect(conversation.locator('.grPartnerIdentity b')).toHaveText('サースナー');
  await expect(conversation.locator('.grPartnerConversationState')).toHaveText('会話できます');
  await expect(conversation.locator('.grPartnerConversationInput')).toHaveAttribute('placeholder', 'メッセージを入力');
  await expect(conversation.locator('.grPartnerConversationSend')).toHaveText('送る');
  await expect(conversation).not.toContainText('PARTNER');
  await expect(conversation).not.toContainText('そのまま話しかけてください');
  await expect(conversation).not.toContainText('AI応答');
  await expect(conversation).not.toContainText('仮応答');
  await snap(page, testInfo, 'saasuna-conversation-copy-current');
});
