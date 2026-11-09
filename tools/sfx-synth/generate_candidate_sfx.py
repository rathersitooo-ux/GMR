#!/usr/bin/env python3
"""GAMEROAD candidate SFX synthesizer (free, no external samples).

Generates 9 candidate battle sound effects from pure math (sines, sweeps,
shaped noise) so provenance is fully clear: every sample is computed here.
Output: 44.1 kHz mono 16-bit WAV in ./out-wav/, then encode to Ogg Vorbis
with ffmpeg into the directory given by --ogg-dir.

Sounds (candidate only, NOT formal assets; human acceptance pending):
  battleStart  1.40s - matches BATTLE START movie (title 0.6s + entry 0.8s):
                       taiko-like thump, rising whoosh, bright chord stab.
  turnStart    0.35s - soft two-note turn cue.
  cardReveal   0.45s - paper swish + small chime (card public reveal).
  attack       0.40s - descending whoosh into a punch.
  damage       0.35s - low thud + crunch (being hit).
  victory      1.20s - fanfare arpeggio + final chord.
  defeat       0.80s - soft descending three notes (quiet, not harsh).
  goalOpen     1.00s - rising sparkle + bell (gate opened / goal reached).
  invalid      0.25s - two soft low pulses (cannot-do action), kept quiet.

Usage:
  python3 generate_candidate_sfx.py --ogg-dir ../../assets/audio/sfx/candidate
Deterministic: fixed noise seed, so re-runs produce identical files.
"""
import argparse
import math
import os
import random
import struct
import subprocess
import sys
import wave

SR = 44100


def clamp(x, lo=-1.0, hi=1.0):
    return max(lo, min(hi, x))


class Track:
    def __init__(self, seconds):
        self.n = int(SR * seconds)
        self.buf = [0.0] * self.n

    def add(self, samples, at=0.0, gain=1.0):
        start = int(SR * at)
        for i, s in enumerate(samples):
            j = start + i
            if 0 <= j < self.n:
                self.buf[j] += s * gain

    def finish(self, peak=0.79):
        # 2ms fade-in / 12ms fade-out against clicks, then normalize to peak.
        fi, fo = int(SR * 0.002), int(SR * 0.012)
        for i in range(min(fi, self.n)):
            self.buf[i] *= i / fi
        for i in range(min(fo, self.n)):
            self.buf[self.n - 1 - i] *= i / fo
        m = max((abs(s) for s in self.buf), default=0.0)
        if m > 0:
            k = peak / m
            self.buf = [s * k for s in self.buf]
        return self.buf


def tone(freq, seconds, *, slide_to=None, decay=4.0, harmonics=()):
    """Sine tone with exponential decay; optional pitch slide and harmonics."""
    n = int(SR * seconds)
    out = []
    phase = 0.0
    for i in range(n):
        t = i / SR
        f = freq if slide_to is None else freq + (slide_to - freq) * (i / n)
        phase += 2 * math.pi * f / SR
        env = math.exp(-decay * t)
        v = math.sin(phase)
        for h, hg in harmonics:
            v += hg * math.sin(phase * h)
        out.append(v * env / (1.0 + sum(abs(hg) for _, hg in harmonics)))
    return out


def noise(seconds, *, seed=1234):
    rng = random.Random(seed)
    return [rng.uniform(-1.0, 1.0) for _ in range(int(SR * seconds))]


def lowpass(samples, alpha):
    out, y = [], 0.0
    for s in samples:
        y += alpha * (s - y)
        out.append(y)
    return out


def highpass(samples, alpha):
    # one-pole highpass via lowpass subtraction
    lp = lowpass(samples, alpha)
    return [s - l for s, l in zip(samples, lp)]


def env_ad(samples, attack, release_from):
    n = len(samples)
    out = []
    a = max(1, int(SR * attack))
    r = max(1, int(SR * release_from))
    for i, s in enumerate(samples):
        g = 1.0
        if i < a:
            g = i / a
        if i >= n - r:
            g = min(g, (n - i) / r)
        out.append(s * g)
    return out


def whoosh(seconds, *, seed, lp_from=0.02, lp_to=0.35):
    """Noise sweep: lowpass coefficient ramps up then down (rising whoosh)."""
    src = noise(seconds, seed=seed)
    out, y = [], 0.0
    n = len(src)
    for i, s in enumerate(src):
        a = lp_from + (lp_to - lp_from) * math.sin(math.pi * i / n) ** 1.5
        y += a * (s - y)
        out.append(y * 2.2)
    return env_ad(out, 0.03, seconds * 0.75)


def build_battle_start():
    tr = Track(1.40)
    # taiko-like thump: 95 -> 46 Hz pitch drop
    tr.add(tone(95, 0.38, slide_to=46, decay=7.0, harmonics=((2, 0.25),)), at=0.0, gain=0.95)
    # rising whoosh under the title (0.05 - 0.60)
    tr.add(whoosh(0.55, seed=41), at=0.05, gain=0.34)
    # rising helper sweep
    tr.add(tone(280, 0.52, slide_to=1180, decay=2.2), at=0.06, gain=0.10)
    # metallic "shing" just before the stab
    for f, g in ((2093, 0.20), (2960, 0.13), (3520, 0.09)):
        tr.add(tone(f, 0.30, decay=10.0), at=0.56, gain=g)
    # bright chord stab at entry (0.60): C major add9
    for f in (523.25, 659.25, 783.99, 1046.50, 1174.66):
        tr.add(tone(f, 0.80, decay=3.4, harmonics=((2, 0.18),)), at=0.60, gain=0.30)
    tr.add(tone(1567.98, 0.7, decay=5.0), at=0.60, gain=0.10)  # sparkle G6
    return tr.finish(0.79)


def build_turn_start():
    tr = Track(0.35)
    tr.add(tone(659.25, 0.20, decay=9.0, harmonics=((2, 0.15),)), at=0.0, gain=0.5)
    tr.add(tone(880.00, 0.24, decay=8.0, harmonics=((2, 0.15),)), at=0.10, gain=0.5)
    return tr.finish(0.55)


def build_card_reveal():
    tr = Track(0.45)
    swish = highpass(noise(0.22, seed=77), 0.35)
    tr.add(env_ad(swish, 0.02, 0.16), at=0.0, gain=0.30)
    tr.add(tone(1318.51, 0.24, decay=11.0), at=0.16, gain=0.42)
    tr.add(tone(1975.53, 0.20, decay=13.0), at=0.16, gain=0.20)
    return tr.finish(0.60)


def build_attack():
    tr = Track(0.40)
    w = whoosh(0.20, seed=99)
    tr.add(w, at=0.0, gain=0.42)
    # punch at 0.16: pitch drop + noise burst
    tr.add(tone(170, 0.22, slide_to=58, decay=10.0, harmonics=((2, 0.3),)), at=0.16, gain=0.95)
    burst = lowpass(noise(0.10, seed=7), 0.5)
    tr.add(env_ad(burst, 0.002, 0.09), at=0.16, gain=0.5)
    return tr.finish(0.79)


def build_damage():
    tr = Track(0.35)
    tr.add(tone(115, 0.26, slide_to=48, decay=9.0, harmonics=((2, 0.35), (3, 0.15))), at=0.0, gain=0.95)
    crunch = lowpass(noise(0.16, seed=13), 0.16)
    tr.add(env_ad(crunch, 0.002, 0.14), at=0.0, gain=0.55)
    return tr.finish(0.72)


def build_victory():
    tr = Track(1.20)
    notes = (523.25, 659.25, 783.99, 1046.50)
    for i, f in enumerate(notes):
        tr.add(tone(f, 0.55, decay=5.0, harmonics=((2, 0.2),)), at=i * 0.11, gain=0.42)
    for f in notes:  # final chord
        tr.add(tone(f, 0.75, decay=3.2, harmonics=((2, 0.18),)), at=0.44, gain=0.26)
    tr.add(tone(1567.98, 0.6, decay=5.5), at=0.44, gain=0.10)
    return tr.finish(0.75)


def build_defeat():
    tr = Track(0.80)
    for i, f in enumerate((440.00, 329.63, 261.63)):
        tr.add(tone(f, 0.42, decay=4.5, harmonics=((2, 0.12),)), at=i * 0.17, gain=0.4)
    return tr.finish(0.50)


def build_goal_open():
    tr = Track(1.00)
    tr.add(tone(620, 0.38, slide_to=1860, decay=3.0), at=0.0, gain=0.16)
    shim = highpass(noise(0.5, seed=23), 0.5)
    tr.add(env_ad(shim, 0.10, 0.40), at=0.05, gain=0.10)
    # bell at 0.34: inharmonic partials
    for f, g in ((1046.50, 0.40), (1567.98, 0.22), (2093.00, 0.16), (2637.02, 0.08)):
        tr.add(tone(f, 0.62, decay=5.2), at=0.34, gain=g)
    return tr.finish(0.70)


def build_invalid():
    tr = Track(0.25)
    pulse = lowpass(tone(138, 0.09, decay=16.0, harmonics=((2, 0.4), (3, 0.2))), 0.4)
    tr.add(pulse, at=0.0, gain=0.6)
    tr.add(pulse, at=0.12, gain=0.6)
    return tr.finish(0.42)


BUILDERS = {
    "battleStart": build_battle_start,
    "turnStart": build_turn_start,
    "cardReveal": build_card_reveal,
    "attack": build_attack,
    "damage": build_damage,
    "victory": build_victory,
    "defeat": build_defeat,
    "goalOpen": build_goal_open,
    "invalid": build_invalid,
}


def write_wav(path, samples):
    frames = b"".join(struct.pack("<h", int(clamp(s) * 32767)) for s in samples)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(frames)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ogg-dir", required=True)
    ap.add_argument("--wav-dir", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "out-wav"))
    args = ap.parse_args()
    os.makedirs(args.ogg_dir, exist_ok=True)
    os.makedirs(args.wav_dir, exist_ok=True)
    for name, builder in BUILDERS.items():
        samples = builder()
        wav_path = os.path.join(args.wav_dir, name + ".wav")
        ogg_path = os.path.join(args.ogg_dir, name + ".ogg")
        write_wav(wav_path, samples)
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", wav_path, "-c:a", "libvorbis", "-q:a", "4", ogg_path],
            check=True,
        )
        print(f"{name}: {len(samples)/SR:.2f}s -> {ogg_path} ({os.path.getsize(ogg_path)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
