import { test, expect } from '@playwright/test';

const PUBLIC_ORIGIN = 'https://gameroad-browser-r5.pages.dev';
const EXPECTED_PUBLIC_BUILD = '9a5b243fa2591be22d0f648bfbd541d9aae0cb01';

test('R43 public Saasuna conversation shows the supplied provisional visual', async ({ page, request }, testInfo) => {
  const manifestResponse = await request.get(`${PUBLIC_ORIGIN}/gameroad-version.json`);
  expect(manifestResponse.ok(), 'canonical public version manifest is reachable').toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.build_id, 'public evidence is bound to the currently deployed product build').toBe(EXPECTED_PUBLIC_BUILD);

  const visualResponse = await request.get(`${PUBLIC_ORIGIN}/ws?partnerOp=visual`);
  expect(visualResponse.ok(), 'Saasuna provisional visual endpoint is reachable').toBeTruthy();
  expect(visualResponse.headers()['content-type'] ?? '', 'visual endpoint serves an image').toMatch(/^image\/(jpeg|jpg)/i);
  expect((await visualResponse.body()).byteLength, 'visual endpoint returns non-empty image bytes').toBeGreaterThan(1000);

  const response = await page.goto(`${PUBLIC_ORIGIN}/`, { waitUntil: 'domcontentloaded' });
  expect(response, 'public GAMEROAD HTML response').not.toBeNull();
  expect(response.ok(), `public GAMEROAD HTML status ${response.status()}`).toBeTruthy();

  const home = page.locator('section[data-screen="home"]');
  await expect(home).toBeVisible();
  const partnerGo = page
    .locator('.codexPadPartner:visible, [data-home-target="characters"]:visible, [data-go="characters"]:visible')
    .first();
  await expect(partnerGo, 'visible Partner control').toBeVisible();
  await partnerGo.click();

  const characters = page.locator('section[data-screen="characters"]');
  await expect(characters).toBeVisible();
  const conversation = characters.locator('[data-gr-partner-conversation="1"]');
  await expect(conversation, 'direct Saasuna conversation surface').toBeVisible();
  await expect(conversation).toHaveAttribute('data-static-visual', '1');
  await expect(conversation).toHaveAttribute('data-animatable', '0');
  await expect(conversation).toHaveAttribute('data-character-production-owned-here', '0');
  await expect(conversation.getByText('サースナー', { exact: true })).toBeVisible();
  await expect(conversation.getByText('サースナーと話す', { exact: true })).toBeVisible();

  const image = conversation.locator('img.grPartnerStaticVisual');
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src', '/ws?partnerOp=visual');
  await expect.poll(async () => image.evaluate((node) => ({
    complete: node.complete,
    naturalWidth: node.naturalWidth,
    naturalHeight: node.naturalHeight,
  })), {
    message: 'the user-supplied Saasuna provisional image decodes in the public Partner scene',
    timeout: 10_000,
  }).toMatchObject({ complete: true, naturalWidth: expect.any(Number), naturalHeight: expect.any(Number) });
  const decoded = await image.evaluate((node) => ({ naturalWidth: node.naturalWidth, naturalHeight: node.naturalHeight }));
  expect(decoded.naturalWidth).toBeGreaterThan(0);
  expect(decoded.naturalHeight).toBeGreaterThan(0);

  await testInfo.attach(`${testInfo.project.name}-public-saasuna-provisional-visual.png`, {
    body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
    contentType: 'image/png',
  });
  testInfo.annotations.push({
    type: 'public-partner-visual',
    description: `build=${manifest.build_id}; visual=${decoded.naturalWidth}x${decoded.naturalHeight}; static-only contract visible`,
  });
});
