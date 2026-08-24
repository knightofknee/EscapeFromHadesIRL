#!/usr/bin/env python3
"""Generate the meditation timer's two chime assets.

    python3 tools/generate-chimes.py

Writes assets/bell.wav (the in-app looping alarm) and assets/alarm.wav (the
local-notification sound), then you copy both into the native folders:

    cp assets/bell.wav assets/alarm.wav ios/EscapefromHadesIRL/
    cp assets/bell.wav assets/alarm.wav android/app/src/main/res/raw/

Both are the same voice: a soft singing bowl. Near-harmonic partials (so it
reads as a warm pitch, not a clangy bell), a slow attack so there's no click,
partial-dependent decay so the brightness fades before the body does, and a
pair of slightly detuned oscillators per partial for the slow shimmer a real
bowl has. Mono 44.1kHz 16-bit to match what the app shipped before.
"""

import wave
import numpy as np

RATE = 44100

# Ratio, relative amplitude. Kept close to whole numbers on purpose: a real
# bowl is inharmonic, but the inharmonic ones are exactly what made the old
# asset sound like an alarm clock.
PARTIALS = [
    (1.00, 1.00),
    (2.00, 0.38),
    (3.01, 0.15),
    (4.03, 0.06),
    (5.42, 0.022),
    (7.10, 0.008),
]


def strike(f0: float, seconds: float, decay: float = 2.6) -> np.ndarray:
    """One mallet strike on a bowl tuned to f0, rendered for `seconds`."""
    t = np.arange(int(seconds * RATE)) / RATE
    out = np.zeros_like(t)

    for ratio, amp in PARTIALS:
        freq = f0 * ratio
        # Higher partials shed energy faster — that's most of what makes a
        # struck-metal tone sound soft rather than shrill.
        tau = decay / (ratio ** 0.62)
        env = np.exp(-t / tau)
        # Two voices a hair apart beat against each other, giving the slow
        # breathing shimmer instead of a dead synthetic sine. Lopsided on
        # purpose (0.85/0.15): equal voices would null out at every beat and
        # the tone would pulse instead of shimmer.
        detune = 0.7
        voice = 0.85 * np.sin(2 * np.pi * (freq - detune / 2) * t) + 0.15 * np.sin(
            2 * np.pi * (freq + detune / 2) * t
        )
        out += amp * env * voice

    # 40ms raised-cosine attack: no click, and it reads as a felt mallet
    # rather than a hard striker.
    attack = int(0.040 * RATE)
    ramp = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, attack))
    out[:attack] *= ramp

    return out


def soften(x: np.ndarray, cutoff: float = 4800.0) -> np.ndarray:
    """One-pole lowpass — takes the last of the edge off the attack."""
    a = np.exp(-2 * np.pi * cutoff / RATE)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def write(path: str, samples: np.ndarray, peak: float = 0.72) -> None:
    # Fade the final 200ms to zero so a loop point (bell) or a hard stop
    # (alarm) never clicks.
    tail = min(int(0.200 * RATE), len(samples))
    samples[-tail:] *= np.linspace(1.0, 0.0, tail)

    samples = samples / max(np.max(np.abs(samples)), 1e-9) * peak
    pcm = (samples * 32767).astype('<i2')

    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())
    print(f'{path}: {len(pcm) / RATE:.2f}s')


def place(canvas: np.ndarray, sound: np.ndarray, at_sec: float) -> None:
    start = int(at_sec * RATE)
    end = min(start + len(sound), len(canvas))
    canvas[start:end] += sound[: end - start]


# Pitched in the octave a phone speaker actually reproduces. A prettier, lower
# bowl was the first instinct, but a 200Hz fundamental is most of the way to
# inaudible on an iPhone speaker — you'd only hear its partials.
LOW = 440.00   # A4
HIGH = 659.25  # E5

# --- assets/bell.wav -------------------------------------------------------
# The in-app alarm loops this file, so the trailing silence IS the gap between
# rings. One strike, ~4s of decay, ~1.6s of quiet: a ring every 5.6s.
bell = np.zeros(int(5.6 * RATE))
place(bell, strike(LOW, 4.2), 0.0)
write('assets/bell.wav', soften(bell))

# --- assets/alarm.wav ------------------------------------------------------
# The notification sound. Plays once, start to finish, and iOS gives no way to
# cut it short — so it stays deliberately brief. Two strikes, falling a fifth,
# which carries further than one without ever getting loud.
alarm = np.zeros(int(7.6 * RATE))
place(alarm, strike(HIGH, 4.6), 0.0)
place(alarm, strike(LOW, 5.0) * 0.9, 3.2)
write('assets/alarm.wav', soften(alarm))
