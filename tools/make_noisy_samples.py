"""Make noisy copies of the sample recordings for the model benchmark.

Noise = classroom-like babble (three other sample readings mixed underneath, shifted in time)
plus a little hiss, scaled to a target signal-to-noise ratio. Standard library only.
Usage: python3 tools/make_noisy_samples.py   (writes public/samples/noisy/<name>-snr<N>.wav)
"""
import math, random, struct, wave, os, glob

SRC = 'public/samples'
OUT = 'public/samples/noisy'
SNRS = [10, 0]
random.seed(7)

def read(path):
    with wave.open(path) as w:
        assert w.getnchannels() == 1 and w.getsampwidth() == 2, path
        sr = w.getframerate()
        data = w.readframes(w.getnframes())
    return sr, list(struct.unpack('<%dh' % (len(data) // 2), data))

def rms(x):
    return math.sqrt(sum(v * v for v in x) / max(1, len(x))) or 1.0

def write(path, sr, x):
    x = [max(-32768, min(32767, int(round(v)))) for v in x]
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(struct.pack('<%dh' % len(x), *x))

os.makedirs(OUT, exist_ok=True)
files = sorted(f for f in glob.glob(os.path.join(SRC, '*.wav')))
clips = {f: read(f) for f in files}
for f in files:
    sr, speech = clips[f]
    n = len(speech)
    others = [clips[g][1] for g in files if g != f]
    babble = [0.0] * n
    for k, o in enumerate(random.sample(others, 3)):
        shift = random.randrange(len(o))
        for i in range(n):
            babble[i] += o[(i + shift) % len(o)]
    hiss = [random.gauss(0, 1) for _ in range(n)]
    b_rms, h_rms = rms(babble), rms(hiss)
    noise = [babble[i] / b_rms + 0.3 * hiss[i] / h_rms for i in range(n)]
    s_rms, nz_rms = rms(speech), rms(noise)
    name = os.path.splitext(os.path.basename(f))[0]
    for snr in SNRS:
        gain = s_rms / (nz_rms * 10 ** (snr / 20))
        mixed = [speech[i] + gain * noise[i] for i in range(n)]
        peak = max(abs(v) for v in mixed)
        if peak > 32000:
            mixed = [v * 32000 / peak for v in mixed]
        write(os.path.join(OUT, f'{name}-snr{snr}.wav'), sr, mixed)
    print('noisy copies:', name)
