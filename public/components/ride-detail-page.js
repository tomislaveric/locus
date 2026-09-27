import { RideProgress } from "./ride-progress.js";
import { ReplayTab, mountReplayTab } from "./replay-tab.js";
import { RideSummary } from "./ride-summary.js";
import { RideTabs } from "./ride-tabs.js";

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

const responseJson = async (response) => {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Unable to load ride detail.");
  return body;
};

export const replayInputs = (activity) => {
  const replay = activity.replay;
  if (
    replay?.version !== 1
    || replay.activity?.source !== "fit"
    || !Array.isArray(replay.activity.route)
    || replay.activity.route.length < 2
    || !Array.isArray(replay.activityResult?.collectibles)
    || !Array.isArray(replay.activityResult?.events)
    || !Array.isArray(replay.activityResult?.nearMisses)
  ) return undefined;
  return replay;
};

export const RideDetailPage = (activity, progress) => `
  <section class="ride-detail-page" aria-labelledby="ride-detail-title">
    <button class="ride-detail-back" type="button"><img src="/assets/ride-detail-back.svg" width="16" height="16" alt="">BACK</button>
    ${RideSummary(activity)}
    ${RideProgress(activity, progress)}
    ${RideTabs(activity)}
    ${ReplayTab()}
  </section>
`;

export const mountRideDetailPage = async (mountPoint, activityId, onBack) => {
  mountPoint.innerHTML = '<section class="ride-detail-page"><p class="ride-detail-state" role="status">Loading ride detail...</p></section>';
  try {
    const [activity, progress] = await Promise.all([
      fetch(`/api/activities/${encodeURIComponent(activityId)}`).then(responseJson),
      fetch("/api/player/progress").then(responseJson)
    ]);
    const replay = replayInputs(activity);
    if (!replay) {
      mountPoint.innerHTML = `<section class="ride-detail-page"><button class="ride-detail-back" type="button"><img src="/assets/ride-detail-back.svg" width="16" height="16" alt="">BACK</button><p class="ride-detail-state" role="alert">Replay data is unavailable for this legacy ride.</p></section>`;
      mountPoint.querySelector(".ride-detail-back").addEventListener("click", onBack);
      return;
    }
    mountPoint.innerHTML = RideDetailPage(activity, progress);
    mountPoint.querySelector(".ride-detail-back").addEventListener("click", onBack);
    mountReplayTab(mountPoint, replay);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load ride detail.";
    mountPoint.innerHTML = `<section class="ride-detail-page"><button class="ride-detail-back" type="button"><img src="/assets/ride-detail-back.svg" width="16" height="16" alt="">BACK</button><p class="ride-detail-state ride-detail-error" role="alert">${escapeHtml(message)}</p></section>`;
    mountPoint.querySelector(".ride-detail-back").addEventListener("click", onBack);
  }
};
