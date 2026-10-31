# Implementation progress — docs/plan.md

Task 1: complete — native C++ ordering and persistent rounds; 16 groups / 25,278 assertions.
Task 2: complete — SDK adapter, queue scheduling, acoustic scanner, isolated packaged analyzer.
Task 3: complete — Chinese Verdant, two-dimensional preference preview, real queue, native ESLyric host and output picker.
Task 4: complete — disposable host checks, exact-file restore, final package and backed-up live deployment.

Ruling: This is a new standalone repository at the user-specified path; no pre-existing branch or source requires a linked worktree.
Ruling: Use a file-based versioned bridge plus a native main-menu dispatch command. It works with the installed JSplitter without HTTP servers, COM registration or new network permissions.
Ruling: SDK pinned to 2025-03-07 to retain compatibility with installed 2.25.8 rather than raising the host version requirement.

| Shared boundary | Producer / consumer | Decision |
|---|---|---|
| Core / native | standard C++ model / SDK adapter | No SDK types in core |
| Native / analyzer | bounded SDK-decoded PCM / local feature extraction | No audio tag writes |
| Native / theme | version 1 JSON bridge | Native owns sequence and revision |
| Native / deployment | component + runtime / backup-aware installer | Test copy before live install |

2026-10-31 verification: core 16 groups, theme 20 contracts, analyzer 10 tests, installer 3 tests. Actual host workflow 14 checks; invalid decoder handling 2 checks. Restore exercised on the disposable installation: 12 manifest entries / 20 exact files restored. Latest native startup handshake verified in a fresh process. GUI automation is prohibited by the user's latest instruction; no further Computer Use is performed, and visual/high-DPI acceptance remains manual.

Final native acceptance: 16 checks against the actual 44-song playlist passed after the decoder-failure changes; normal restart preserved source, round, point and exact remaining order. Live installation loaded component 1.0.0 and the Chinese theme; active endpoint is Lian II WASAPI exclusive. All non-interface core configuration values were identical immediately before/after installation. Backup: `C:\Program Files\foobar2000\smartshuffle-backups\20261031-174108-321976`.
