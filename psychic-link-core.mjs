// サイキックリンクの試作：3枚のサイキック・クリーチャー → 1体のサイキック・スーパー・クリーチャー。
// デュエマのカード画像は仮の絵（browser/assets/placeholder/dm-psychic-link/README.md）。
// あとで GAMEROAD 自分の絵に差し替える。
//
// 形はミルフィーカードと同じ「3 → 1」：3枚がそろうと完成絵1枚へ表示を切り替え、
// 内部は元の3枚を保持する。完成絵を第4の所持カードにしない。
// （裁定 DECISION-003「統合二表示・完成絵一枚方式」と同じ考え）
//
// 演出の流れは、デュエプレ研究所#38の 19:35〜19:44 で見たもの：
// - 3枚が並び、間に青白い稲妻
// - 合体後カードの全画面表示（暗い緑の背景、緑の稲妻の縁）
// - 白い縦の光の柱（ピーク約1秒）
// - 盤面に合体後カード1体

export const PSYCHIC_LINK_IMAGE_BASE = './assets/placeholder/dm-psychic-link/';

export const PSYCHIC_LINK_COMPONENTS = [
  {
    id: 'gaial-kaiser',
    name: 'ガイアール・カイザー',
    cost: 8,
    power: 6000,
    powerLabel: '6000',
    image: 'gaial-kaiser.jpg',
  },
  {
    id: 'dragonic-pippy',
    name: 'ドラゴニック・ピッピー',
    cost: 3,
    power: 2000,
    powerLabel: '2000+',
    image: 'dragonic-pippy.jpg',
  },
  {
    id: 'boost-grenoh',
    name: 'ブーストグレンオー',
    cost: 5,
    power: 3000,
    powerLabel: '3000',
    image: 'boost-grenoh.jpg',
  },
];

export const PSYCHIC_LINK_SUPER = {
  id: 'gaial-oudragon',
  name: '激竜王ガイアール・オウドラゴン',
  cost: 24,
  power: 25000,
  powerLabel: '25000',
  image: 'gaial-oudragon.png',
  componentIds: ['gaial-kaiser', 'dragonic-pippy', 'boost-grenoh'],
};

// 演出の時間割（ミリ秒）。白い光のピークは 1400〜2200ms の約0.8秒。
export const PSYCHIC_LINK_TIMELINE = [
  { atMs: 0, phase: 'components-lightning' },
  { atMs: 600, phase: 'super-fullscreen' },
  { atMs: 1400, phase: 'white-flash' },
  { atMs: 2200, phase: 'linked' },
];

export const PSYCHIC_LINK_TOTAL_MS = 2600;

export function createPsychicLinkState(componentIds = PSYCHIC_LINK_COMPONENTS.map((c) => c.id)) {
  return {
    status: 'components',
    componentIds: [...componentIds],
    superId: null,
  };
}

export function findComponent(componentId) {
  return PSYCHIC_LINK_COMPONENTS.find((c) => c.id === componentId) || null;
}

export function hasAllComponents(state) {
  return PSYCHIC_LINK_SUPER.componentIds.every((id) => state.componentIds.includes(id));
}

export function canLink(state) {
  return state.status === 'components' && hasAllComponents(state);
}

export function canUnlink(state) {
  return state.status === 'linked' && state.superId === PSYCHIC_LINK_SUPER.id;
}

// リンクする。3枚は内部に残したまま、表示だけ合体後1枚へ切り替える。
export function applyLink(state) {
  if (!canLink(state)) return state;
  return { ...state, status: 'linked', superId: PSYCHIC_LINK_SUPER.id };
}

// リンク解除。合体後1枚から、元の3枚へ戻る。
export function applyUnlink(state) {
  if (!canUnlink(state)) return state;
  return { ...state, status: 'components', superId: null };
}

export function describeBoard(state) {
  if (state.status === 'linked') {
    return { shown: [PSYCHIC_LINK_SUPER], kept: PSYCHIC_LINK_SUPER.componentIds };
  }
  return {
    shown: state.componentIds.map(findComponent).filter(Boolean),
    kept: [...state.componentIds],
  };
}
