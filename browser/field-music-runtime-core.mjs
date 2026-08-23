import {
  FIELD_MUSIC_ROLE,
  resolveEffectiveMusicVolume,
  resolveFieldMusicSelection,
  resolveOneShotFallback,
} from './field-music-policy-core.mjs';

const clamp01 = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
};

function defaultBrowserEnvironment() {
  return {
    createAudioContext() {
      const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Ctor) throw new Error('WEB_AUDIO_UNAVAILABLE');
      return new Ctor();
    },
    createAudioElement() {
      if (typeof globalThis.Audio !== 'function') throw new Error('HTML_AUDIO_UNAVAILABLE');
      return new globalThis.Audio();
    },
    nowMs() {
      return globalThis.performance?.now?.() ?? Date.now();
    },
    setTimeout(callback, ms) {
      return globalThis.setTimeout(callback, ms);
    },
    clearTimeout(id) {
      return globalThis.clearTimeout(id);
    },
  };
}

function normalizeEnvironment(environment) {
  const fallback = defaultBrowserEnvironment();
  const source = environment && typeof environment === 'object' ? environment : {};
  return {
    createAudioContext: source.createAudioContext?.bind(source) ?? fallback.createAudioContext,
    createAudioElement: source.createAudioElement?.bind(source) ?? fallback.createAudioElement,
    nowMs: source.nowMs?.bind(source) ?? fallback.nowMs,
    setTimeout: source.setTimeout?.bind(source) ?? fallback.setTimeout,
    clearTimeout: source.clearTimeout?.bind(source) ?? fallback.clearTimeout,
  };
}

function safeTrackKey(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export class FieldMusicRuntimeCore {
  constructor({ tracks = [], musicVolume = 0.55, fadeMs = 220, loadTimeoutMs = 6000, environment, onEvent = () => {} } = {}) {
    this.tracks = Array.isArray(tracks) ? tracks.slice() : [];
    this.musicVolume = clamp01(musicVolume);
    this.musicMuted = false;
    this.fadeMs = Math.max(0, Number(fadeMs) || 0);
    this.loadTimeoutMs = Math.max(0, Number(loadTimeoutMs) || 0);
    this.environment = normalizeEnvironment(environment);
    this.onEvent = typeof onEvent === 'function' ? onEvent : () => {};
    this.context = null;
    this.masterBus = null;
    this.musicBus = null;
    this.decks = [];
    this.activeDeckIndex = -1;
    this.selection = null;
    this.userUnlocked = false;
    this.wasPlayingBeforeSuspend = false;
    this.events = [];
    this.pendingStops = new Set();
  }

  emit(type, detail = {}) {
    const event = Object.freeze({ type, atMs: Math.round(this.environment.nowMs()), ...detail });
    this.events.push(event);
    this.onEvent(event);
    return event;
  }

  ensureGraph() {
    if (this.context) return this.context;
    this.context = this.environment.createAudioContext();
    if (!this.context || typeof this.context.createGain !== 'function') throw new Error('INVALID_AUDIO_CONTEXT');
    this.masterBus = this.context.createGain();
    this.musicBus = this.context.createGain();
    this.musicBus.connect(this.masterBus);
    this.masterBus.connect(this.context.destination);
    this.decks = [0, 1].map((index) => {
      const audio = this.environment.createAudioElement();
      audio.preload = 'auto';
      audio.loop = true;
      audio.dataset ??= {};
      const gain = this.context.createGain();
      gain.gain.value = 0;
      const source = this.context.createMediaElementSource(audio);
      source.connect(gain);
      gain.connect(this.musicBus);
      audio.addEventListener?.('playing', () => this.emit('playing', { deck: index, trackKey: audio.dataset.trackKey || null }));
      audio.addEventListener?.('waiting', () => this.emit('waiting', { deck: index, trackKey: audio.dataset.trackKey || null }));
      audio.addEventListener?.('stalled', () => this.emit('stalled', { deck: index, trackKey: audio.dataset.trackKey || null }));
      audio.addEventListener?.('error', () => this.emit('media_error', { deck: index, trackKey: audio.dataset.trackKey || null, code: audio.error?.code ?? null }));
      return { index, audio, gain };
    });
    this.applyBusGain(0);
    this.emit('graph_ready', { state: this.context.state });
    return this.context;
  }

  async unlockFromUserGesture() {
    this.ensureGraph();
    if (this.context.state === 'suspended' && typeof this.context.resume === 'function') await this.context.resume();
    this.userUnlocked = this.context.state === 'running';
    this.emit('user_unlock', { state: this.context.state, ok: this.userUnlocked });
    return this.userUnlocked;
  }

  targetGain(baseVolume = 1) {
    return resolveEffectiveMusicVolume({ baseVolume, musicVolume: this.musicVolume, musicMuted: this.musicMuted });
  }

  applyBusGain(rampMs = 80) {
    if (!this.musicBus || !this.context) return null;
    const target = this.targetGain(this.selection?.baseVolume ?? 1);
    const now = Number(this.context.currentTime) || 0;
    const param = this.musicBus.gain;
    param.cancelScheduledValues?.(now);
    param.setValueAtTime?.(Number(param.value) || 0, now);
    param.linearRampToValueAtTime?.(target, now + Math.max(0, Number(rampMs) || 0) / 1000);
    if (typeof param.linearRampToValueAtTime !== 'function') param.value = target;
    this.emit('music_bus_gain', { target, muted: this.musicMuted, musicVolume: this.musicVolume });
    return target;
  }

  trackByKey(key, tracks = this.tracks) {
    const safeKey = safeTrackKey(key);
    return (Array.isArray(tracks) ? tracks : []).find((track) => safeTrackKey(track?.key) === safeKey) ?? null;
  }

  waitUntilPlayable(audio, timeoutMs = this.loadTimeoutMs) {
    if ((Number(audio?.readyState) || 0) >= 3) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        this.environment.clearTimeout(timer);
        audio.removeEventListener?.('canplay', onCanPlay);
        audio.removeEventListener?.('error', onError);
        if (error) reject(error); else resolve();
      };
      const onCanPlay = () => finish(null);
      const onError = () => finish(new Error(`MEDIA_LOAD_ERROR_${audio.error?.code ?? 'UNKNOWN'}`));
      const timer = this.environment.setTimeout(() => finish(new Error('MEDIA_LOAD_TIMEOUT')), Math.max(0, timeoutMs));
      audio.addEventListener?.('canplay', onCanPlay, { once: true });
      audio.addEventListener?.('error', onError, { once: true });
      audio.load?.();
    });
  }

  scheduleStop(deck, delayMs) {
    const id = this.environment.setTimeout(() => {
      this.pendingStops.delete(id);
      deck.audio.pause?.();
      try { deck.audio.currentTime = 0; } catch {}
    }, Math.max(0, delayMs));
    this.pendingStops.add(id);
    return id;
  }

  async playTrack(track, { reason = 'selected', fadeMs = this.fadeMs } = {}) {
    if (!this.userUnlocked) throw new Error('USER_GESTURE_UNLOCK_REQUIRED');
    if (!track?.url) throw new Error(`TRACK_URL_MISSING:${safeTrackKey(track?.key) || 'unknown'}`);
    this.ensureGraph();
    const nextIndex = this.activeDeckIndex === 0 ? 1 : 0;
    const next = this.decks[nextIndex];
    const previous = this.activeDeckIndex >= 0 ? this.decks[this.activeDeckIndex] : null;
    next.audio.pause?.();
    next.audio.removeAttribute?.('src');
    next.audio.load?.();
    next.audio.dataset.trackKey = safeTrackKey(track.key);
    next.audio.src = track.url;
    next.audio.loop = track.loopMode !== 'none';
    try { next.audio.currentTime = 0; } catch {}
    const now = Number(this.context.currentTime) || 0;
    next.gain.gain.cancelScheduledValues?.(now);
    next.gain.gain.setValueAtTime?.(0, now);
    if (typeof next.gain.gain.setValueAtTime !== 'function') next.gain.gain.value = 0;
    await this.waitUntilPlayable(next.audio);
    await next.audio.play();
    const fadeSeconds = Math.max(0, Number(fadeMs) || 0) / 1000;
    next.gain.gain.linearRampToValueAtTime?.(1, now + fadeSeconds);
    if (typeof next.gain.gain.linearRampToValueAtTime !== 'function') next.gain.gain.value = 1;
    if (previous) {
      previous.gain.gain.cancelScheduledValues?.(now);
      previous.gain.gain.setValueAtTime?.(Number(previous.gain.gain.value) || 0, now);
      previous.gain.gain.linearRampToValueAtTime?.(0, now + fadeSeconds);
      if (typeof previous.gain.gain.linearRampToValueAtTime !== 'function') previous.gain.gain.value = 0;
      this.scheduleStop(previous, Math.max(0, Number(fadeMs) || 0) + 40);
    }
    this.activeDeckIndex = nextIndex;
    this.applyBusGain(0);
    this.emit('track_started', {
      trackKey: safeTrackKey(track.key), reason, loopMode: track.loopMode || 'whole_file',
      targetEffectiveGain: this.targetGain(track.baseVolume ?? 1), fadeMs: Math.max(0, Number(fadeMs) || 0),
    });
    return track;
  }

  async enterField({ fieldId, sessionId, random = Math.random, tracks = this.tracks } = {}) {
    if (!this.userUnlocked) throw new Error('USER_GESTURE_UNLOCK_REQUIRED');
    const selection = resolveFieldMusicSelection({ role: FIELD_MUSIC_ROLE, fieldId, sessionId, tracks, previousSelection: this.selection, random });
    if (selection.kind !== 'selected') {
      this.emit('selection_silent', selection);
      return selection;
    }
    this.selection = selection;
    this.applyBusGain(0);
    const selectedTrack = this.trackByKey(selection.trackKey, tracks);
    try {
      await this.playTrack(selectedTrack, { reason: selection.reason });
      return selection;
    } catch (error) {
      this.emit('play_failed', { trackKey: selection.trackKey, error: String(error?.message || error) });
    }
    const fallback = resolveOneShotFallback({
      role: FIELD_MUSIC_ROLE, failedTrackKey: selection.trackKey, tracks,
      attemptedTrackKeys: [selection.trackKey], random,
    });
    if (!fallback) {
      this.selection = null;
      this.applyBusGain(0);
      this.emit('fallback_unavailable', { failedTrackKey: selection.trackKey });
      return Object.freeze({ kind: 'silent', reason: 'playback_failed_no_fallback', trackKey: null });
    }
    const fallbackTrack = this.trackByKey(fallback.trackKey, tracks);
    this.selection = Object.freeze({ ...selection, trackKey: fallback.trackKey, baseVolume: fallback.baseVolume, reason: fallback.reason });
    this.applyBusGain(0);
    this.emit('fallback_selected', { failedTrackKey: selection.trackKey, trackKey: fallback.trackKey });
    try {
      await this.playTrack(fallbackTrack, { reason: fallback.reason });
      return fallback;
    } catch (fallbackError) {
      this.emit('fallback_failed', { trackKey: fallback.trackKey, error: String(fallbackError?.message || fallbackError) });
      await this.stopNow('fallback_failed');
      this.selection = null;
      this.applyBusGain(0);
      return Object.freeze({ kind: 'silent', reason: 'fallback_failed', trackKey: null });
    }
  }

  setMusicVolume(value) {
    this.musicVolume = clamp01(value);
    this.applyBusGain(80);
    return this.musicVolume;
  }

  setMuted(muted) {
    this.musicMuted = Boolean(muted);
    this.applyBusGain(80);
    return this.musicMuted;
  }

  async setBackgroundSuspended(suspended) {
    if (!this.context) return this.snapshot();
    const active = this.activeDeckIndex >= 0 ? this.decks[this.activeDeckIndex]?.audio : null;
    if (suspended) {
      this.wasPlayingBeforeSuspend = Boolean(active && !active.paused);
      if (typeof this.context.suspend === 'function' && this.context.state !== 'suspended') await this.context.suspend();
      this.emit('background_suspend', { wasPlaying: this.wasPlayingBeforeSuspend, state: this.context.state });
      return this.snapshot();
    }
    if (this.userUnlocked && this.wasPlayingBeforeSuspend && this.context.state === 'suspended' && typeof this.context.resume === 'function') await this.context.resume();
    this.emit('foreground_resume', { state: this.context.state });
    return this.snapshot();
  }

  async stopNow(reason = 'manual_stop') {
    for (const id of this.pendingStops) this.environment.clearTimeout(id);
    this.pendingStops.clear();
    for (const deck of this.decks) {
      deck.audio.pause?.();
      try { deck.audio.currentTime = 0; } catch {}
      deck.gain.gain.value = 0;
    }
    const stoppedKey = this.activeDeckIndex >= 0 ? this.decks[this.activeDeckIndex]?.audio?.dataset?.trackKey ?? null : null;
    this.activeDeckIndex = -1;
    this.emit('stopped', { reason, trackKey: stoppedKey });
    return this.snapshot();
  }

  async endField({ fadeMs = this.fadeMs } = {}) {
    if (!this.context || this.activeDeckIndex < 0) {
      this.selection = null;
      return this.snapshot();
    }
    const active = this.decks[this.activeDeckIndex];
    const now = Number(this.context.currentTime) || 0;
    const durationMs = Math.max(0, Number(fadeMs) || 0);
    active.gain.gain.cancelScheduledValues?.(now);
    active.gain.gain.setValueAtTime?.(Number(active.gain.gain.value) || 0, now);
    active.gain.gain.linearRampToValueAtTime?.(0, now + durationMs / 1000);
    if (typeof active.gain.gain.linearRampToValueAtTime !== 'function') active.gain.gain.value = 0;
    this.emit('field_exit_fade', { trackKey: active.audio.dataset.trackKey || null, fadeMs: durationMs });
    await new Promise((resolve) => this.environment.setTimeout(resolve, durationMs));
    active.audio.pause?.();
    try { active.audio.currentTime = 0; } catch {}
    this.emit('field_exit_stopped', { trackKey: active.audio.dataset.trackKey || null });
    this.activeDeckIndex = -1;
    this.selection = null;
    this.applyBusGain(0);
    return this.snapshot();
  }

  async dispose() {
    await this.stopNow('dispose');
    if (this.context && typeof this.context.close === 'function' && this.context.state !== 'closed') await this.context.close();
    this.userUnlocked = false;
    this.emit('disposed', { state: this.context?.state ?? 'uninitialized' });
  }

  snapshot() {
    const active = this.activeDeckIndex >= 0 ? this.decks[this.activeDeckIndex] : null;
    return Object.freeze({
      contextState: this.context?.state ?? 'uninitialized', userUnlocked: this.userUnlocked,
      activeDeckIndex: this.activeDeckIndex, trackKey: active?.audio?.dataset?.trackKey || null,
      paused: active?.audio?.paused ?? true, mediaLoop: active?.audio?.loop ?? false,
      musicMuted: this.musicMuted, musicVolume: this.musicVolume,
      effectiveGain: this.targetGain(this.selection?.baseVolume ?? 1), selection: this.selection,
      eventCount: this.events.length, events: this.events.slice(-24),
    });
  }
}

export function createFieldMusicRuntime(options) {
  return new FieldMusicRuntimeCore(options);
}
