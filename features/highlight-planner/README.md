# Highlight planner

## Goal

Formalize selected-game-event timing as a deterministic, explicit render-planning
stage before FFmpeg or HUD rendering runs. Given the same selected events and
options, the planner must always return the same manifest.

```text
selected GameEvent[] -> Highlight Planner -> Highlight Plan -> FFmpeg / HUD Renderer
```

## Scope

The feature introduces a pure API:

```ts
planHighlights(selectedEvents, {
  preRollSeconds: 3,
  postRollSeconds: 3,
  videoDurationSeconds: 842.7
});
```

It returns a plan with ordered source-video segments and the total combined source
duration:

```ts
type HighlightSegment = {
  startSecond: number;
  endSecond: number;
  eventIds: string[];
};

type HighlightPlan = {
  segments: HighlightSegment[];
  totalDurationSeconds: number;
};
```

FFmpeg filtering, media probing, filesystem access, HUD rendering, and command
execution remain outside the planner. The video renderer adapts manifest event IDs
back to the selected `GameEvent` records it needs for visual and audio effects.

## Decisions and constraints

- Windows use caller-provided pre-roll and post-roll values; the existing renderer
  passes three seconds for each.
- The planner does not mutate its input.
- Valid event windows are clamped to the inclusive source-video interval from zero
  through `videoDurationSeconds`.
- Events whose timestamps are outside that interval are ignored.
- Duplicate selected event IDs are deduplicated deterministically before planning.
- Events are sorted deterministically, so pre-sorted and unordered selections produce
  identical manifests. Equal timestamps use a stable documented tie-breaker.
- Overlapping or boundary-touching windows merge into one segment. Merged segments
  retain deterministic chronological event ID ordering.
- An empty selection, or a selection containing no valid events, produces no segments
  and a zero total duration.
- Planner options must be finite and non-negative. Invalid options surface an explicit
  input error rather than a partial or silent fallback.
- Fractional-second timing is retained by the planner; FFmpeg-specific formatting
  stays at the rendering boundary.

## Implementation plan

1. Add exported planner option, segment, and manifest types with a pure
   `planHighlights` function under `src`.
2. Normalize selection input by rejecting invalid options, discarding out-of-bounds
   events, deterministically deduplicating IDs, ordering remaining events, creating
   clamped windows, merging windows, and summing merged durations.
3. Refactor the current video clip-interval construction to consume the manifest and
   resolve each segment's event IDs back to its `GameEvent` records, preserving
   existing filtering, concatenation, HUD, and event-effect behavior.
4. Add exact, table-driven planner fixtures and retain compatibility coverage for the
   renderer adapter.
5. Document the final API and behavior in the project README where it describes
   selected chronological highlights.

## Acceptance criteria

- The three-event example at 20, 24, and 90 seconds with a three-second pre/post roll
  produces segments `17-27` (`A`, `B`) and `87-93` (`C`) with a total duration of
  16 seconds.
- Overlapping and contained windows merge correctly.
- Chronological and unordered input yield the same manifest.
- Windows clamp at the start and end of the video.
- Equal timestamps, no selections, one selection, many selections, duplicate IDs,
  and out-of-bounds events have explicit deterministic outcomes.
- The planner is unit-testable without opening a media file or invoking FFmpeg.
- Valid existing selections produce the same renderer clip/effect associations and
  chronological concatenation behavior.

## Validation

Run focused planner and video tests, then the full repository verification:

```bash
npm test -- src/highlightPlanner.test.ts src/video.test.ts
npm test
npm run build
```
