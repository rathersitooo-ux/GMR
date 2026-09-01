import { test, expect } from '@playwright/test';

const MAX_DEPTH = 5;
const MAX_SCREENS = 64;
const ROUTE_SELECTOR = '[data-go],[data-home-target],[data-root-go]';
const OPERABLE_SELECTOR = 'button,a[href],input,select,textarea,[role="button"],[tabindex]';

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

async function boot(page) {
  const response = await page.goto('/browser/GAMEROAD.html', { waitUntil: 'domcontentloaded' });
  expect(response).not.toBeNull();
  expect(response.ok(), `main HTML status ${response.status()}`).toBeTruthy();
  await page.waitForTimeout(700);
  await expect(page.locator('section[data-screen="home"]')).toBeVisible();
}

function targetFromDataset(dataset = {}) {
  return dataset.go || dataset.homeTarget || dataset.rootGo || null;
}

async function snapshotDom(page) {
  return page.evaluate(({ routeSelector, operableSelector }) => {
    const visible = (node) => {
      if (!(node instanceof Element)) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
    };
    const text = (node) => String(node?.innerText || node?.textContent || node?.getAttribute?.('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 180);
    const screens = [...document.querySelectorAll('section[data-screen]')].map((node) => ({
      screen: node.dataset.screen || '',
      id: node.id || null,
      active: node.classList.contains('active'),
      hidden: node.hasAttribute('hidden'),
      visible: visible(node),
    }));
    const routes = [...document.querySelectorAll(routeSelector)].map((node) => ({
      ownerScreen: node.closest('section[data-screen]')?.dataset?.screen || null,
      target: node.dataset.go || node.dataset.homeTarget || node.dataset.rootGo || null,
      visible: visible(node),
      tag: node.tagName.toLowerCase(),
      id: node.id || null,
      className: typeof node.className === 'string' ? node.className.slice(0, 180) : '',
      label: text(node),
      disabled: Boolean(node.disabled || node.getAttribute('aria-disabled') === 'true'),
    })).filter((entry) => entry.target);
    const operables = [...document.querySelectorAll(operableSelector)].filter(visible).map((node) => ({
      ownerScreen: node.closest('section[data-screen]')?.dataset?.screen || null,
      tag: node.tagName.toLowerCase(),
      id: node.id || null,
      role: node.getAttribute('role'),
      dataRole: node.dataset?.role || null,
      datasetKeys: Object.keys(node.dataset || {}).sort(),
      label: text(node),
      disabled: Boolean(node.disabled || node.getAttribute('aria-disabled') === 'true'),
    }));
    const mountedFeatureMarkers = [...document.querySelectorAll('[data-role],[data-rogue-action],[data-partner-shell-mounted],[data-home-shell-mounted]')].map((node) => ({
      ownerScreen: node.closest('section[data-screen]')?.dataset?.screen || null,
      tag: node.tagName.toLowerCase(),
      id: node.id || null,
      dataRole: node.dataset?.role || null,
      visible: visible(node),
      dataset: Object.fromEntries(Object.entries(node.dataset || {}).filter(([key]) => /role|mounted|action|target|mode|view/i.test(key)).slice(0, 12)),
      label: text(node),
    }));
    return { screens, routes, operables, mountedFeatureMarkers };
  }, { routeSelector: ROUTE_SELECTOR, operableSelector: OPERABLE_SELECTOR });
}

function selectorForEdge(current, target) {
  const escaped = String(target).replace(/"/g, '\\"');
  if (current === 'home') {
    return `[data-home-target="${escaped}"]:visible,[data-go="${escaped}"]:visible,[data-root-go="${escaped}"]:visible`;
  }
  return `section[data-screen="${current}"] [data-go="${escaped}"]:visible,section[data-screen="${current}"] [data-root-go="${escaped}"]:visible,section[data-screen="${current}"] [data-home-target="${escaped}"]:visible`;
}

async function replayPath(page, path) {
  await boot(page);
  let current = 'home';
  for (const target of path) {
    const control = page.locator(selectorForEdge(current, target)).first();
    if ((await control.count()) === 0 || !(await control.isVisible().catch(() => false))) {
      return { ok: false, current, target, reason: 'CONTROL_MISSING_DURING_REPLAY' };
    }
    if (await control.isDisabled().catch(() => false)) {
      return { ok: false, current, target, reason: 'CONTROL_DISABLED_DURING_REPLAY' };
    }
    try {
      await control.click({ timeout: 4_000 });
    } catch (error) {
      return { ok: false, current, target, reason: `CLICK_FAILED:${error?.name || 'Error'}` };
    }
    const surface = page.locator(`section[data-screen="${target}"]`).first();
    if ((await surface.count()) === 0) return { ok: false, current, target, reason: 'TARGET_SURFACE_MISSING' };
    if (!(await surface.isVisible().catch(() => false))) {
      await page.waitForTimeout(180);
      if (!(await surface.isVisible().catch(() => false))) return { ok: false, current, target, reason: 'TARGET_NOT_VISIBLE' };
    }
    current = target;
  }
  return { ok: true, current };
}

async function attachJson(testInfo, name, value) {
  await testInfo.attach(name, { body: Buffer.from(`${JSON.stringify(value, null, 2)}\n`), contentType: 'application/json' });
}

async function attachPng(page, testInfo, name) {
  const body = await page.screenshot({ fullPage: true, animations: 'disabled' });
  await testInfo.attach(name, { body, contentType: 'image/png' });
}

test('R71 inventories the human-reachable screen graph without product-state injection', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await boot(page);
  const bootDom = await snapshotDom(page);
  const declaredScreens = [...new Set(bootDom.screens.map((entry) => entry.screen).filter(Boolean))].sort();
  const queue = [{ screen: 'home', path: [], depth: 0 }];
  const visited = new Map();
  const edges = [];
  const brokenEdges = [];
  const replayFailures = [];

  while (queue.length > 0 && visited.size < MAX_SCREENS) {
    const node = queue.shift();
    if (visited.has(node.screen)) continue;
    const replay = await replayPath(page, node.path);
    if (!replay.ok) {
      replayFailures.push({ ...node, replay });
      continue;
    }

    const dom = await snapshotDom(page);
    const visibleRoutes = dom.routes.filter((route) => route.visible && route.ownerScreen === node.screen && !route.disabled);
    const visibleOperables = dom.operables.filter((control) => control.ownerScreen === node.screen);
    const visibleMarkers = dom.mountedFeatureMarkers.filter((marker) => marker.ownerScreen === node.screen && marker.visible);
    visited.set(node.screen, {
      screen: node.screen,
      path: node.path,
      depth: node.depth,
      visibleRoutes,
      visibleOperables,
      visibleMarkers,
    });

    if (node.depth >= MAX_DEPTH) continue;
    const uniqueTargets = [...new Set(visibleRoutes.map((route) => targetFromDataset({ go: route.target })).filter(Boolean))];
    for (const target of uniqueTargets) {
      const targetDeclared = declaredScreens.includes(target);
      const edge = { from: node.screen, to: target, path: [...node.path, target], targetDeclared };
      if (!targetDeclared) {
        brokenEdges.push({ ...edge, reason: 'TARGET_SURFACE_NOT_DECLARED' });
        continue;
      }
      edges.push(edge);
      if (!visited.has(target)) queue.push({ screen: target, path: edge.path, depth: node.depth + 1 });
    }
  }

  // Verify every discovered edge by a fresh human-only replay so a stale DOM route does not become reachability proof.
  const verifiedEdges = [];
  for (const edge of edges) {
    const replay = await replayPath(page, edge.path);
    if (replay.ok && replay.current === edge.to) verifiedEdges.push(edge);
    else brokenEdges.push({ ...edge, reason: replay.reason || 'REPLAY_FAILED', replay });
  }

  const reachableScreens = [...visited.keys()].sort();
  const declaredButUnreached = declaredScreens.filter((screen) => !visited.has(screen));
  const routeTargets = [...new Set(bootDom.routes.map((route) => route.target).filter(Boolean))].sort();
  const undeclaredRouteTargets = routeTargets.filter((target) => !declaredScreens.includes(target));
  const storageMarkers = bootDom.mountedFeatureMarkers.filter((marker) => marker.dataRole === 'deck-storage-button');

  const census = {
    project: testInfo.project.name,
    declaredScreens,
    reachableScreens,
    declaredButUnreached,
    verifiedEdges,
    brokenEdges,
    replayFailures,
    bootRoutes: bootDom.routes,
    bootMountedFeatureMarkers: bootDom.mountedFeatureMarkers,
    undeclaredRouteTargets,
    specialChecks: {
      deckStorageButtonCountAtBoot: storageMarkers.length,
      deckStorageButtonVisibleAtBoot: storageMarkers.filter((marker) => marker.visible).length,
    },
    limits: { maxDepth: MAX_DEPTH, maxScreens: MAX_SCREENS },
  };

  await attachJson(testInfo, `${testInfo.project.name}-human-reachability-census.json`, census);
  await replayPath(page, []);
  await attachPng(page, testInfo, `${testInfo.project.name}-human-reachability-home.png`);

  testInfo.annotations.push({
    type: 'human-reachability-census',
    description: `declared=${declaredScreens.length}; reachable=${reachableScreens.length}; unreached=${declaredButUnreached.length}; verifiedEdges=${verifiedEdges.length}; brokenEdges=${brokenEdges.length}; deckStorageBoot=${storageMarkers.length}`,
  });

  expect(reachableScreens).toContain('home');
  expect(verifiedEdges.length, 'at least one visible human navigation edge is verified').toBeGreaterThan(0);
});
