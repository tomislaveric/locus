import { CollectedTab } from "./collected-tab.js";
import { canonicalRarity } from "./collected-list.js";
import { NearMissesTab } from "./near-misses-tab.js";
import { RideProgress } from "./ride-progress.js";
import { ReplayTab, mountReplayTab } from "./replay-tab.js";
import { RideSummary } from "./ride-summary.js";
import { RideTabs } from "./ride-tabs.js";
import { VideoTab, mountVideoTab } from "./video-tab.js";

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

export const nearMissInputs = (activity) => {
  const replay = replayInputs(activity);
  if (!replay?.activityResult.nearMisses.every((nearMiss) => (
    typeof nearMiss?.collectibleId === "string"
    && typeof nearMiss.name === "string"
    && Number.isFinite(nearMiss.value)
    && Number.isFinite(nearMiss.minimumDistanceMeters)
    && (nearMiss.rarity === undefined || canonicalRarity(nearMiss.rarity) !== undefined)
  ))) return undefined;
  return replay;
};

const ReplayUnavailable = () => '<p class="ride-detail-state" role="status">Replay data is unavailable for this legacy ride.</p>';
const NearMissesUnavailable = () => '<p class="ride-detail-state near-misses-unavailable" role="status">Near-miss data is unavailable for this legacy ride.</p>';

export const RideDetailPage = (activity, progress, selectedTab = "replay") => {
  const replay = replayInputs(activity);
  const nearMissReplay = nearMissInputs(activity);
  const tabContent = selectedTab === "collected"
    ? CollectedTab(activity, replay)
    : selectedTab === "near-misses"
      ? (nearMissReplay ? NearMissesTab(nearMissReplay) : NearMissesUnavailable())
      : selectedTab === "video"
        ? VideoTab(activity)
        : (replay ? ReplayTab() : ReplayUnavailable());
  return `
    <section class="ride-detail-page" aria-labelledby="ride-detail-title">
      <button class="ride-detail-back" type="button"><img src="/assets/ride-detail-back.svg" width="16" height="16" alt="">BACK</button>
      ${RideSummary(activity)}
      ${RideProgress(activity, progress)}
      ${RideTabs(activity, selectedTab, nearMissReplay?.activityResult.nearMisses.length)}
      <div class="ride-detail-tab-content">${tabContent}</div>
    </section>
  `;
};

export const mountRideDetailPage = async (mountPoint, activityId, onBack) => {
  mountPoint.innerHTML = '<section class="ride-detail-page"><p class="ride-detail-state" role="status">Loading ride detail...</p></section>';
  try {
    const [loadedActivity, progress] = await Promise.all([
      fetch(`/api/activities/${encodeURIComponent(activityId)}`).then(responseJson),
      fetch("/api/player/progress").then(responseJson)
    ]);
    let activity = loadedActivity;
    let selectedTab = "replay";
    let polling;
    const render = (tab) => {
      selectedTab = tab;
      clearTimeout(polling);
      mountPoint.innerHTML = RideDetailPage(activity, progress, selectedTab);
      mountPoint.querySelector(".ride-detail-back").addEventListener("click", onBack);
      mountPoint.querySelectorAll("[data-ride-tab]").forEach((tab) => {
        tab.addEventListener("click", () => render(tab.dataset.rideTab));
      });
      const replay = replayInputs(activity);
      if (selectedTab === "replay" && replay) mountReplayTab(mountPoint, replay);
      if (selectedTab === "video") {
        mountVideoTab(mountPoint, activity, (updatedActivity) => {
          activity = updatedActivity;
          render("video");
          if (activity.video?.state === "syncing" || activity.video?.state === "rendering") pollVideo();
        });
      }
    };
    const pollVideo = async () => {
      try {
        const response = await fetch(`/api/activities/${encodeURIComponent(activityId)}`);
        const updated = await responseJson(response);
        activity = updated;
        if (selectedTab === "video") render("video");
        if (activity.video?.state === "syncing" || activity.video?.state === "rendering") polling = setTimeout(pollVideo, 1500);
      } catch (error) {
        if (selectedTab === "video") mountPoint.querySelector(".ride-detail-tab-content").innerHTML = `<p class="ride-detail-state ride-detail-error" role="alert">${escapeHtml(error.message)}</p>`;
      }
    };
    render("replay");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load ride detail.";
    mountPoint.innerHTML = `<section class="ride-detail-page"><button class="ride-detail-back" type="button"><img src="/assets/ride-detail-back.svg" width="16" height="16" alt="">BACK</button><p class="ride-detail-state ride-detail-error" role="alert">${escapeHtml(message)}</p></section>`;
    mountPoint.querySelector(".ride-detail-back").addEventListener("click", onBack);
  }
};
