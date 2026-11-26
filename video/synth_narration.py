#!/usr/bin/env python3
"""Synthesize StudySplit narration with OmniVoice, sentence by sentence.

Every sentence gets an exact start time; the manifest drives steps.json retiming.
Run: python3 synth_narration.py with VOICE_REF and VOICE_REF_TEXT set, or with video/voice-ref.wav and video/voice-ref.txt present locally.
"""
import json
import hashlib
import os
import re
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf

REPO = Path(__file__).resolve().parents[1]
REF = Path(os.environ.get("VOICE_REF", REPO / "video" / "voice-ref.wav"))
REF_TEXT_PATH = Path(os.environ.get("VOICE_REF_TEXT", REF.with_name("voice-ref.txt")))
if not REF.exists() or not REF_TEXT_PATH.exists():
    raise SystemExit("voice reference files are local-only; set VOICE_REF and VOICE_REF_TEXT")
REF_TEXT = REF_TEXT_PATH.read_text().strip()
CACHE = REPO / "video" / ".tts-cache"
HERE = Path(__file__).resolve().parent
MANIFEST = HERE / "manifest.json"
OUT = REPO / "video/narration.wav"
SEED = 1
LEAD = 0.35       # silence before the first word
GAP_SENT = 0.18   # pause between sentences inside a paragraph
GAP_PARA = 0.45   # pause between paragraphs
TAIL = 0.35       # silence after the last word


def sentences(text):
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p.strip() for p in parts if p.strip()]


def main():
    paras = [p.strip() for p in (REPO / "video/narration.txt").read_text().split("\n\n") if p.strip()]
    assert len(paras) == 7, f"expected 7 paragraphs, got {len(paras)}"
    CACHE.mkdir(parents=True, exist_ok=True)

    from mlx_audio.tts.utils import load_model
    import mlx.core as mx

    t0 = time.time()
    model = load_model("mlx-community/OmniVoice-bf16")
    sr = model.sample_rate
    print(f"model loaded in {time.time()-t0:.1f}s, sr={sr}", flush=True)

    entries = []
    for pi, para in enumerate(paras):
        for si, sent in enumerate(sentences(para)):
            h = hashlib.sha1(f"{sent}|{SEED}|{REF}".encode()).hexdigest()[:16]
            cpath = CACHE / f"{h}.wav"
            if cpath.exists():
                audio, _ = sf.read(cpath)
                print(f"[p{pi} s{si}] cached {len(audio)/sr:5.2f}s  {sent[:55]}", flush=True)
            else:
                ts = time.time()
                mx.random.seed(SEED)
                parts = model.generate(text=sent, ref_audio=str(REF), ref_text=REF_TEXT, language="english")
                audio = np.concatenate([np.array(r.audio) for r in parts]).astype(np.float32)
                sf.write(cpath, audio, sr)
                rms = float(np.sqrt(np.mean(audio**2)) + 1e-12)
                print(f"[p{pi} s{si}] {len(audio)/sr:5.2f}s rms={rms:.4f} in {time.time()-ts:4.1f}s  {sent[:55]}", flush=True)
            dur = len(audio) / sr
            entries.append({"para": pi, "sent": si, "text": sent, "dur": round(dur, 4),
                            "words": len(sent.split()), "rms": float(np.sqrt(np.mean(audio**2) + 1e-12))})

    # Assemble with measured gaps; record exact start of every sentence.
    pieces = [np.zeros(int(sr * LEAD), dtype=np.float32)]
    t = LEAD
    prev = None
    for e in entries:
        a, _ = sf.read(CACHE / (hashlib.sha1(f"{e['text']}|{SEED}|{REF}".encode()).hexdigest()[:16] + ".wav"))
        a = a.astype(np.float32)
        if prev is not None:
            gap = GAP_PARA if e["para"] != prev["para"] else GAP_SENT
        else:
            gap = 0.0
        pieces.append(np.zeros(int(sr * gap), dtype=np.float32))
        t += gap
        e["start"] = round(t, 3)
        pieces.append(a)
        t += e["dur"]
        prev = e
    pieces.append(np.zeros(int(sr * TAIL), dtype=np.float32))
    total = t + TAIL

    audio = np.concatenate(pieces)
    raw_peak = float(np.max(np.abs(audio)))
    if raw_peak > 0.94:
        audio = audio * (0.94 / raw_peak)
    sf.write(OUT, audio, sr)
    rms = float(np.sqrt(np.mean(audio**2)))
    peak = float(np.max(np.abs(audio)))
    words = sum(e["words"] for e in entries)
    manifest = {"sr": sr, "total": round(total, 3), "lead": LEAD, "gap_sent": GAP_SENT,
                "gap_para": GAP_PARA, "tail": TAIL, "seed": SEED,
                "overall_rms": rms, "overall_peak": peak, "words": words,
                "sentences": entries}
    MANIFEST.write_text(json.dumps(manifest, indent=1))
    print(f"TOTAL {total:.2f}s ({words} words, {words/(total/60):.0f} wpm) rms={rms:.4f} peak={peak:.4f}", flush=True)
    # flag outliers: sentences whose seconds-per-word deviates wildly
    med = float(np.median([e["dur"] / e["words"] for e in entries]))
    for e in entries:
        ratio = e["dur"] / e["words"]
        if ratio > med * 2.5 or ratio < med * 0.4:
            print(f"OUTLIER p{e['para']} s{e['sent']}: {ratio:.2f}s/word vs median {med:.2f}: {e['text'][:60]}", flush=True)
    print(f"manifest -> {MANIFEST}", flush=True)


if __name__ == "__main__":
    main()
