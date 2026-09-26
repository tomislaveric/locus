import type { GameEvent } from "./domain.js";
import { UserInputError } from "./errors.js";

export interface HighlightPlannerOptions {
  preRollSeconds: number;
  postRollSeconds: number;
  videoDurationSeconds: number;
}

export interface HighlightSegment {
  startSecond: number;
  endSecond: number;
  eventIds: string[];
}

export interface HighlightPlan {
  segments: HighlightSegment[];
  totalDurationSeconds: number;
}

const eventOrder = (left: GameEvent, right: GameEvent): number => {
  if (left.videoSecond !== right.videoSecond) return left.videoSecond - right.videoSecond;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
};

const validateOptions = (options: HighlightPlannerOptions): void => {
  if (typeof options !== "object" || options === null) {
    throw new UserInputError("Planner options must be an object.");
  }
  for (const [name, value] of [
    ["preRollSeconds", options.preRollSeconds],
    ["postRollSeconds", options.postRollSeconds],
    ["videoDurationSeconds", options.videoDurationSeconds]
  ]) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new UserInputError(`${name} must be a finite, non-negative number.`);
    }
  }
};

export const planHighlights = (selectedEvents: readonly GameEvent[], options: HighlightPlannerOptions): HighlightPlan => {
  validateOptions(options);

  const eventIds = new Set<string>();
  const uniqueEvents = [...selectedEvents]
    .filter((event) => Number.isFinite(event.videoSecond) && event.videoSecond >= 0 && event.videoSecond <= options.videoDurationSeconds)
    .sort(eventOrder)
    .filter((event) => {
      if (eventIds.has(event.id)) return false;
      eventIds.add(event.id);
      return true;
    });

  const segments = uniqueEvents.reduce<HighlightSegment[]>((planned, event) => {
    const window: HighlightSegment = {
      startSecond: Math.max(0, event.videoSecond - options.preRollSeconds),
      endSecond: Math.min(options.videoDurationSeconds, event.videoSecond + options.postRollSeconds),
      eventIds: [event.id]
    };
    const previous = planned.at(-1);
    if (previous && window.startSecond <= previous.endSecond) {
      previous.endSecond = Math.max(previous.endSecond, window.endSecond);
      previous.eventIds.push(event.id);
    } else {
      planned.push(window);
    }
    return planned;
  }, []);

  return {
    segments,
    totalDurationSeconds: segments.reduce((total, segment) => total + segment.endSecond - segment.startSecond, 0)
  };
};
