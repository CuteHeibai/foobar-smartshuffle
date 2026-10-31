# Standalone analyzer result

Built executable: `build/analyzer/smartshuffle-analyzer/smartshuffle-analyzer.exe`.
Deploy the entire adjacent directory, including `_internal`, into the native
component's `smartshuffle/runtime/` directory. Size: 287,800,150 bytes across
680 files (about 274.5 MiB). No foobar installation or global Python was changed.

## Implementation and contract

`--input <decoded.wav> --output <result.json>` publishes UTF-8 JSON using a
same-directory temporary file, flush/fsync, then atomic replacement. Success is
exactly `{"version":1,"ok":true,"features":[65 finite floats]}`. Decode/analysis
failure publishes `{"version":1,"ok":false,"error":"actionable message"}` and
returns 1. Failure to write the result returns 2 with a stderr explanation.

The vector order is MFCC20 means, MFCC20 standard deviations, chroma12 means,
spectral contrast7 means, tempo, onset-strength standard deviation, RMS mean and
standard deviation, spectral centroid mean, spectral flatness mean. Input reads
are bounded to the first 90 seconds before downmix/resampling; analysis uses
22050 Hz, a 2048-point periodic Hann window, and 512-sample hops. Invalid,
empty, or nonfinite audio fails explicitly. Silence and even a single sample at
192000 Hz produce finite values. Very short resampling uses librosa-compatible
ceil-and-pad output-length semantics rather than dropping all samples.

Librosa provides the Slaney Mel filter bank and frequency/pitch conversion.
NumPy/SciPy provide one shared STFT, orthonormal MFCC DCT, fixed-tuning C-to-B
chroma, seven octave peak/valley contrasts, and onset autocorrelation tempo with
a broad 120 BPM prior. Resampling calls soxr HQ directly, the default backend
of librosa's resampler. This is a deliberate implementation refinement: importing
`librosa.core.audio` eagerly compiles Numba gufuncs; merely setting
`NUMBA_DISABLE_JIT=1` makes those stencil wrappers fail. The selected imports
avoid that code path entirely. Runtime disables JIT and does not create a Numba
cache. Chroma uses fixed tuning; these features are not claimed to be numerically
identical to all defaults of librosa's high-level feature functions.

## Build

`scripts/build-analyzer.ps1` resolves the repository independently of cwd,
requires Python 3.13, creates `.venv`, installs the complete pinned dependency
set in `analyzer/requirements.txt`, runs source tests, builds PyInstaller onedir
with `--collect-all librosa`, and reruns the suite with the packaged CLI.
It also explicitly collects soundfile and soxr dependencies. Python, libsndfile,
NumPy/SciPy libraries and the required runtime packages are included.

The machine's `py -3.13` registration pointed at a missing executable. The
existing Python Install Manager successfully extracted official Python 3.13.17
with `py install --target=build/python313 3.13`, without registering or changing
a global runtime. The build script includes that local-only fallback.

The final build used `./scripts/build-analyzer.ps1 -SkipInstall` after installing
the pinned packages. PyInstaller completed in 28.9 seconds. A full offline
wheelhouse was then created in `build/analyzer-wheels`; installing the exact
requirements with `pip install --no-index --find-links build/analyzer-wheels`
succeeded. Future builds can use `./scripts/build-analyzer.ps1 -Offline`.

PyInstaller reports an unresolved optional `tbb12.dll` for Numba's unused TBB
parallel backend. This analyzer executes no Numba kernels or parallel backend;
the actual packaged executable passes all checks without that DLL.

## Verification

TDD: the original eight tests first failed because the analyzer was absent
(11 failed assertions including subtests). They then passed. A later regression
test first exposed zero-length soxr results for one sample at 48000/192000 Hz;
the ceil-and-pad correction made it pass.

Final source suite: **10/10 passed**, 7.121 seconds. Final suite with the
packaged executable selected: **10/10 passed**, 7.476 seconds. Core tests run
against the source module in both invocations; CLI tests in the second invocation
run the actual executable. Covered behaviors:

- Deterministic 65 finite floats and anchored RMS/centroid/flatness semantics.
- Tone versus noise discrimination and approximately 120 BPM burst rhythm.
- Silence, single-sample audio, and source rates 8000/44100/48000/192000 Hz.
- Real IEEE float32 WAV and 48000 Hz resampling.
- Files beyond 90 seconds ignoring trailing audio.
- Missing/corrupt/nonfinite/empty input producing JSON errors and nonzero exits.
- Existing result replacement remaining complete valid JSON during CLI execution.
- Actual packaged 48000 Hz tone, 44100 Hz silence, and one-sample 192000 Hz WAV
  agreeing with source feature output.

Additional packaged portability checks ran from a temporary cwd, with PATH
restricted to Windows System32, empty PYTHONPATH, deliberately invalid
PYTHONHOME, CREATE_NO_WINDOW, and a fresh nonexistent NUMBA_CACHE_DIR. Every run
returned 65 valid features and exit 0; no Numba cache was created:

| Source duration | Fresh-process wall time |
| --- | --- |
| 2 seconds at 48000 Hz, first run | 0.7798 seconds |
| 2 seconds at 48000 Hz, second run | 0.7821 seconds |
| 90 seconds at 48000 Hz | 0.9675 seconds |

These are fresh-process timings with ordinary Windows filesystem caching, not
a machine reboot or cold-disk benchmark. Evidence is in
`build/analyzer-build.log`, `build/analyzer-portability.json`,
`build/analyzer-wheelhouse.log`, and `build/analyzer-offline-install.log`.
No GUI automation, installed-player mutation, commits, real-song library scan,
or native-to-analyzer integration was performed by this task; the parent owns
the SDK decoder and integration checks.
