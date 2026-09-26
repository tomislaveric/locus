import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Activity, ActivityResult } from "../domain.js";
import { createDatabasePool } from "./database.js";
import { ActivityRepository } from "./activityRepository.js";
import { migrate } from "./migrate.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describePersistence = databaseUrl ? describe : describe.skip;
const playerId = "00000000-0000-4000-8000-000000000099";
const pool = databaseUrl ? createDatabasePool(databaseUrl) : undefined;
const repository = pool ? new ActivityRepository(pool, playerId, "Persistence test player") : undefined;

const activity = (id: string): Activity => ({
  id,
  source: "fit",
  startedAt: Date.parse("2026-01-02T03:04:05.000Z"),
  endedAt: Date.parse("2026-01-02T03:14:05.000Z"),
  route: [],
  distance: 12_345,
  duration: 600
});

const result = (activityId: string, value = 25): ActivityResult => ({
  activityId,
  distance: 12_345,
  duration: 600,
  collectedCount: 1,
  totalPoints: value,
  collectibles: [],
  events: [{
    id: "historic-coin",
    sourceId: "historic-coin",
    type: "collectible_collected",
    collectible: { name: "Historic Coin", type: "coin", rarity: "rare" },
    value,
    latitude: 55.6761,
    longitude: 12.5683,
    activityTimestamp: 1_790_090_187_586.4768
  }],
  nearMisses: []
});

describePersistence("ActivityRepository", () => {
  beforeEach(async () => {
    await migrate(pool!);
    await pool!.query("TRUNCATE activity_events, activities, players CASCADE");
    await repository!.initializeDefaultPlayer();
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("persists snapshots, orders history, and only awards an activity once", async () => {
    const firstId = "a".repeat(48);
    const first = await repository!.persistCompletedActivity(activity(firstId), result(firstId));
    const repeated = await repository!.persistCompletedActivity(activity(firstId), result(firstId));
    const secondId = "b".repeat(48);
    await repository!.persistCompletedActivity(activity(secondId), result(secondId, 0));

    expect(first.inserted).toBe(true);
    expect(repeated.inserted).toBe(false);
    expect(repeated.progress.totalXp).toBe(25);
    expect(await repository!.getProgress()).toMatchObject({ totalXp: 25, level: 1 });
    expect(await repository!.listActivities()).toEqual([
      expect.objectContaining({ id: secondId, xpEarned: 0, hasVideo: false }),
      expect.objectContaining({ id: firstId, distanceMeters: 12_345, durationSeconds: 600, collectedCount: 1 })
    ]);
    expect(await repository!.getActivity(firstId)).toMatchObject({
      id: firstId,
      xpEarned: 25,
      events: [expect.objectContaining({
        sourceId: "historic-coin",
        collectible: { name: "Historic Coin", type: "coin", rarity: "rare" },
        value: 25,
        activityTimestamp: 1_790_090_187_586.4768
      })]
    });
  });

  it("reconstructs durable state from a new repository and marks video separately", async () => {
    const id = "c".repeat(48);
    await repository!.persistCompletedActivity(activity(id), result(id, 100));
    await repository!.markActivityHasVideo(id);
    const restartedRepository = new ActivityRepository(pool!, playerId, "Persistence test player");

    expect(await restartedRepository.getProgress()).toMatchObject({
      totalXp: 100, level: 2, currentLevelXp: 0, nextLevelXp: 200, progressToNextLevel: 0
    });
    expect(await restartedRepository.getActivity(id)).toMatchObject({ hasVideo: true });
  });

  it("rolls back the activity and XP when an event insert fails", async () => {
    const id = "d".repeat(48);
    const invalid = result(id, 30);
    invalid.events.push({ ...invalid.events[0], id: "duplicate", value: 5 });

    await expect(repository!.persistCompletedActivity(activity(id), invalid)).rejects.toThrow();
    expect(await repository!.listActivities()).toEqual([]);
    expect(await repository!.getProgress()).toMatchObject({ totalXp: 0 });
  });
});
