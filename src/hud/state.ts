import type { HudTimeline, HudTrackSample, MappedGameEvent } from "../domain.js";
import { distanceMeters } from "../geometry.js";

export interface LocalPoint {
  x: number;
  y: number;
}

export interface HudState {
  riderPoint: LocalPoint;
  riderDirection: LocalPoint;
  northDirection: LocalPoint;
  route: LocalPoint[];
  items: LocalPoint[];
  next?: { event: MappedGameEvent; distanceMeters: number };
  feedback?: MappedGameEvent;
  recentEvents: MappedGameEvent[];
}

const degrees = Math.PI / 180;

export const projectLocal = (origin: HudTrackSample, latitude: number, longitude: number): LocalPoint => ({
  x: (longitude - origin.longitude) * degrees * 6_371_000 * Math.cos(origin.latitude * degrees),
  y: (latitude - origin.latitude) * degrees * 6_371_000
});

export const rotateHeadingUp = (point: LocalPoint, headingRadians: number): LocalPoint => ({
  x: point.x * Math.cos(headingRadians) - point.y * Math.sin(headingRadians),
  y: -(point.x * Math.sin(headingRadians) + point.y * Math.cos(headingRadians))
});

export const interpolateRider = (track: HudTrackSample[], videoSecond: number): HudTrackSample => {
  const afterIndex = track.findIndex((point) => point.videoSecond >= videoSecond);
  if (afterIndex <= 0) return track[0];
  if (afterIndex === -1) return track.at(-1)!;
  const before = track[afterIndex - 1];
  const after = track[afterIndex];
  const span = after.videoSecond - before.videoSecond;
  const fraction = span === 0 ? 0 : (videoSecond - before.videoSecond) / span;
  return {
    latitude: before.latitude + (after.latitude - before.latitude) * fraction,
    longitude: before.longitude + (after.longitude - before.longitude) * fraction,
    videoSecond
  };
};

export const headingAt = (track: HudTrackSample[], videoSecond: number): number => {
  const matchedIndex = track.findIndex((point) => point.videoSecond >= videoSecond);
  const afterIndex = matchedIndex === -1 ? track.length - 1 : Math.max(1, matchedIndex);
  const before = track[afterIndex - 1];
  const after = track[afterIndex];
  const local = projectLocal(before, after.latitude, after.longitude);
  return Math.atan2(local.x, local.y);
};

const withinRange = (point: LocalPoint, rangeMeters: number): boolean =>
  Math.abs(point.x) <= rangeMeters && Math.abs(point.y) <= rangeMeters;

export const deriveHudState = (
  timeline: HudTimeline,
  videoSecond: number,
  rangeMeters: number,
  eventFeedDurationSeconds: number,
  eventFeedMaxItems: number,
  segment?: { start: number; end: number }
): HudState => {
  const rider = interpolateRider(timeline.track, videoSecond);
  const reference = segment ? interpolateRider(timeline.track, segment.start) : rider;
  const segmentHeading = headingAt(timeline.track, segment?.start ?? videoSecond);
  const riderHeading = headingAt(timeline.track, videoSecond);
  const transform = (latitude: number, longitude: number): LocalPoint =>
    rotateHeadingUp(projectLocal(reference, latitude, longitude), segmentHeading);
  const feedback = [...timeline.events].reverse().find((event) => videoSecond >= event.videoSecond && videoSecond < event.videoSecond + 1);
  const track = segment
    ? timeline.track.filter((point) => point.videoSecond >= segment.start && point.videoSecond <= segment.end)
    : timeline.track;
  const route = track
    .map((point) => transform(point.latitude, point.longitude))
    .filter((point) => withinRange(point, rangeMeters));
  const events = segment
    ? timeline.events.filter((event) => event.videoSecond >= segment.start && event.videoSecond <= segment.end)
    : timeline.events;
  const items = events
    .filter((event) => event.videoSecond > videoSecond)
    .map((event) => {
      const position = interpolateRider(timeline.track, event.videoSecond);
      return transform(position.latitude, position.longitude);
    })
    .filter((point) => withinRange(point, rangeMeters));
  const nextEvent = timeline.events.find((event) => event.videoSecond > videoSecond);
  const next = nextEvent
    ? {
        event: nextEvent,
        distanceMeters: distanceMeters(rider.latitude, rider.longitude, nextEvent.latitude, nextEvent.longitude)
      }
    : undefined;
  const recentEvents = timeline.events
    .filter((event) => videoSecond >= event.videoSecond && videoSecond < event.videoSecond + eventFeedDurationSeconds)
    .sort((left, right) => right.videoSecond - left.videoSecond)
    .slice(0, eventFeedMaxItems);
  return {
    riderPoint: transform(rider.latitude, rider.longitude),
    riderDirection: rotateHeadingUp(
      { x: Math.sin(riderHeading), y: Math.cos(riderHeading) },
      segmentHeading
    ),
    northDirection: rotateHeadingUp({ x: 0, y: 1 }, segmentHeading),
    route,
    items,
    next,
    feedback,
    recentEvents
  };
};
