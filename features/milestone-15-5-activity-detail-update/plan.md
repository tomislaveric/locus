# ActivityDetail improvements

## Problem
On ActivityDetail, clicking **Video / Collected / Near By** shows nothing. Root cause: the tab
click handler in `activity-detail-page.js` reads `tab.dataset.rideTab`, but `activity-tabs.js`
renders `data-activity-tab="..."` (dataset key `activityTab`). Every tab click therefore passes
`undefined` and falls back to Replay, so Video (and everything else) never appears.

Beyond the fix, we're reworking the page: **Video** works as before; the **Collected** and
**Near Misses** tabs are removed. Collected + nearby items instead appear in an overlay box on
the Replay (reusing the World "quest" panel), transitioning live as the replay plays. The Replay
auto-plays from the start.

## Decisions (confirmed)
- Tabs after change: **REPLAY + VIDEO** only.
- Overlay box is **closable** (X, like the World quest box).
- Per-row wording: collectibles `Unvisited -> Completed`; near-by items end state = `Nearby miss`.
- Keep the existing DISTANCE/duration summary header (title lives in the overlay).
- Ride title: read from the FIT file (session sport/workout name); fall back to an
  activity-type label when absent/unreliable. Description: show only if present in the FIT.
- Wording change `visited -> completed` applies to the reusable panel's progress label and
  per-row collectible state, on **both** ActivityDetail and the World quest detail. (Map legend
  and "N visited here" world stats stay as-is — separate discovery concept.)
- "by <creator>" attribution: shown on the World quest panel, hidden on ActivityDetail.

## Approach

### 1. FIT title/description extraction
- Add `parseFitMetadata(file)` in `src/fit.ts` returning `{ title?, description? }`, reading
  candidate FIT name fields (e.g. `workout.wkt_name`, `session.sport_profile_name`/sport name),
  trimmed, `undefined` when empty/unreliable. Keep `parseFitTrack` unchanged (syncValidation dep).
- Unit tests for present / absent / blank cases.

### 2. Thread title/description end-to-end
- Add optional `title?`, `description?` to `Activity` in `src/domain.ts` (flows into
  `replay_snapshot` JSON automatically — no DB migration).
- `deriveActivity(...)` accepts optional metadata; resolves `title` = FIT title || type label
  (small server-side type->label helper), `description` = FIT description (omit if absent).
- Update server import callers (`src/server.ts` ~158 and ~411) to call `parseFitMetadata` and
  pass metadata into `deriveActivity`.

### 3. Reusable collection panel component
- Refactor `world/quest-detail.js` into a shared panel (e.g. `shared/collection-panel.js`)
  parameterized by: title, optional description, optional creator (shown only if provided),
  progress `{collected,total}` with noun "completed", closable flag, and a row list where each
  row has `{ name, rarity, state }` with `state` in `unvisited | completed | nearby-miss`.
- Reuses `CollectibleSwatch` and existing `world-detail`/`quest-detail` styles.
- Change progress label helper wording `visited -> completed`; per-row `Completed/Unvisited`.

### 4. World map uses the shared panel
- `world-page.js` renders the shared panel with `creator` set (keeps "by ...") and the new
  "completed" wording; behavior/markers unchanged.

### 5. ActivityDetail tabs cleanup + bug fix
- `activity-tabs.js`: render only REPLAY + VIDEO.
- `activity-detail-page.js`: fix the dataset bug (read `dataset.activityTab`), drop the
  `collected` / `near-misses` branches and unused imports.
- Remove now-dead components/tests: `collected-tab.js`(+test), `near-misses-tab.js`,
  `near-miss-list.js`. Keep `collected-list.js` (still imported elsewhere).

### 6. Replay overlay (collected on the fly + nearby)
- Render the shared panel over the replay map: title from `activity.replay.activity.title`,
  optional description, no creator, closable.
- Rows: encountered collectibles first (start `unvisited`, flip to `completed` as replay
  reaches each collection time via `markerState`), then near misses below (start `unvisited`,
  flip to `nearby-miss` at their closest-approach time, computed client-side from route
  geometry + collectible position). Progress `collected/total` counts completed collectibles.
- Drive updates from replay progress: extend `mountReplayMap` with an `onProgress(timestamp)`
  callback (or reuse its render loop) and update panel rows/counter in place by collectible id.

### 7. Autoplay
- Auto-play the replay from the beginning on ready (call `player.play()` in `onReady`),
  keeping the play/pause button for manual control.

### 8. Tests & verification
- Update `activity-detail-page.test.js` (tab set, no collected/near-miss branches).
- Update `quest-ui.test.js` wording expectations (`visited -> completed`).
- Add coverage for the shared panel (creator shown/hidden, completed wording, near-miss rows)
  and FIT metadata.
- Run the JS component test runner + the TS test/build; fix fallout.

## Notes / considerations
- No DB migration: title/description persist inside the existing `replay_snapshot` JSON.
- Near-miss "closest approach" time is derived client-side (data has distance, not timestamp).
- Autoplay is muted map animation (no audio), so no browser autoplay-policy issues.
