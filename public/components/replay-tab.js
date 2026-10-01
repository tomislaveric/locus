import { mountReplayMap, mountReplayStill } from "./activity-replay-map.js";
import { getActivityLabel } from "./activity-labels.js";
import { CollectionPanel, collectionProgressLabel, collectionProgressPercent, collectionStateLabel } from "./shared/collection-panel.js";

/** Ride Detail replay: the shared Staza map with an activity route, position and collection. */
export const ReplayTab = () => `
  <section class="activity-replay activity-replay-map" aria-label="Animated route replay">
    <div class="activity-replay-map-canvas staza-map" data-replay-map></div>
    <div class="activity-replay-panel" data-replay-panel hidden></div>
    <button class="activity-replay-play" type="button" aria-label="Play replay" aria-pressed="false" disabled>
      <img src="/assets/activity-detail-play.svg" width="16" height="16" alt="">
    </button>
  </section>
`;

/** A static Staza map thumbnail showing the completed activity result (route + collected). */
export const ReplayStill = ({ canvasLabel = "Activity route", className = "" } = {}) => `
  <div class="activity-replay-still ${className}" data-replay-still role="img" aria-label="${canvasLabel}"></div>
`;

export const mountReplayStillCard = (host, replay, basemap) => {
  const container = host.querySelector("[data-replay-still]");
  if (!container) return () => {};
  const mounted = mountReplayStill({
    container,
    activity: replay.activity,
    activityResult: replay.activityResult,
    basemap
  }).catch(() => {});
  return () => mounted.then((instance) => instance?.destroy?.()).catch(() => {});
};

const metersBetween = (left, right) => {
  const radians = Math.PI / 180;
  const latitudeDelta = (right.latitude - left.latitude) * radians;
  const longitudeDelta = (right.longitude - left.longitude) * radians;
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(left.latitude * radians) * Math.cos(right.latitude * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/** The activity timestamp of the route point that passes closest to a collectible. */
export const closestApproachTimestamp = (route, collectible) => {
  let best;
  let bestDistance = Infinity;
  for (const point of route ?? []) {
    const distance = metersBetween(point, collectible);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point;
    }
  }
  return best?.timestampMs;
};

/**
 * The overlay rows for a replay: collected collectibles first (flipping to `completed` when the
 * replay reaches their collection time), then near misses (flipping to `nearby-miss` at their
 * closest-approach time, derived client-side from the route geometry and collectible position).
 */
export const replayPanelRows = (replay) => {
  const { activity, activityResult } = replay;
  const collectiblesById = new Map((activityResult.collectibles ?? []).map((collectible) => [collectible.id, collectible]));
  const collected = (activityResult.events ?? []).map((event) => ({
    id: event.sourceId,
    name: event.collectible?.name || event.sourceId,
    rarity: event.collectible?.rarity,
    kind: "collectible",
    reachMs: event.activityTimestamp
  }));
  const nearMisses = (activityResult.nearMisses ?? []).map((nearMiss) => {
    const collectible = collectiblesById.get(nearMiss.collectibleId);
    return {
      id: nearMiss.collectibleId,
      name: nearMiss.name,
      rarity: nearMiss.rarity,
      kind: "near-miss",
      reachMs: collectible ? closestApproachTimestamp(activity.route, collectible) : undefined
    };
  });
  return [...collected, ...nearMisses];
};

export const rowStateAt = (row, timestampMs) => {
  if (row.reachMs === undefined || timestampMs < row.reachMs) return "unvisited";
  return row.kind === "collectible" ? "completed" : "nearby-miss";
};

const replayPanelTitle = (activity) => activity?.title || getActivityLabel(activity?.type);

const mountReplayPanel = (host, replay) => {
  const rows = replayPanelRows(replay);
  const total = rows.filter((row) => row.kind === "collectible").length;
  host.hidden = false;
  host.innerHTML = CollectionPanel({
    title: replayPanelTitle(replay.activity),
    description: replay.activity?.description,
    progress: { collected: 0, total },
    closable: true,
    ariaLabel: "Replay collection",
    emptyMessage: "No collectibles on this activity.",
    rows: rows.map((row) => ({ id: row.id, name: row.name, rarity: row.rarity, state: "unvisited" }))
  });
  host.querySelector("[data-world-close]")?.addEventListener("click", () => {
    host.hidden = true;
  });

  const rowElements = [...host.querySelectorAll("[data-collection-row]")];
  const labelElement = host.querySelector("[data-collection-progress-label]");
  const percentElement = host.querySelector("[data-collection-progress-percent]");
  const barElement = host.querySelector("[data-collection-progress-bar]");

  return (timestampMs) => {
    let collected = 0;
    rowElements.forEach((element, index) => {
      const row = rows[index];
      const state = rowStateAt(row, timestampMs);
      if (row.kind === "collectible" && state === "completed") collected += 1;
      element.classList.toggle("is-found", state === "completed");
      const swatch = element.querySelector(".collectible-swatch");
      if (swatch) {
        swatch.classList.toggle("is-visited", state === "completed");
        swatch.classList.toggle("is-unvisited", state !== "completed");
      }
      const stateElement = element.querySelector(".quest-collectible-state");
      if (stateElement) stateElement.textContent = collectionStateLabel(state);
    });
    const progress = { collected, total };
    const percent = collectionProgressPercent(progress);
    if (labelElement) labelElement.textContent = collectionProgressLabel(progress);
    if (percentElement) percentElement.textContent = percent;
    if (barElement) barElement.style.width = percent;
  };
};

export const mountReplayTab = (mountPoint, replay, basemap) => {
  const button = mountPoint.querySelector(".activity-replay-play");
  const container = mountPoint.querySelector("[data-replay-map]");
  const panelHost = mountPoint.querySelector("[data-replay-panel]");
  const setPlayingUi = (isPlaying) => {
    button.classList.toggle("is-playing", isPlaying);
    button.setAttribute("aria-label", isPlaying ? "Pause replay" : "Play replay");
    button.setAttribute("aria-pressed", String(isPlaying));
  };

  const updatePanel = panelHost ? mountReplayPanel(panelHost, replay) : () => {};

  const mounted = mountReplayMap({
    container,
    activity: replay.activity,
    activityResult: replay.activityResult,
    basemap,
    onPlaybackStateChange: setPlayingUi,
    onProgress: updatePanel,
    onReady: () => button.removeAttribute("disabled")
  });

  let player;
  mounted.then((instance) => {
    player = instance;
    player.play();
  }).catch(() => {
    container.innerHTML = '<p class="activity-detail-state activity-detail-error" role="alert">Unable to load the replay map.</p>';
  });

  button.addEventListener("click", () => {
    if (!player) return;
    if (button.getAttribute("aria-pressed") === "true") player.pause();
    else player.play();
  });

  return () => mounted.then((instance) => instance.destroy()).catch(() => {});
};
