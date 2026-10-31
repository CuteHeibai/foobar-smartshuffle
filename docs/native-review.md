# Native scheduling review

Actionable findings against `docs/plan.md`, based on the inspected native adapter, scanner, core, and shipped SDK callback contracts. Source locations below refer to the reviewed adapter before subsequent fixes.

## P1: A play request for the final pending song can consume an unplayed next round

`src/native.cpp:187` consumes the requested song and immediately begins the next round when it was the final pending ID. The eventual playback callback then handles the same song again at lines 152–154. Because that ID is present in the newly generated round, every pending ID ahead of it is falsely classified as a decoder failure and consumed. Example: pending `[C]`; play C; new round `[A,B,C]`; C's callback marks A and B consumed without playing them, then starts another round. Make successful-start accounting happen once per playback event, and do not run the managed decoder-skip heuristic against a round created by pre-accounting the same requested start.

## P1: EOF can erase all pending songs without evidence that they were attempted

`src/native.cpp:136` records only a global `ended` flag. Lines 220–223 later consume every currently pending song on any EOF, without retaining the stopped playback's source, managed index, round, or candidate snapshot. This also runs after queued new-track events at line 204. Thus an EOF outside the managed tail, or an EOF followed by a new playback start before the timer runs, can consume pending songs belonging to the wrong playback/round. Scope failure accounting to the stopped managed attempt snapshot and discard stale EOF events after a different playback generation starts. A normal round transition must not be treated as a failed-decode tail.

## P1: Intentional replay is mistaken for failed decoding across round boundaries

`src/native.cpp:152` assumes every ID before the newly started ID in `round.remaining` was attempted and failed whenever playback comes from the managed playlist. Native Previous or a user double-click of an earlier managed-history song can start an ID that is also pending later in a new round. The heuristic then consumes genuine unplayed pending songs. `NewTrack.index` is captured but unused, and the start command is not captured. Distinguish forward automatic traversal from explicit Previous/replay and validate the actual managed index range before accounting skipped decoder attempts.

## P1: The current reference song is also a selectable preview candidate

`src/native.cpp:165–166` appends the current song to pending candidates so `ss::order` can find its audio reference, then removes it from the result afterward. The ordering function actually selects that song, lets it influence frequency percentiles, and uses it as an intermediate previous selection. Removing it afterward does not undo those effects, so visible consecutive-song style preference is evaluated against a hidden insertion. Supply a separate nonselectable anchor, use only pending IDs for frequency ranks, and use the anchor solely for the first style comparison and corpus scaling. An API-compatible optional anchor extension is being implemented in the core.

## P1: User queue priority and source ownership depend on a stale 200 ms snapshot

`src/native.cpp:131` determines whether a start was explicitly queued from `externalQueue`, which is populated only by the timer at lines 214–215. Owned bridge entries are also removed for new user queue entries only at line 216. If a user enqueues a song and presses Next before the next tick, the owned bridge can still play first; if a queued song from another playlist starts before its ID was sampled, line 148 changes the active source to that queue item's playlist. Capture queue mutations synchronously through the SDK's `playback_queue_callback` and retain consumed-entry provenance per start, rather than inferring queue provenance from a periodically sampled set of IDs.

## P1: Lifetime play count is neither owned nor refreshed when effective listening is recorded

`src/native.cpp:74` obtains C exclusively from optional `%play_count%` metadata. The effective-listen threshold at line 206 only appends an R30 timestamp; there is no persistent lifetime C counter. Without a playback-statistics provider, C remains zero forever and all learned preference disappears after the 30-day timestamps age out. Even with that provider, `tracks[].play_count` is captured at refresh and not updated by these effective-listen events. Persist the component's lifetime qualified-listen counter and define how imported counts combine with it; update the live track's frequency data when a qualified event is recorded.

## P2: Pause, seek, stop, and track changes drop real listening intervals

`src/native.cpp:135–138` overwrites `clock` without accruing the interval since the last timer. Line 206 also caps every timer interval at 0.5 seconds. Real listening immediately before a pause/seek/stop is discarded, and a valid long interval while the main thread is busy is undercounted. A track that ends between timer ticks can reach `min(60,length/2)` in real listening and never be recorded. Accrue elapsed active playback to the event timestamp before changing playback state, exclude paused/seek transitions explicitly, and flush the old track before replacing its accounting state.

## P2: Transient analyzer/decode failures become permanent for unchanged files

`src/native.cpp:208` caches an error under the normal file fingerprint, and lines 197–198 never enqueue a fingerprint already in the cache. Consequently starting once without the analyzer installed (`src/scanner.cpp:35`), a temporary locked file, or an analyzer timeout makes those unchanged tracks permanently unanalyzed even after the runtime is installed or the cause disappears. Distinguish terminal file errors from retryable environment/process failures and provide bounded retry or an explicit rescan that clears failed cache entries.
