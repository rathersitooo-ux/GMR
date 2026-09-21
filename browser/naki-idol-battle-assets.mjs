const ASSET_ROOT = './assets/partners/naki-idol/';

export const NAKI_IDOL_ASSET_SCHEMA = 'gameroad.partner.naki-idol-assets.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function asset(fileName, label, extra = {}) {
  return deepFreeze({
    fileName,
    label,
    src: new URL(`${ASSET_ROOT}${fileName}`, import.meta.url).href,
    ...extra
  });
}

export const NAKI_IDOL_BATTLE_FRAMES = deepFreeze({
  stance: asset('battle/primary-v2/01-stance.png', '通常の構え', { phase: 'stance' }),
  anticipation: asset('battle/primary-v2/02-song-anticipation.png', '歌唱前の溜め', { phase: 'anticipation' }),
  charge: asset('battle/primary-v2/03-song-charge.png', '歌唱チャージ', { phase: 'charge' }),
  release: asset('battle/primary-v2/04-song-release.png', 'マイクからの歌唱解放', { phase: 'release' }),
  hitReaction: asset('battle/primary-v2/05-hit-reaction.png', '被弾反応', { phase: 'reaction' }),
  return: asset('battle/primary-v2/06-return.png', '通常姿勢への復帰', { phase: 'return' })
});

const adviceFiles = [
  ['HAPPY_WAVE', 'advice/01-happy-wave.png', '明るい手振り'],
  ['CURIOUS_CONFUSED', 'advice/02-curious-confused.png', '首を傾げる疑問'],
  ['SHH', 'advice/03-shh.png', '秘密の合図'],
  ['GUIDE_PRESENT', 'advice/04-guide-present.png', '案内・提案'],
  ['IDLE_GENTLE', 'advice/05-idle-gentle.png', '通常の穏やかな表情'],
  ['SURPRISED', 'advice/06-surprised.png', '驚き'],
  ['TOUCH_CRY', 'advice/07-touch-cry.png', '感動・涙'],
  ['HAPPY_SMILE', 'advice/08-happy-smile.png', '嬉しい笑顔'],
  ['SAD_DOWNCAST', 'advice/09-sad-downcast.png', '落ち込み']
];

export const NAKI_IDOL_ADVICE_ASSETS = deepFreeze(Object.fromEntries(
  adviceFiles.map(([key, fileName, label]) => [key, asset(fileName, label, { expression: key })])
));

export const NAKI_IDOL_HEART_VFX = deepFreeze([
  asset('vfx/heart-primary-v2/01-heart-slash-diagonal.png', 'ハート斬撃・斜め', { primary: true, postImpactOnly: false }),
  asset('vfx/heart-primary-v2/02-heart-slash-twin.png', 'ハート斬撃・双線', { primary: true, postImpactOnly: false }),
  asset('vfx/heart-primary-v2/03-heart-ribbon-spiral.png', 'ハートリボン回転', { primary: true, postImpactOnly: false }),
  asset('vfx/heart-primary-v2/04-heart-impact-burst.png', 'ハート命中バースト', { primary: true, postImpactOnly: false }),
  asset('vfx/heart-primary-v2/05-heart-shards.png', 'ハートの欠片', { primary: true, postImpactOnly: false }),
  asset('vfx/heart-primary-v2/06-heart-hit-ring.png', 'ハート命中リング', { primary: true, postImpactOnly: false })
]);

// 月／三日月はキャラクターの主モーションには使わず、斬撃または命中後にだけ低頻度で許可する。
export const NAKI_IDOL_POST_IMPACT_VFX = deepFreeze([
  asset('vfx/01-crescent-slash.png', '三日月斬撃（低頻度）', { primary: false, postImpactOnly: true, weight: 1 }),
  asset('vfx/02-moon-mote-ring.png', '月光モートリング（低頻度）', { primary: false, postImpactOnly: true, weight: 1 }),
  asset('vfx/06-moon-heart-afterglow.png', '月とハートの残光（低頻度）', { primary: false, postImpactOnly: true, weight: 1 })
]);

const hashSeed = (seed) => {
  const input = String(seed ?? 0);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export function deterministicIndex(seed, length) {
  if (!Number.isFinite(length) || length <= 0) return 0;
  return hashSeed(seed) % Math.floor(length);
}

export function resolveNakiVfx({ phase, seed = 0, role = 'attacker' } = {}) {
  const normalizedPhase = String(phase || '').toLowerCase();
  if (normalizedPhase === 'release') {
    const slashPool = NAKI_IDOL_HEART_VFX.filter((item) => item.fileName.includes('slash') || item.fileName.includes('spiral'));
    return slashPool[deterministicIndex(`${seed}:release`, slashPool.length)] || NAKI_IDOL_HEART_VFX[0];
  }
  if (normalizedPhase === 'impact') {
    const impactPool = NAKI_IDOL_HEART_VFX.filter((item) => item.fileName.includes('impact') || item.fileName.includes('ring'));
    return impactPool[deterministicIndex(`${seed}:${role}:impact`, impactPool.length)] || NAKI_IDOL_HEART_VFX[3];
  }
  if (normalizedPhase === 'reaction' && deterministicIndex(`${seed}:reaction`, 7) === 0) {
    return NAKI_IDOL_POST_IMPACT_VFX[deterministicIndex(`${seed}:post-impact`, NAKI_IDOL_POST_IMPACT_VFX.length)];
  }
  return null;
}

export function resolveNakiAdviceAsset(expression = 'IDLE_GENTLE') {
  return NAKI_IDOL_ADVICE_ASSETS[expression] || NAKI_IDOL_ADVICE_ASSETS.IDLE_GENTLE;
}

