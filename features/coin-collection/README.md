# Coin collection

## Goal

Turn each detected Coin passage from a static overlay into a satisfying, clearly
readable collect moment in the rendered highlight video.

## Scope

The server-side FFmpeg render will show a centered 2.5D Coin Collect sequence:

- The Coin fades in from farther away, grows during a three-second approach,
  then expands to three times its normal size during the final second.
- At the detected passage time, it pops, disappears, and emits a 0.25-second
  glow/burst.
- An animated `+{value}` reward exits over the following 0.95 seconds.
- A short generated Chime plays at pickup while original audio is briefly ducked.

FIT/GPS detection, API endpoints, Coin selection, clip-window creation, and
output format remain unchanged.

## Decisions and constraints

- Only the normal Coin Collect event is included. Rare/legendary items,
  checkpoints, speed gates, and challenge completion are out of scope.
- The Coin is centered. No route-bearing placement, camera pose, or real
  screen-space AR projection is attempted.
- The reward copy is only `+{value}`; no `COIN COLLECTED` label is displayed.
- Effects with overlapping phases render in parallel; they are not delayed or
  suppressed.
- The Chime is generated during rendering. Source audio is audible outside a
  short duck interval; silent inputs receive Chime-only audio.
- Graphic layers require no host fonts or third-party assets. Numeric rendering
  covers digits `0` through `9` and has bounded behavior for values wider than
  its reward canvas.
- Per-frame FFmpeg filters and expressions must be validated with Debian Bookworm
  FFmpeg, the version family supplied by the Docker runtime.
- This is a visual 2.5D depth cue, not real spatial AR placement.

## Implementation plan

1. Add a Coin-effect module that creates transparent Coin, burst/glow, and
   `+{value}` layers and defines the three-second approach, 0.25-second collect,
   and 0.95-second reward phases.
2. Refactor `renderSelectedClips` in `src/video.ts` to animate per-passage
   layers with verified per-frame scale, alpha, and centered-position expressions.
   Clamp effects to clip bounds and give all parallel filter branches unique
   labels.
3. Build a uniform audio graph from real source audio or a silent base plus
   synthesized Chimes. Duck/mix source audio near pickup and preserve sample
   rate, codec, channel layout, duration, and concat compatibility.
4. Add unit tests for timing, overlap, filter planning, digit coverage, and
   multi-digit rendering. Add required FFmpeg fixtures for overlapping passages
   with and without source audio. Update the product README.

## Acceptance criteria

- Each selected Coin has a continuous approach, a visible collect pop/burst, and
  a smooth reward animation instead of a static overlay.
- The Coin remains centered, disappears after collect, and never appears abruptly.
- The reward renders the configured numeric value, including all digits `0`–`9`,
  without silent clipping.
- Pickup audio is synchronized, original audio ducks only briefly, and silent
  inputs produce playable Chime-only audio.
- Single and overlapping passages render without broken filter graphs, label
  collisions, or changed clip ordering/merging behavior.
- All rendered segments have concat-compatible audio parameters regardless of
  source-audio availability.

## Validation

- Run `npm test`, including required FFmpeg fixtures for overlapping effects and
  real-audio/silent-source variants.
- Run `npm run build` for strict TypeScript validation.
- Execute fixture rendering with the Debian Bookworm FFmpeg provided by Docker and
  use FFprobe to verify duration plus video and audio streams.
