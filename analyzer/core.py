"""65 acoustic descriptors, with no Numba JIT or model/network dependency.

Librosa supplies the Slaney Mel filter bank and pitch conversion. SciPy and
NumPy operate on one shared STFT. Resampling calls soxr HQ directly, the same
backend used by librosa's default resampler, avoiding its audio module's eager
Numba gufunc compilation in every freshly launched analyzer process.
"""
import os
from pathlib import Path

# These must precede librosa/NumPy imports. The code deliberately never imports
# librosa.core.audio or librosa.util.utils (their gufuncs compile even with JIT
# disabled, and are unnecessary for these descriptors).
os.environ["NUMBA_DISABLE_JIT"] = "1"
os.environ["LIBROSA_CACHE_LEVEL"] = "0"
for _variable in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ[_variable] = "1"

import numpy as np
import soundfile as sf
import soxr
from scipy.fft import dct, rfft
from scipy.signal import correlate
from librosa.filters import mel
from librosa.core.convert import hz_to_midi

SAMPLE_RATE = 22050
N_FFT = 2048
HOP_LENGTH = 512
MAX_SECONDS = 90


def _tempo(onset: np.ndarray) -> float:
    """Global onset autocorrelation tempo, with a broad 120 BPM prior."""
    if onset.size < 4 or np.std(onset) < 0.05:
        return 0.0
    envelope = onset - onset.mean()
    autocorrelation = correlate(envelope, envelope, mode="full", method="fft")[onset.size - 1:]
    if autocorrelation[0] <= 0:
        return 0.0
    frame_rate = SAMPLE_RATE / HOP_LENGTH
    lags = np.arange(max(1, int(frame_rate * 60 / 240)),
                     min(onset.size - 1, int(frame_rate * 60 / 40)) + 1)
    if not lags.size:
        return 0.0
    bpms = 60 * frame_rate / lags
    prior = np.exp(-0.5 * np.log2(bpms / 120) ** 2)
    scores = autocorrelation[lags] / autocorrelation[0] * prior
    best = int(np.argmax(scores))
    return float(bpms[best]) if scores[best] >= 0.1 else 0.0


def _chroma(power: np.ndarray, frequencies: np.ndarray) -> np.ndarray:
    """Fixed-tuning C-through-B pitch-class energies, infinity-normalized."""
    pitches = hz_to_midi(frequencies[1:])
    distances = (pitches[None, :] - np.arange(12)[:, None] + 6) % 12 - 6
    weights = np.exp(-2 * distances ** 2)
    weights /= np.maximum(np.linalg.norm(weights, axis=0, keepdims=True), 1e-20)
    chroma = weights @ power[1:]
    chroma /= np.maximum(chroma.max(axis=0, keepdims=True), 1e-20)
    return chroma


def _spectral_contrast(magnitude: np.ndarray, frequencies: np.ndarray) -> np.ndarray:
    """Seven octave bands with 2% peak/valley averages, expressed in dB."""
    edges = np.concatenate(([0], 200 * 2.0 ** np.arange(7)))
    contrasts = []
    for index in range(7):
        low = max(0, np.searchsorted(frequencies, edges[index]) - (index > 0))
        high = magnitude.shape[0] if index == 6 else np.searchsorted(frequencies, edges[index + 1])
        band = np.sort(magnitude[low:high], axis=0)
        count = max(1, round(band.shape[0] * 0.02))
        valley = np.maximum(band[:count].mean(axis=0), 1e-10)
        peak = np.maximum(band[-count:].mean(axis=0), 1e-10)
        contrasts.append((10 * np.log10(peak / valley)).mean())
    return np.asarray(contrasts)


def analyze_audio(samples: np.ndarray, sample_rate: int) -> list[float]:
    """Analyze mono samples; bound duration before resampling or STFT allocation."""
    if not isinstance(sample_rate, (int, np.integer)) or sample_rate <= 0:
        raise ValueError("Audio sample rate must be a positive integer.")
    audio = np.asarray(samples, dtype=np.float64)
    if audio.ndim != 1 or not audio.size:
        raise ValueError("Audio has no mono samples; decode a nonempty audio segment first.")
    audio = audio[:sample_rate * MAX_SECONDS]
    if not np.isfinite(audio).all():
        raise ValueError("Audio contains nonfinite samples (NaN or infinity); decode the source again.")
    if sample_rate != SAMPLE_RATE:
        output_length = int(np.ceil(audio.size * SAMPLE_RATE / sample_rate))
        audio = soxr.resample(audio, sample_rate, SAMPLE_RATE, quality="HQ")
        # Match librosa.resample(fix=True): soxr rounds lengths, whereas its
        # wrapper uses ceil. This also preserves a frame for a one-sample input.
        audio = np.pad(audio[:output_length], (0, max(0, output_length - audio.size)))
    if not audio.size or not np.isfinite(audio).all():
        raise ValueError("Resampling produced no valid audio samples.")

    padded = np.pad(audio, (N_FFT // 2, N_FFT // 2))
    frames = np.lib.stride_tricks.sliding_window_view(padded, N_FFT)[::HOP_LENGTH]
    window = 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(N_FFT) / N_FFT)
    magnitude = np.abs(rfft(frames * window, axis=1)).T
    power = magnitude ** 2
    frequencies = np.fft.rfftfreq(N_FFT, 1 / SAMPLE_RATE)

    mel_power = mel(sr=SAMPLE_RATE, n_fft=N_FFT, n_mels=128) @ power
    log_mel = 10 * np.log10(np.maximum(mel_power, 1e-10))
    log_mel = np.maximum(log_mel, log_mel.max() - 80)
    mfcc = dct(log_mel, type=2, norm="ortho", axis=0)[:20]
    chroma = _chroma(power, frequencies)
    contrast = _spectral_contrast(magnitude, frequencies)
    onset = np.concatenate(([0.0], np.maximum(np.diff(log_mel, axis=1), 0).mean(axis=0)))
    rms = np.sqrt(np.mean(frames ** 2, axis=1))
    centroid = (frequencies[:, None] * magnitude).sum(axis=0) / np.maximum(magnitude.sum(axis=0), 1e-20)
    flat_power = np.maximum(power, 1e-10)
    flatness = np.exp(np.log(flat_power).mean(axis=0)) / flat_power.mean(axis=0)
    features = np.concatenate((mfcc.mean(axis=1), mfcc.std(axis=1), chroma.mean(axis=1), contrast,
                               [_tempo(onset), onset.std(), rms.mean(), rms.std(), centroid.mean(), flatness.mean()]))
    if features.size != 65 or not np.isfinite(features).all():
        raise ValueError("Audio produced invalid feature values; check the decoded sample amplitude.")
    return features.tolist()


def analyze_file(path: str | Path) -> list[float]:
    """Read at most 90 seconds from a decoded WAV/audio file, then downmix."""
    path = Path(path)
    if not path.is_file():
        raise ValueError(f"Input audio file does not exist: {path}")
    try:
        with sf.SoundFile(str(path)) as source:
            if source.frames <= 0:
                raise ValueError(f"Input audio file has no samples: {path}")
            samples = source.read(frames=min(source.frames, source.samplerate * MAX_SECONDS),
                                  dtype="float64", always_2d=True)
            sample_rate = source.samplerate
    except (sf.LibsndfileError, RuntimeError) as error:
        raise ValueError(f"Cannot decode input audio file '{path}': {error}") from error
    if not np.isfinite(samples).all():
        raise ValueError(f"Input audio file contains nonfinite samples: {path}")
    return analyze_audio(samples.mean(axis=1), sample_rate)
