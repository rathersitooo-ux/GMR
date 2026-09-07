from pathlib import Path
import hashlib

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'browser/cards-deck-presentation.mjs'
TEST = ROOT / 'tests/cards-deck-presentation.test.mjs'
EXPECTED_MODULE = '85924a51dc342458ae156cb32b516551766a6dfe'
EXPECTED_TEST = '0f979566de6a2f9fd228895cc369bca6eafebbf1'

def git_blob_sha(data: bytes) -> str:
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()

module_bytes = MODULE.read_bytes()
test_bytes = TEST.read_bytes()
assert git_blob_sha(module_bytes) == EXPECTED_MODULE, (git_blob_sha(module_bytes), EXPECTED_MODULE)
assert git_blob_sha(test_bytes) == EXPECTED_TEST, (git_blob_sha(test_bytes), EXPECTED_TEST)

module = module_bytes.decode('utf-8')
old_tail = '''function autoInstallFanart(doc, win) {
  const install = () => installFanartLocalSkinCards({ document: doc, window: win, indexedDB: win?.indexedDB });
  if (doc?.readyState === 'loading') doc.addEventListener?.('DOMContentLoaded', install, { once: true }); else install();
}

if (typeof document !== 'undefined') autoInstallFanart(document, globalThis.window);'''
assert module.count(old_tail) == 1

new_tail = r'''const fanartPublicBattleProjectionInstallations = new WeakMap();

export const FANART_PUBLIC_BATTLE_CARD_CONTRACT = Object.freeze({
  schema: 'gameroad.fanart-public-battle-card.v1',
  source: 'viewer-local-cardId-only',
  publicCardsOnly: true,
  allOwnersSameViewerProjection: true,
  opponentSpecificToggle: false,
  secondStorage: false,
  networkSync: false,
  gameplayMutation: false,
  hiddenCardLookup: false,
});

export function installFanartPublicBattleCardProjection({
  document: doc = globalThis.document,
  window: win = globalThis.window,
  global: runtimeGlobal = globalThis,
  indexedDB: idb = globalThis.indexedDB,
  readLocalSkin = null,
} = {}) {
  const renderer = runtimeGlobal?.renderBattlePlayerCards;
  if (!doc?.createElement || typeof renderer !== 'function' || !win?.URL?.createObjectURL) {
    return Object.freeze({ installed: false, destroy() {} });
  }
  const existing = fanartPublicBattleProjectionInstallations.get(runtimeGlobal);
  if (existing) return existing;

  if (!doc.getElementById?.('gameroad-fanart-public-battle-card-style')) {
    const style = doc.createElement('style');
    style.id = 'gameroad-fanart-public-battle-card-style';
    style.textContent = '.resolutionCard[data-fanart-local-public-card="1"]{position:relative!important;overflow:hidden!important}.resolutionCard>[data-role="fanart-public-battle-card-art"]{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit;pointer-events:none;z-index:1}.resolutionCard[data-fanart-local-public-card="1"]>b{position:relative!important;z-index:2!important;padding:1px 2px!important;border-radius:3px!important;background:rgba(0,0,0,.66)!important;color:#fff!important;text-shadow:0 1px 2px #000!important}';
    (doc.head || doc.documentElement)?.appendChild?.(style);
  }

  const urls = new Set();
  let generation = 0;
  let destroyed = false;
  const revokeAll = () => {
    for (const url of urls) win.URL.revokeObjectURL?.(url);
    urls.clear();
  };
  const read = typeof readLocalSkin === 'function'
    ? readLocalSkin
    : async (cardId) => fanartReadSkin(idb, cardId);

  const project = async (root, players, ticket) => {
    const playerNodes = [...(root?.querySelectorAll?.('.resolutionPlayer') ?? [])];
    for (let playerIndex = 0; playerIndex < players.length; playerIndex += 1) {
      const cards = Array.isArray(players[playerIndex]?.cards) ? players[playerIndex].cards : [];
      if (!cards.length) continue;
      const cardNodes = [...(playerNodes[playerIndex]?.querySelectorAll?.('.resolutionCard') ?? [])];
      for (let cardIndex = 0; cardIndex < cards.length; cardIndex += 1) {
        const card = cards[cardIndex];
        const node = cardNodes[cardIndex];
        const cardId = normalizeLocalSkinCardId(String(card?.cardId ?? ''));
        if (!node || !cardId) continue;
        node.dataset.cardId = cardId;
        let record = null;
        try { record = await read(cardId); } catch {}
        if (destroyed || ticket !== generation) return;
        const blob = record?.asset?.blob ?? record?.blob ?? null;
        if (!blob) continue;
        const url = win.URL.createObjectURL(blob);
        if (destroyed || ticket !== generation) {
          win.URL.revokeObjectURL?.(url);
          return;
        }
        urls.add(url);
        const image = doc.createElement('img');
        image.dataset.role = 'fanart-public-battle-card-art';
        image.alt = '';
        image.src = url;
        image.setAttribute?.('aria-hidden', 'true');
        node.dataset.fanartLocalPublicCard = '1';
        node.dataset.artSource = 'viewer_local';
        node.setAttribute?.('aria-label', `${String(card?.label ?? cardId)} ${String(card?.value ?? '')}`.trim());
        node.appendChild?.(image);
      }
    }
  };

  function wrappedRenderBattlePlayerCards(root, players = [], laneGains = [], presentationEvents = []) {
    generation += 1;
    const ticket = generation;
    revokeAll();
    const result = renderer.apply(this, arguments);
    void project(root, Array.isArray(players) ? players : [], ticket);
    return result;
  }

  runtimeGlobal.renderBattlePlayerCards = wrappedRenderBattlePlayerCards;
  const installation = Object.freeze({
    installed: true,
    contract: FANART_PUBLIC_BATTLE_CARD_CONTRACT,
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      generation += 1;
      revokeAll();
      if (runtimeGlobal.renderBattlePlayerCards === wrappedRenderBattlePlayerCards) {
        runtimeGlobal.renderBattlePlayerCards = renderer;
      }
      fanartPublicBattleProjectionInstallations.delete(runtimeGlobal);
      return true;
    },
  });
  fanartPublicBattleProjectionInstallations.set(runtimeGlobal, installation);
  return installation;
}

function autoInstallFanart(doc, win) {
  const install = () => {
    installFanartLocalSkinCards({ document: doc, window: win, indexedDB: win?.indexedDB });
    installFanartPublicBattleCardProjection({ document: doc, window: win, global: globalThis, indexedDB: win?.indexedDB });
  };
  if (doc?.readyState === 'loading') doc.addEventListener?.('DOMContentLoaded', install, { once: true }); else install();
}

if (typeof document !== 'undefined') autoInstallFanart(document, globalThis.window);'''
module = module.replace(old_tail, new_tail)
MODULE.write_text(module, encoding='utf-8')

append_test = r'''

test('viewer-local card art projects to every already-public Battle card with the same cardId', async () => {
  const mod = await import('../browser/cards-deck-presentation.mjs');
  const makeNode = () => ({
    dataset: {},
    children: [],
    attributes: new Map(),
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
    getAttribute(name) { return this.attributes.get(name) ?? null; },
  });
  const doc = {
    head: makeNode(),
    createElement(tag) { const node = makeNode(); node.tagName = String(tag).toUpperCase(); node.id = ''; node.src = ''; node.alt = ''; return node; },
    getElementById() { return null; },
  };
  const createdUrls = [];
  const revokedUrls = [];
  const win = {
    URL: {
      createObjectURL(blob) { const url = `blob:fanart-${createdUrls.length + 1}`; createdUrls.push([url, blob]); return url; },
      revokeObjectURL(url) { revokedUrls.push(url); },
    },
  };
  const runtimeGlobal = { renderBattlePlayerCards(root, players) {
    root.players = players.map((player) => {
      const cardNodes = (player.cards ?? []).map(() => makeNode());
      return { cardNodes, querySelectorAll: (selector) => selector === '.resolutionCard' ? cardNodes : [] };
    });
    root.querySelectorAll = (selector) => selector === '.resolutionPlayer' ? root.players : [];
    return 'legacy-render-result';
  } };
  const blob = { local: true };
  const installation = mod.installFanartPublicBattleCardProjection({
    document: doc,
    window: win,
    global: runtimeGlobal,
    indexedDB: null,
    readLocalSkin: async (cardId) => cardId === 'C1' ? { asset: { blob } } : null,
  });
  assert.equal(installation.installed, true);
  assert.equal(installation.contract.publicCardsOnly, true);
  assert.equal(installation.contract.allOwnersSameViewerProjection, true);
  assert.equal(installation.contract.opponentSpecificToggle, false);
  assert.equal(installation.contract.networkSync, false);
  assert.equal(installation.contract.hiddenCardLookup, false);

  const root = {};
  const players = [
    { id: 'SELF', cards: [{ cardId: 'C1', label: 'CARD ONE', value: 4 }] },
    { id: 'OPPONENT', cards: [{ cardId: 'C1', label: 'CARD ONE', value: 4 }, { cardId: 'C2', label: 'CARD TWO', value: 7 }] },
  ];
  assert.equal(runtimeGlobal.renderBattlePlayerCards(root, players, [], []), 'legacy-render-result');
  await new Promise((resolve) => setTimeout(resolve, 0));

  const selfC1 = root.players[0].cardNodes[0];
  const opponentC1 = root.players[1].cardNodes[0];
  const opponentC2 = root.players[1].cardNodes[1];
  for (const node of [selfC1, opponentC1]) {
    assert.equal(node.dataset.cardId, 'C1');
    assert.equal(node.dataset.fanartLocalPublicCard, '1');
    assert.equal(node.dataset.artSource, 'viewer_local');
    assert.equal(node.children.length, 1);
    assert.equal(node.children[0].dataset.role, 'fanart-public-battle-card-art');
    assert.equal(node.children[0].getAttribute('aria-hidden'), 'true');
  }
  assert.equal(opponentC2.dataset.cardId, 'C2');
  assert.equal(opponentC2.dataset.artSource, undefined);
  assert.equal(opponentC2.children.length, 0);
  assert.equal(createdUrls.length, 2);
  assert.equal(installation.destroy(), true);
  assert.equal(revokedUrls.length, 2);
});

test('public Battle local-art projection wraps only the existing public renderer and has no transport or opponent-state path', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../browser/cards-deck-presentation.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('export function installFanartPublicBattleCardProjection');
  const end = source.indexOf('function autoInstallFanart');
  const slice = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(slice.includes('runtimeGlobal?.renderBattlePlayerCards'));
  assert.ok(slice.includes("node.dataset.cardId = cardId"));
  assert.ok(slice.includes("record?.asset?.blob"));
  assert.equal(slice.includes('state.match'), false);
  assert.equal(slice.includes('opponentEnabled'), false);
  assert.equal(slice.includes('opponentEquippedSkin'), false);
  for (const forbidden of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'localStorage', 'sessionStorage']) {
    assert.equal(slice.includes(forbidden), false, `forbidden transport/storage path: ${forbidden}`);
  }
});
'''

test = test_bytes.decode('utf-8')
assert 'viewer-local card art projects to every already-public Battle card with the same cardId' not in test
test = test.rstrip() + append_test + '\n'
TEST.write_text(test, encoding='utf-8')

print('patched', MODULE, TEST)
