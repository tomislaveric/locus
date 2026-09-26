import { describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runCommand } from "./commands.js";
import {
  buildClipIntervals,
  buildHudSegmentFilter,
  buildSegmentFilter,
  normalizeMediaInfo,
  planCoinEffect,
  validateClipIntervals,
  renderSelectedClips,
  validateRenderedOutput
} from "./video.js";

describe("buildClipIntervals", () => {
  it("clamps windows before merging overlapping passages", () => {
    const intervals = buildClipIntervals(
      [
        { id: "start", sourceId: "start", type: "collectible_collected" as const, collectible: { name: "start", type: "coin" as const }, value: 100, latitude: 0, longitude: 0, activityTimestamp: 500, videoSecond: 0.5 },
        { id: "overlap", sourceId: "overlap", type: "collectible_collected" as const, collectible: { name: "overlap", type: "coin" as const }, value: 200, latitude: 0, longitude: 0, activityTimestamp: 4_000, videoSecond: 4 },
        { id: "separate", sourceId: "separate", type: "collectible_collected" as const, collectible: { name: "separate", type: "coin" as const }, value: 300, latitude: 0, longitude: 0, activityTimestamp: 15_000, videoSecond: 15 }
      ],
      20
    );

    expect(intervals).toHaveLength(2);
    expect(intervals[0]).toMatchObject({ start: 0, end: 7, events: [{ id: "start" }, { id: "overlap" }] });
    expect(intervals[1]).toMatchObject({ start: 12, end: 18, events: [{ id: "separate" }] });
  });

  describe("renderer validation", () => {
    const event = { id: "coin", sourceId: "coin", type: "collectible_collected" as const, collectible: { name: "coin", type: "coin" as const }, value: 1, latitude: 0, longitude: 0, activityTimestamp: 0, videoSecond: 2 };

    it("normalizes supported source media and records optional audio", () => {
      expect(normalizeMediaInfo({
        format: { duration: "12.5" },
        streams: [
          { codec_type: "video", codec_name: "h264", width: 1920, height: 1080, r_frame_rate: "60000/1001", pix_fmt: "yuv420p" },
          { codec_type: "audio", codec_name: "aac", sample_rate: "48000", channels: 2 }
        ]
      })).toEqual({
        duration: 12.5,
        width: 1920,
        height: 1080,
        videoCodec: "h264",
        pixelFormat: "yuv420p",
        frameRate: 60000 / 1001,
        audio: { codec: "aac", sampleRate: 48000, channels: 2 }
      });
    });

    it("renders audio-bearing and silent generated sources with validated AAC output and cleanup", async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), "post-ride-render-"));
      const event = { id: "coin", sourceId: "coin", type: "collectible_collected" as const, collectible: { name: "coin", type: "coin" as const }, value: 1, latitude: 0, longitude: 0, activityTimestamp: 0, videoSecond: 1 };
      try {
        for (const withAudio of [true, false]) {
          const source = path.join(directory, withAudio ? "source-with-audio.mp4" : "source-silent.mp4");
          const output = path.join(directory, withAudio ? "output-with-audio.mp4" : "output-silent.mp4");
          const args = [
            "-y",
            "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30",
            ...(withAudio ? ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000"] : []),
            "-t", "2",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            ...(withAudio ? ["-c:a", "aac", "-shortest"] : ["-an"]),
            source
          ];
          await runCommand("ffmpeg", args, 30_000);
          const summary = await renderSelectedClips(source, output, [event], 2, directory, 30_000);
          const validation = await validateRenderedOutput(output, summary.expectedDuration, 30_000);

          expect(summary.segmentCount).toBe(1);
          expect(validation).toMatchObject({ valid: true, hasVideo: true, hasAudio: true });
        }
        expect((await readdir(directory)).some((entry) => entry.startsWith("render-"))).toBe(false);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }, 120_000);

    it("rejects unsupported source codecs before rendering", () => {
      expect(() => normalizeMediaInfo({
        format: { duration: "12" },
        streams: [{ codec_type: "video", codec_name: "vp9", width: 1280, height: 720 }]
      })).toThrow("Unsupported media");
    });

    it("rejects empty, malformed, unordered, and overlapping plans", () => {
      expect(() => validateClipIntervals([], 10)).toThrow("select at least one");
      expect(() => validateClipIntervals([{ start: 3, end: 3, events: [event] }], 10)).toThrow("invalid timestamps");
      expect(() => validateClipIntervals([
        { start: 4, end: 6, events: [event] },
        { start: 3, end: 5, events: [event] }
      ], 10)).toThrow("ordered and non-overlapping");
      expect(() => validateClipIntervals([{ start: 0, end: 2, events: [{ ...event, id: "" }] }], 10)).toThrow("valid event IDs");
    });
  });

  it("adapts planner segment IDs back to chronologically ordered events", () => {
    const intervals = buildClipIntervals(
      [
        { id: "later", sourceId: "later", type: "collectible_collected" as const, collectible: { name: "later", type: "coin" as const }, value: 100, latitude: 0, longitude: 0, activityTimestamp: 20_000, videoSecond: 20 },
        { id: "first", sourceId: "first", type: "collectible_collected" as const, collectible: { name: "first", type: "coin" as const }, value: 100, latitude: 0, longitude: 0, activityTimestamp: 18_000, videoSecond: 18 }
      ],
      30
    );

    expect(intervals).toEqual([
      expect.objectContaining({ start: 15, end: 23, events: [expect.objectContaining({ id: "first" }), expect.objectContaining({ id: "later" })] })
    ]);
  });

  describe("HUD segment planning", () => {
    it("overlays compact HUD layers while preserving source audio", () => {
      const plan = buildHudSegmentFilter(6, true, { map: true, feed: true });
      expect(plan.filter).toContain("overlay=W-w-24:H-h-24");
      expect(plan.filter).toContain("overlay=W-w-24:24");
      expect(plan.filter).toContain("[0:a]atrim=duration=6.000");
      expect(plan.filter).not.toContain("amix=");
      expect(plan.videoOutput).toBe("[hud-feed]");
    });

    it("keeps a no-overlay plan when both visual features are disabled", () => {
      const plan = buildHudSegmentFilter(6, false, { map: false, feed: false });
      expect(plan.videoOutput).toBe("[base]");
      expect(plan.filter).toContain("anullsrc=r=48000:cl=stereo");
      expect(plan.filter).not.toContain("overlay=");
    });
  });
});

describe("Coin effect planning", () => {
  it("clamps the approach and later phases to the clip boundaries", () => {
    expect(planCoinEffect(0.2, 6)).toMatchObject({ approachStart: 0, collectEnd: 0.45, rewardEnd: 1.15 });
    expect(planCoinEffect(5.9, 6)).toMatchObject({ approachStart: 2.9, collectEnd: 6, rewardEnd: 6 });
  });

  it("keeps overlapping effect branches and audio Chimes independent", () => {
    const plan = buildSegmentFilter(
      {
        start: 10,
        end: 16,
        events: [
          { id: "one", sourceId: "one", type: "collectible_collected" as const, collectible: { name: "one", type: "coin" as const }, value: 123, latitude: 0, longitude: 0, activityTimestamp: 12_000, videoSecond: 12 },
          { id: "two", sourceId: "two", type: "collectible_collected" as const, collectible: { name: "two", type: "coin" as const }, value: 456, latitude: 0, longitude: 0, activityTimestamp: 12_100, videoSecond: 12.1 }
        ]
      },
      false
    );

    expect(plan.filter).toContain("[approach0]");
    expect(plan.filter).toContain("[approach1]");
    expect(plan.filter).toContain("[chime0]");
    expect(plan.filter).toContain("[chime1]");
    expect(plan.filter).toContain("amix=inputs=3");
    expect(plan.filter).toContain("eof_action=pass:repeatlast=0");
    expect(plan.filter).toContain("1+2*(t-1.000)/1.000");
    expect(plan.filter).toContain("240*(3+0.35*t/0.25)");
    expect(plan.audioOutput).toBe("[aout]");
  });
});
