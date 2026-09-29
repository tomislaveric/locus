import { mountReplayMap, mountReplayStill } from "./activity-replay-map.js";

/** Ride Detail replay: the shared Staza map with an activity route, position and collection. */
export const ReplayTab = () => `
  <section class="activity-replay activity-replay-map" aria-label="Animated route replay">
    <div class="activity-replay-map-canvas staza-map" data-replay-map></div>
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

export const mountReplayTab = (mountPoint, replay, basemap) => {
  const button = mountPoint.querySelector(".activity-replay-play");
  const container = mountPoint.querySelector("[data-replay-map]");
  const setPlayingUi = (isPlaying) => {
    button.classList.toggle("is-playing", isPlaying);
    button.setAttribute("aria-label", isPlaying ? "Pause replay" : "Play replay");
    button.setAttribute("aria-pressed", String(isPlaying));
  };

  const mounted = mountReplayMap({
    container,
    activity: replay.activity,
    activityResult: replay.activityResult,
    basemap,
    onPlaybackStateChange: setPlayingUi,
    onReady: () => button.removeAttribute("disabled")
  });

  let player;
  mounted.then((instance) => {
    player = instance;
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
