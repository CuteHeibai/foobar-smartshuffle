# Implementation progress — docs/plan.md

Task 1: pending
Task 2: pending
Task 3: pending
Task 4: pending

Ruling: This is a new standalone repository at the user-specified path; no pre-existing branch or source requires a linked worktree.
Ruling: Use a file-based versioned bridge plus a native main-menu dispatch command. It works with the installed JSplitter without HTTP servers, COM registration or new network permissions.
Ruling: SDK pinned to 2025-03-07 to retain compatibility with installed 2.25.8 rather than raising the host version requirement.

| Shared boundary | Producer / consumer | Decision |
|---|---|---|
| Core / native | standard C++ model / SDK adapter | No SDK types in core |
| Native / analyzer | bounded SDK-decoded PCM / local feature extraction | No audio tag writes |
| Native / theme | version 1 JSON bridge | Native owns sequence and revision |
| Native / deployment | component + runtime / backup-aware installer | Test copy before live install |
