"""Character voice clips for the game, from the packs in game/assets/voice_src (picked on tools/voice_audition.html).
   python game/tools/build_voices.py            (needs ffmpeg on PATH; run by hand after a re-pick)

Each pick is trimmed (silence before the onset / after the tail), faded, peak-levelled to the same loudness, converted to
mono 48 kHz and written as game/assets/voice/<char>/<kind>_<n>.ogg. sounds.js lists the counts (`variants`).
Sources (licenses): yelling sounds by HaelDB (OpenGameArt, CC0), RPG Voice Starter Pack by Cici Fyre (OpenGameArt, CC0).
"""
import os, subprocess, tempfile
import numpy as np
from scipy.io import wavfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'assets', 'voice_src')
OUT = os.path.join(HERE, '..', 'assets', 'voice')
Y = 'x_yelling_sounds/yelling sounds/'
R = 'x_RPG_Voice_Starter_Pack/RPG Voice Starter Pack/Type 3/'
K = 'x_sam_kiai/'

PICKS = {
    ('samurai', 'atk'): [K + f'{n}.wav' for n in ['v0_3', 'v0_6', 'v0_6_deep', 'v0_7', 'v0_8_deep', 'v3_3', 'v3_3_deep', 'v3_4_deep', 'v3_5', 'v3_5_deep', 'v3_8']]
                        + [Y + '3grunt2.wav', Y + '3grunt4.wav'],
    ('samurai', 'hurt'): [Y + f'yell{n}.wav' for n in (3, 6, 7, 8)],
    ('shinobi', 'atk'): [R + f'attack{n}.wav' for n in (1, 2, 3)],
    ('shinobi', 'hurt'): [R + f'damaged{n}.wav' for n in (1, 2, 3)],
    ('shinobi', 'jump'): [R + f'jump{n}.wav' for n in (1, 2, 3)],
}
MAX_SEC = {'atk': 0.7, 'hurt': 1.2, 'jump': 0.6}   # hurt yells are cut down to their first ~second (no long screams)


def load(path):
    with tempfile.TemporaryDirectory() as td:
        w = os.path.join(td, 'a.wav')
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', path, '-ac', '1', '-ar', '48000', w], check=True)
        sr, x = wavfile.read(w)
    return sr, x.astype(float) / 32768


def trim(x, sr, max_sec):
    hop = int(0.005 * sr)
    e = np.array([np.abs(x[i:i + hop]).max() for i in range(0, len(x) - hop, hop)])
    on = e > 0.06 * e.max()
    a = max(0, (np.argmax(on) - 1) * hop)
    b = min(len(x), (len(on) - np.argmax(on[::-1]) + 2) * hop, a + int(max_sec * sr))
    y = x[a:b].copy()
    fi, fo = int(0.003 * sr), min(len(y) // 4, int(0.08 * sr))
    y[:fi] *= np.linspace(0, 1, fi); y[-fo:] *= np.linspace(1, 0, fo) ** 2
    return y / np.abs(y).max() * 0.9


for (char, kind), files in PICKS.items():
    d = os.path.join(OUT, char); os.makedirs(d, exist_ok=True)
    for i, f in enumerate(files):
        sr, x = load(os.path.join(SRC, f))
        y = trim(x, sr, MAX_SEC[kind])
        with tempfile.TemporaryDirectory() as td:
            w = os.path.join(td, 'b.wav'); wavfile.write(w, sr, (y * 32767).astype(np.int16))
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', w, '-c:a', 'libvorbis', '-q:a', '5', os.path.join(d, f'{kind}_{i}.ogg')], check=True)
    print(char, kind, len(files))
