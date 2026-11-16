// 輸入カード15枚（DCG_CAND_*）の仮イラスト接続。
// 絵は全部「借り物の仮」で、正式絵ではない。置き場と出どころは
// browser/assets/provisional-art/candidate-cards/README.md。
// カードデータ側には artId だけを持ち、実ファイルとの対応は
// card-art-registry-core.mjs の registry 経由で引く（ゼ・クウの正式絵とは別経路のまま。
// あちらは正式絵で置き場も公開パスも違うため、仮棚へは寄せない）。
import { artForCard, createArtRegistry, registerArt } from './card-art-registry-core.mjs';

export const CANDIDATE_CARD_ART_ENTRIES = Object.freeze([
  { cardId: 'DCG_CAND_ONIMARU', artId: 'CANDART_ONIMARU', file: 'provisional-art/candidate-cards/dcg-cand-onimaru.jpg', form: 'card', cardName: '鬼丸「覇」', source: 'Duel Masters Wiki (Fandom) Dm26ex3-1' },
  { cardId: 'DCG_CAND_DOGIRAGON', artId: 'CANDART_DOGIRAGON', file: 'provisional-art/candidate-cards/dcg-cand-dogiragon.jpg', form: 'card', cardName: 'ドギラゴンバスター', source: 'Duel Masters Wiki (Fandom) Dm26ex4' },
  { cardId: 'DCG_CAND_INFERNO_GATE', artId: 'CANDART_INFERNO_GATE', file: 'provisional-art/candidate-cards/dcg-cand-inferno-gate.jpg', form: 'card', cardName: 'インフェルノ・ゲート', source: 'Duel Masters Wiki (Fandom) Dm19-27' },
  { cardId: 'DCG_CAND_HOGAN_BLASTER', artId: 'CANDART_HOGAN_BLASTER', file: 'provisional-art/candidate-cards/dcg-cand-hogan-blaster.jpg', form: 'card', cardName: 'ホーガン・ブラスター', source: 'Duel Masters Wiki (Fandom) Dm26ex5-dp20' },
  { cardId: 'DCG_CAND_TENSEI_PROGRAM', artId: 'CANDART_TENSEI_PROGRAM', file: 'provisional-art/candidate-cards/dcg-cand-tensei-program.jpg', form: 'card', cardName: '転生プログラム', source: 'Duel Masters Wiki (Fandom) Transmogrify' },
  { cardId: 'DCG_CAND_KIRIKO', artId: 'CANDART_KIRIKO', file: 'provisional-art/candidate-cards/dcg-cand-kiriko.jpg', form: 'card', cardName: 'エンペラー・キリコ', source: 'Duel Masters Wiki (Fandom) Dmex17' },
  { cardId: 'DCG_CAND_BOLBALZAK', artId: 'CANDART_BOLBALZAK', file: 'provisional-art/candidate-cards/dcg-cand-bolbalzak.jpg', form: 'card', cardName: '無双竜機ボルバルザーク', source: 'デュエマ公式カード検索 dm10-009' },
  { cardId: 'DCG_CAND_CYBER_BRAIN', artId: 'CANDART_CYBER_BRAIN', file: 'provisional-art/candidate-cards/dcg-cand-cyber-brain.jpg', form: 'card', cardName: 'サイバー・ブレイン', source: 'Duel Masters Wiki (Fandom) Dm26rp1-t5' },
  { cardId: 'DCG_CAND_PERFECT_GALAXY', artId: 'CANDART_PERFECT_GALAXY', file: 'provisional-art/candidate-cards/dcg-cand-perfect-galaxy.jpg', form: 'card', cardName: '不滅の精霊パーフェクト・ギャラクシー', source: 'Duel Masters Wiki (Fandom) Dmbd18-se6' },
  { cardId: 'DCG_CAND_HARPIE', artId: 'CANDART_HARPIE', file: 'provisional-art/candidate-cards/dcg-cand-harpie.jpg', form: 'fullart', cardName: 'ハーピィの羽根帚', source: 'YGOPRODeck art_crop 18144507' },
  { cardId: 'DCG_CAND_ASH_BLOSSOM', artId: 'CANDART_ASH_BLOSSOM', file: 'provisional-art/candidate-cards/dcg-cand-ash-blossom.jpg', form: 'fullart', cardName: '灰流うらら', source: 'YGOPRODeck art_crop 14558127' },
  { cardId: 'DCG_CAND_MAXX_C', artId: 'CANDART_MAXX_C', file: 'provisional-art/candidate-cards/dcg-cand-maxx-c.jpg', form: 'fullart', cardName: '増殖するG', source: 'YGOPRODeck art_crop 23434538' },
  { cardId: 'DCG_CAND_BLACK_LOTUS', artId: 'CANDART_BLACK_LOTUS', file: 'provisional-art/candidate-cards/dcg-cand-black-lotus.jpg', form: 'fullart', cardName: 'ブラック・ロータス', source: 'Scryfall art_crop' },
  { cardId: 'DCG_CAND_SOL_RING', artId: 'CANDART_SOL_RING', file: 'provisional-art/candidate-cards/dcg-cand-sol-ring.jpg', form: 'fullart', cardName: 'ソル・リング', source: 'Scryfall art_crop' },
  { cardId: 'DCG_CAND_LIGHTNING', artId: 'CANDART_LIGHTNING', file: 'provisional-art/candidate-cards/dcg-cand-lightning.jpg', form: 'fullart', cardName: '稲妻', source: 'Scryfall art_crop (Lightning Bolt)' },
]);

export function createCandidateCardArtRegistry() {
  const registry = createArtRegistry();
  for (const entry of CANDIDATE_CARD_ART_ENTRIES) registerArt(registry, entry);
  return registry;
}

export const CANDIDATE_CARD_ART_REGISTRY = createCandidateCardArtRegistry();

const byCardId = new Map(CANDIDATE_CARD_ART_ENTRIES.map((e) => [e.cardId, e]));

export function candidateArtForCard(card) {
  if (!card) return null;
  const entry = artForCard(CANDIDATE_CARD_ART_REGISTRY, card)
    || (card.id ? byCardId.get(card.id) || null : null);
  return entry;
}

function assetUrlFor(entry, moduleUrl) {
  // ローカル（browser/ 配下）と公開パッケージ（ルート直下）で同じ相対形が効くよう、
  // このモジュール自身の URL から ./assets/ 基準で解決する。
  return new URL(`./assets/${entry.file}`, moduleUrl).href;
}

const installations = new WeakMap();

function nodeCardId(node) {
  return String(node?.dataset?.id ?? node?.dataset?.cardId ?? '').trim();
}

function isSupportedHost(node) {
  if (!node?.matches) return false;
  return node.matches('#collectionGrid [data-id], #deckSlots [data-id], #exDeckSlots [data-id], .resolutionCard[data-card-id], .handCard[data-card-id]');
}

export function installCandidateCardArt({
  document: doc = globalThis.document,
  window: win = globalThis.window,
  moduleUrl = import.meta.url,
} = {}) {
  if (!doc?.querySelectorAll || !doc?.createElement) {
    return Object.freeze({ installed: false, refresh() {}, destroy() {} });
  }
  const prior = installations.get(doc);
  if (prior) return prior;

  const styleId = 'gameroad-candidate-card-art-style';
  let style = doc.getElementById?.(styleId) ?? null;
  let ownsStyle = false;
  if (!style) {
    style = doc.createElement('style');
    style.id = styleId;
    const rules = [
      '[data-candidate-card-art]{position:relative!important;overflow:hidden!important;isolation:isolate}',
      '[data-candidate-card-art]::before{content:"";position:absolute;inset:0;background-size:cover;background-position:center;background-repeat:no-repeat;pointer-events:none;z-index:0}',
      '[data-candidate-card-art]>*{position:relative;z-index:1}',
      '.resolutionCard[data-candidate-card-art]>b{position:relative!important;z-index:2!important;padding:1px 2px!important;border-radius:3px!important;background:rgba(0,0,0,.66)!important;color:#fff!important;text-shadow:0 1px 2px #000!important}',
    ];
    for (const entry of CANDIDATE_CARD_ART_ENTRIES) {
      rules.push(`[data-candidate-card-art="${entry.cardId}"]::before{background-image:url("${assetUrlFor(entry, moduleUrl)}")}`);
    }
    style.textContent = rules.join('');
    (doc.head || doc.documentElement)?.appendChild?.(style);
    ownsStyle = true;
  }

  let destroyed = false;
  const refresh = () => {
    if (destroyed) return;
    const marked = [...doc.querySelectorAll('[data-candidate-card-art]')];
    for (const node of marked) {
      if (!isSupportedHost(node) || !byCardId.has(nodeCardId(node))) {
        node.removeAttribute?.('data-candidate-card-art');
        node.removeAttribute?.('data-candidate-art-source');
      }
    }
    const hosts = [...doc.querySelectorAll(
      '#collectionGrid [data-id], #deckSlots [data-id], #exDeckSlots [data-id], .resolutionCard[data-card-id], .handCard[data-card-id]',
    )];
    for (const node of hosts) {
      const id = nodeCardId(node);
      if (!byCardId.has(id)) continue;
      node.dataset.candidateCardArt = id;
      node.dataset.candidateArtSource = 'provisional-borrowed';
    }
  };

  const Observer = win?.MutationObserver ?? globalThis.MutationObserver;
  const observer = typeof Observer === 'function' ? new Observer(() => refresh()) : null;
  observer?.observe?.(doc.documentElement || doc, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['data-id', 'data-card-id'],
  });
  refresh();

  const installation = Object.freeze({
    installed: true,
    count: CANDIDATE_CARD_ART_ENTRIES.length,
    refresh,
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      observer?.disconnect?.();
      for (const node of [...doc.querySelectorAll('[data-candidate-card-art]')]) {
        node.removeAttribute?.('data-candidate-card-art');
        node.removeAttribute?.('data-candidate-art-source');
      }
      if (ownsStyle) style?.remove?.();
      installations.delete(doc);
      return true;
    },
  });
  installations.set(doc, installation);
  return installation;
}

function autoInstall() {
  const doc = globalThis.document;
  if (!doc?.querySelectorAll) return;
  // カードデータ側にも artId を行き渡らせる（読み取り側が registry で引ける形にする）
  try {
    const data = globalThis.window?.__CARD_DATA__ || globalThis.__CARD_DATA__;
    if (Array.isArray(data)) {
      for (const card of data) {
        const entry = card?.id ? byCardId.get(card.id) : null;
        if (entry && !card.artId) card.artId = entry.artId;
      }
    }
  } catch { /* データが無い画面では表示だけ */ }
  const run = () => {
    const inst = installCandidateCardArt({ document: doc, window: globalThis.window });
    try { globalThis.window.__GAMEROAD_CANDIDATE_CARD_ART__ = { installed: inst.installed, count: CANDIDATE_CARD_ART_ENTRIES.length }; } catch {}
  };
  if (doc.readyState === 'loading') doc.addEventListener?.('DOMContentLoaded', run, { once: true });
  else run();
}

autoInstall();
