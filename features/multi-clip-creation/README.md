# Multi Clip creation

## Goal

Extend the POC from one automatically rendered Coin clip to a selectable
multi-Coin highlight video. The app evaluates multiple configured Coins, presents
each detected first passage to the user, and renders one downloadable MP4 from the
selected passages.

## Scope

- `coins.json` changes from a single Coin object to a strictly validated nonempty
  list of Coins.
- Only the first detected passage per Coin is eligible for selection.
- Coins without a passage are omitted without failing the job. A job fails only if
  no eligible passage remains after video-time mapping.
- Detected passages are shown in chronological order with Coin metadata and the
  mapped video second.
- Each detected passage is persisted as a typed `GameEvent`, retaining the Coin
  ID, type, value, coordinates, interpolated FIT entry `activityTimestamp`, and
  mapped `videoSecond`.
- Rendering begins only after the user sends a nonempty selection of detected Coin
  IDs.
- The selected passages produce one chronological MP4. Clip windows span three
  seconds before and after each event; video-boundary clamping occurs before
  overlapping or adjacent windows are merged.
- Every selected Coin receives its Coin/XP overlay at its event point, including
  multiple overlays within one merged video interval.

## Decisions and constraints

- Coin IDs are unique and no automatic fallback to the old single-object
  configuration is provided.
- The browser sends only selected IDs. The server owns the event times, ordering,
  and media paths.
- A job progresses through `processing`, `awaiting_selection`, `rendering`,
  `succeeded`, or `failed`.
- The global render lock is released in `awaiting_selection` and atomically
  reacquired when rendering starts. A render request for an already rendering or
  completed job receives `409 Conflict`.
- Selection uses its own TTL. Active-job freshness is derived from `updatedAt` or
  a deliberately refreshed marker rather than directory mtime.
- Server-side limits bound selected event count (20 by default) and the total
  duration of merged intervals (120 seconds by default) before FFmpeg starts.
- The FFmpeg pipeline must support source videos with and without audio and produce
  consistent stream combinations for concatenation.
- Per-event overlay artifacts use unique paths so Coin values cannot overwrite one
  another.

## Implementation plan

1. Update `coins.json`, `coins.json.example`, `src/coin.ts`, and domain types for
   a uniquely identified Coin list with strict per-entry validation.
2. Extend passage detection to find the first interpolated FIT entry crossing for
   every Coin, map each valid crossing to video time, sort the resulting
   `GameEvent` records, and persist them in the job.
3. Split the server lifecycle into detection and selection-driven rendering. Expose
   the awaiting-selection state and candidate list in status responses, and add a
   validated render endpoint with atomic lock reservation and conflict handling.
4. Calculate bounded event windows, clamp them to the video, merge overlapping or
   adjacent intervals, render the relevant overlays, and concatenate all resulting
   segments chronologically. Validate the final MP4 with FFprobe.
5. Update the browser to render a selectable candidate list, disable interactions
   while rendering, submit the chosen IDs, and expose download only after success.
6. Update product and configuration documentation to describe the Coin list,
   selection flow, first-passage rule, limits, and interval merging.

## Acceptance criteria

- A valid Coin list with unique IDs loads; empty lists, invalid entries, and
  duplicate IDs fail clearly.
- Each configured Coin contributes no more than its first valid, in-video passage.
- Every persisted candidate is a complete `GameEvent`, including its Coin ID,
  type, coordinates, unrounded activity timestamp, and mapped video second.
- The user can select any nonempty subset of detected passages and obtain one
  playable combined MP4 in chronological order.
- Overlapping or adjacent clip windows occur once in the output, and every selected
  Coin overlay appears at its correct relative time.
- A source without audio still completes successfully.
- Duplicate render requests, expired selection jobs, lock contention, unknown IDs,
  duplicate IDs, empty selections, and over-limit selections fail explicitly.

## Validation

- Migrate existing Coin, geometry, video, and server tests to the multi-Coin model.
- Add tests for configuration validation, ordered first passages, omitted
  undetected Coins, persisted selection candidates, state transitions, atomic lock
  handling, selection expiry, and repeated render requests.
- Add media-path coverage for boundary clamping, interval merging, different Coin
  values, duration and event-count limits, audio and no-audio sources, and final
  concatenated output.
- Run the narrow existing test and typecheck commands covering the changed modules.
