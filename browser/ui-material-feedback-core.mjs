const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value)));

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
};

export const MATERIAL_FEEDBACK_MATERIALS = Object.freeze({
  GUMMY: 'gummy',
  DROPLET: 'droplet',
  HARD: 'hard',
  FLAT: 'flat',
});

export const MATERIAL_FEEDBACK_PHASES = Object.freeze({
  NORMAL: 'normal',
  FOCUSED: 'focused',
  PRESSED: 'pressed',
  HOLD: 'hold',
  CANCELLED: 'cancelled',
  COMMITTED: 'committed',
  SETTLED: 'settled',
  DISABLED: 'disabled',
});

const BASE = Object.freeze({
  scaleX: 1,
  scaleY: 1,
  translateXEm: 0,
  translateYEm: 0,
  rotateDeg: 0,
  shadowCompression: 0,
  rimTension: 0,
  refraction: 0,
  meniscus: 0,
  specularLag: 0,
  wobble: 0,
  overshoot: 0,
  durationMs: 0,
  easing: 'linear',
  particleStrength: 0,
});

const PROFILES = deepFreeze({
  gummy: {
    normal: {},
    focused: { rimTension: 0.16, durationMs: 90, easing: 'ease-out' },
    pressed: { scaleX: 1.045, scaleY: 0.91, translateYEm: 0.045, shadowCompression: 0.72, rimTension: 0.68, specularLag: 0.18, durationMs: 70, easing: 'cubic-bezier(.2,.8,.25,1)' },
    hold: { scaleX: 1.055, scaleY: 0.895, translateYEm: 0.052, shadowCompression: 0.8, rimTension: 0.82, specularLag: 0.24, wobble: 0.08, durationMs: 110, easing: 'ease-out' },
    cancelled: { scaleX: 0.992, scaleY: 1.018, translateYEm: -0.008, shadowCompression: 0.08, rimTension: 0.25, specularLag: 0.08, wobble: 0.18, overshoot: 0.28, durationMs: 170, easing: 'cubic-bezier(.2,.9,.25,1.2)' },
    committed: { scaleX: 0.98, scaleY: 1.04, translateYEm: -0.018, shadowCompression: 0.05, rimTension: 0.34, specularLag: 0.12, wobble: 0.42, overshoot: 0.55, durationMs: 210, easing: 'cubic-bezier(.15,.9,.25,1.25)' },
    settled: { rimTension: 0.08, durationMs: 130, easing: 'ease-out' },
    disabled: { shadowCompression: 0.12, rimTension: 0.03 },
  },
  droplet: {
    normal: { refraction: 0.22, meniscus: 0.28 },
    focused: { refraction: 0.27, meniscus: 0.34, rimTension: 0.12, durationMs: 100, easing: 'ease-out' },
    pressed: { scaleX: 1.085, scaleY: 0.855, translateYEm: 0.055, shadowCompression: 0.78, rimTension: 0.76, refraction: 0.5, meniscus: 0.74, specularLag: 0.36, wobble: 0.06, durationMs: 85, easing: 'cubic-bezier(.18,.82,.22,1)' },
    hold: { scaleX: 1.1, scaleY: 0.84, translateYEm: 0.06, shadowCompression: 0.84, rimTension: 0.86, refraction: 0.56, meniscus: 0.82, specularLag: 0.46, wobble: 0.16, durationMs: 130, easing: 'ease-out' },
    cancelled: { scaleX: 0.985, scaleY: 1.025, translateYEm: -0.012, shadowCompression: 0.08, rimTension: 0.38, refraction: 0.31, meniscus: 0.42, specularLag: 0.25, wobble: 0.38, overshoot: 0.36, durationMs: 210, easing: 'cubic-bezier(.17,.9,.22,1.22)' },
    committed: { scaleX: 0.955, scaleY: 1.085, translateYEm: -0.028, shadowCompression: 0.03, rimTension: 0.48, refraction: 0.4, meniscus: 0.5, specularLag: 0.34, wobble: 0.7, overshoot: 0.72, durationMs: 280, easing: 'cubic-bezier(.12,.92,.2,1.28)', particleStrength: 0.18 },
    settled: { refraction: 0.24, meniscus: 0.3, rimTension: 0.08, durationMs: 150, easing: 'ease-out' },
    disabled: { refraction: 0.08, meniscus: 0.12, shadowCompression: 0.1 },
  },
  hard: {
    normal: {},
    focused: { rimTension: 0.1, durationMs: 70, easing: 'ease-out' },
    pressed: { scaleX: 0.992, scaleY: 0.965, translateYEm: 0.03, shadowCompression: 0.7, durationMs: 55, easing: 'ease-out' },
    hold: { scaleX: 0.992, scaleY: 0.96, translateYEm: 0.034, shadowCompression: 0.76, durationMs: 80, easing: 'ease-out' },
    cancelled: { overshoot: 0.08, durationMs: 100, easing: 'ease-out' },
    committed: { scaleX: 1.008, scaleY: 1.008, overshoot: 0.12, durationMs: 115, easing: 'ease-out' },
    settled: { durationMs: 90, easing: 'ease-out' },
    disabled: {},
  },
  flat: {
    normal: {}, focused: { rimTension: 0.06 }, pressed: { scaleX: 0.99, scaleY: 0.98, shadowCompression: 0.28, durationMs: 50, easing: 'ease-out' }, hold: { scaleX: 0.99, scaleY: 0.98, shadowCompression: 0.32, durationMs: 70, easing: 'ease-out' }, cancelled: { durationMs: 70, easing: 'ease-out' }, committed: { durationMs: 80, easing: 'ease-out' }, settled: { durationMs: 70, easing: 'ease-out' }, disabled: {},
  },
});

const assertEnum = (value, allowed, label) => {
  if (!allowed.includes(value)) throw new Error(`unsupported ${label}: ${String(value)}`);
};

export function projectMaterialFeedback({
  material = MATERIAL_FEEDBACK_MATERIALS.FLAT,
  phase = MATERIAL_FEEDBACK_PHASES.NORMAL,
  localX = 0.5,
  localY = 0.5,
  reducedMotion = false,
  lowPerf = false,
} = {}) {
  const materials = Object.values(MATERIAL_FEEDBACK_MATERIALS);
  const phases = Object.values(MATERIAL_FEEDBACK_PHASES);
  assertEnum(material, materials, 'material');
  assertEnum(phase, phases, 'phase');
  if (!Number.isFinite(Number(localX)) || !Number.isFinite(Number(localY))) throw new Error('localX/localY must be finite');

  const x = clamp(localX);
  const y = clamp(localY);
  const impactX = (x - 0.5) * 2;
  const impactY = (y - 0.5) * 2;
  const profile = { ...BASE, ...(PROFILES[material][phase] || {}) };
  const isContact = phase === 'pressed' || phase === 'hold';
  const isRelease = phase === 'cancelled' || phase === 'committed';

  let durationMs = profile.durationMs;
  let wobble = profile.wobble;
  let overshoot = profile.overshoot;
  let particleStrength = profile.particleStrength;
  let refraction = profile.refraction;
  let specularLag = profile.specularLag;

  if (reducedMotion) {
    durationMs = 0;
    wobble = 0;
    overshoot = 0;
    particleStrength = 0;
    specularLag = 0;
  } else if (lowPerf) {
    durationMs = Math.min(durationMs, 120);
    wobble *= 0.35;
    overshoot *= 0.5;
    particleStrength = 0;
    refraction = 0;
    specularLag *= 0.4;
  }

  const lateralYield = material === 'droplet' ? 0.032 : material === 'gummy' ? 0.018 : 0.006;
  const contactBias = isContact ? 1 : isRelease ? 0.35 : 0;
  const translateXEm = profile.translateXEm + impactX * lateralYield * contactBias;
  const rotateDeg = (material === 'droplet' ? impactX * 1.4 : material === 'gummy' ? impactX * 0.7 : 0) * contactBias;
  const highlightX = clamp(x - impactX * specularLag * 0.18);
  const highlightY = clamp(y - impactY * specularLag * 0.14);

  const hapticIntent = phase === 'pressed'
    ? (material === 'gummy' || material === 'droplet' ? 'soft_press' : 'crisp_press')
    : phase === 'committed'
      ? (material === 'droplet' ? 'liquid_release' : material === 'gummy' ? 'elastic_release' : 'confirm')
      : null;

  const result = {
    material,
    phase,
    contact: { x, y },
    transform: {
      scaleX: profile.scaleX,
      scaleY: profile.scaleY,
      translateXEm,
      translateYEm: profile.translateYEm,
      rotateDeg,
    },
    surface: {
      shadowCompression: profile.shadowCompression,
      rimTension: profile.rimTension,
      refraction,
      meniscus: profile.meniscus,
      specularLag,
      highlightX,
      highlightY,
    },
    motion: {
      durationMs,
      easing: reducedMotion ? 'linear' : profile.easing,
      wobble,
      overshoot,
      particleStrength,
    },
    channels: {
      hapticIntent,
      audioIntent: phase === 'pressed' ? 'press' : phase === 'committed' ? 'release_confirm' : phase === 'cancelled' ? 'release_cancel' : null,
    },
    invariants: {
      mutatesActionState: false,
      requiresStableHitbox: true,
      reducedMotion,
      lowPerf,
    },
  };

  return deepFreeze(result);
}

export function materialFeedbackCssVars(projection) {
  if (!projection || projection.invariants?.mutatesActionState !== false) throw new Error('invalid material projection');
  const { transform, surface, motion, contact } = projection;
  return Object.freeze({
    '--mf-scale-x': String(transform.scaleX),
    '--mf-scale-y': String(transform.scaleY),
    '--mf-translate-x': `${transform.translateXEm}em`,
    '--mf-translate-y': `${transform.translateYEm}em`,
    '--mf-rotate': `${transform.rotateDeg}deg`,
    '--mf-contact-x': `${contact.x * 100}%`,
    '--mf-contact-y': `${contact.y * 100}%`,
    '--mf-highlight-x': `${surface.highlightX * 100}%`,
    '--mf-highlight-y': `${surface.highlightY * 100}%`,
    '--mf-shadow-compression': String(surface.shadowCompression),
    '--mf-rim-tension': String(surface.rimTension),
    '--mf-refraction': String(surface.refraction),
    '--mf-meniscus': String(surface.meniscus),
    '--mf-wobble': String(motion.wobble),
    '--mf-overshoot': String(motion.overshoot),
    '--mf-duration': `${motion.durationMs}ms`,
    '--mf-easing': motion.easing,
  });
}
