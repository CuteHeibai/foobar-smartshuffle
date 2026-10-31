# Scheduling core report

Implemented the locked `ss` interface in `src/core.hpp` and `src/core.cpp`; standalone behavioral checks are in `tests/core_tests.cpp`. No commits were made.

## Behavior

- Canonical unique nonempty IDs, deterministic `mt19937_64` seed, no replacement. Reordering an unchanged input library leaves seeded results unchanged. If duplicate IDs have conflicting metadata, the first occurrence supplies metadata.
- Frequency is `log1p(C) + 2*log1p(R30)`, converted to tied midrank percentiles. Equal counts are neutral. A continuous exponential weight prefers frequent tracks on the right and infrequent tracks on the left. Center uses an equal-weight exponential race, giving a uniform random permutation.
- Style is evaluated relative to the supplied reference for the first selection, then the previously selected track for each following selection. Positive y favors jumps; negative y favors similarity. Missing comparisons contribute zero preference. When no pair has comparable style evidence, y falls back to the same neutral seeded ordering.
- Audio dimensions use corpus IQR normalization, with range fallback for a zero IQR; constant dimensions do not dilute distance. Intermediate normalization avoids overflow from extreme finite inputs and makes heterogeneous units comparable. Direct `similarity()` uses a symmetric relative distance without hidden corpus state. Both return bounded known similarities; unavailable comparisons return NaN.
- Comparable labels supplement audio at 20%; audio supplies 80%. Labels alone are used if audio cannot be compared. Genre tokens accept semicolon/comma/pipe separators, and labels trim whitespace and fold ASCII case. Missing labels do not impose a penalty. Artists and genres supply 25%/75% of the tag contribution when both are comparable.
- Reconciliation preserves seen IDs (including temporarily deleted tracks), pending relative order, round number and last track. Deleted pending IDs disappear. Newly added unseen tracks are inserted into gaps according to a fresh weighted ordering. Unchanged pending tracks do not reorder for library reordering, count edits or preference edits alone.
- `begin_round` increments the number with saturation, clears seen, generates the next permutation, and prevents last-to-first repetition when two or more unique IDs remain. A fresh default round should use `reconcile`, retaining round number 1.
- `consume` removes the chosen ID, records it only once, and updates last. Intentional replay is safe, as is passing `round.remaining.front()` directly by reference.
- Coordinates clamp to [-1,1]; nonfinite coordinates/counts and negative counts become zero. JSON round restart tolerates invalid types, normalizes coordinates, deduplicates arrays, removes seen IDs from pending, and preserves valid state.

## Verification

Tests were written before the implementation. The first runnable MSVC baseline produced the expected failures in 12 of 14 groups. An additional aliased-ID regression was observed failing before its fix.

Both final builds ran successfully with Visual Studio 2022 Community, developer prompt v17.14.3, x64 C++20:

1. Optimized `/EHsc /W4 /O2`: **15/15 groups, 13,275 checks**.
2. Debug `/EHsc /W4 /WX /Od /RTC1 /MDd /D_ITERATOR_DEBUG_LEVEL=2`: **15/15 groups, 13,275 checks**, no compiler warnings or runtime/iterator-check errors.

Coverage includes empty/one/two/large libraries; deterministic seeds and input reordering; center frequency distributions over 4,000 seeds; x direction/continuity over 3,000 seeds per coordinate; tied frequency fairness over 5,000 seeds; recent-count weighting; up/down transitions over 2,000 seeds; mixed corner and feature unit-rescaling over 1,000 seeds; weighted insertion over 2,000 seeds; added/deleted/duplicate IDs; safe replay/aliasing; round boundaries; JSON restart and corrupted values; a 5,000-track frequency permutation and 300-track dynamic acoustic permutation.

Reproduction from the repository directory after loading `vcvars64.bat`:

```bat
cl /nologo /std:c++20 /EHsc /W4 /O2 /I src /I vendor tests\core_tests.cpp src\core.cpp /Fe:build\core_tests.exe /Fo:build\
build\core_tests.exe
```

The frequency/center path is O(n log n). Exact dynamic style sampling is O(n^2*d) time and O(n*d) corpus storage; the adapter should avoid doing large-library style generation synchronously on its UI thread. These are standalone core checks. No foobar2000 playback, native UI, real-service, or listening-quality acceptance was performed by this task.
