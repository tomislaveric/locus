const formatNumber = (value, maximumFractionDigits = 0) => new Intl.NumberFormat("en-US", {
  maximumFractionDigits
}).format(value);

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

const durationLabel = (seconds) => {
  if (!Number.isFinite(seconds)) return undefined;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const dateLabel = (startedAt) => new Intl.DateTimeFormat("en-US", {
  day: "2-digit", month: "short", weekday: "short"
}).format(new Date(startedAt)).toUpperCase();

const eventsForActivities = (activities) => activities.flatMap((activity) => activity.events ?? []);
const replayForHome = (activity) => {
  const replay = activity?.replay;
  if (
    !Array.isArray(replay?.activity?.route)
    || replay.activity.route.length < 2
    || !Array.isArray(replay.activityResult?.collectibles)
    || !Array.isArray(replay.activityResult?.events)
  ) return undefined;
  return replay;
};

export const homeViewModel = (progress, activities) => {
  const events = eventsForActivities(activities);
  const latest = activities[0];
  const totalDistanceMeters = activities.reduce((total, activity) => total + (activity.distanceMeters ?? 0), 0);
  return {
    progress: {
      ...progress,
      remainingXp: Math.max(0, progress.nextLevelXp - progress.currentLevelXp)
    },
    stats: {
      totalXp: progress.totalXp,
      distanceMeters: totalDistanceMeters,
      rareFinds: events.filter((event) => event.collectible?.rarity === "rare").length,
      totalCollected: activities.reduce((total, activity) => total + activity.collectedCount, 0)
    },
    latest
  };
};

export const HomePlayerProgress = ({ progress, stats }) => `
  <section class="home-hero" aria-label="Player progress">
    <div class="home-progress">
      <strong class="home-level">${formatNumber(progress.level)}</strong>
      <div class="home-progress-details">
        <p class="home-section-label">EXPLORER · LEVEL ${formatNumber(progress.level)}</p>
        <p class="home-xp"><strong>${formatNumber(progress.currentLevelXp)}</strong> <span>/ ${formatNumber(progress.nextLevelXp)} XP</span></p>
        <div class="home-xp-track" role="progressbar" aria-valuemin="0" aria-valuemax="${progress.nextLevelXp}" aria-valuenow="${progress.currentLevelXp}">
          <span style="width: ${Math.min(100, Math.max(0, progress.progressToNextLevel * 100))}%"></span>
        </div>
        <p class="home-progress-caption">${formatNumber(progress.remainingXp)} XP to Level ${formatNumber(progress.level + 1)}</p>
      </div>
    </div>
    ${HomeStats(stats)}
  </section>
`;

export const HomeStats = (stats) => `
  <dl class="home-stats">
    <div><dt>TOTAL XP</dt><dd>${formatNumber(stats.totalXp)}</dd></div>
    <div><dt>DISTANCE</dt><dd>${formatNumber(stats.distanceMeters / 1000, 1)} km</dd></div>
    <div><dt>RARE FINDS</dt><dd>${formatNumber(stats.rareFinds)}</dd></div>
    <div><dt>COLLECTED</dt><dd>${formatNumber(stats.totalCollected)}</dd></div>
  </dl>
`;

const foundItems = (events) => events.slice(0, 4).map((event) => {
  const rarity = event.collectible?.rarity ?? event.collectible?.type ?? "common";
  return `<li class="home-found-item rarity-${escapeHtml(rarity)}">${escapeHtml(event.collectible?.name ?? event.sourceId)}</li>`;
}).join("");

export const HomeRecentActivity = (activity) => {
  if (!activity) {
    return `
      <section class="home-recent-activity" aria-labelledby="recent-activity-title">
        <div class="home-section-heading"><h1 id="recent-activity-title">RECENT ACTIVITY</h1></div>
        <div class="home-empty-state">
          <p class="home-section-label">NO COMPLETED ACTIVITIES YET</p>
          <p>Complete a FIT activity to see your latest activity, collectibles, and XP here.</p>
        </div>
      </section>
    `;
  }
  const details = [
    activity.durationSeconds === undefined ? undefined : durationLabel(activity.durationSeconds),
    `${activity.collectedCount} collected`,
    activity.hasVideo ? "POV available" : undefined
  ].filter(Boolean);
  const replay = replayForHome(activity);
  return `
    <section class="home-recent-activity" aria-labelledby="recent-activity-title">
      <div class="home-section-heading"><h1 id="recent-activity-title">RECENT ACTIVITY</h1></div>
      <button class="home-activity-card" type="button" data-activity-id="${escapeHtml(activity.id)}" aria-label="View recent activity">
        <header class="home-activity-header">
          <div>
            <p class="home-section-label">${dateLabel(activity.startedAt)}</p>
            <p class="home-distance">${activity.distanceMeters === undefined ? "—" : formatNumber(activity.distanceMeters / 1000, 1)} <span>KM</span></p>
          </div>
          <div class="home-earned"><span>XP EARNED</span><strong>+${formatNumber(activity.xpEarned)}</strong></div>
        </header>
        ${replay ? ReplayStill({ canvasLabel: "Recent activity route", className: "home-activity-replay" }) : ""}
        <div class="home-activity-details">${details.map((detail) => `<span>${escapeHtml(detail)}</span>`).join("<i aria-hidden=\"true\">·</i>")}</div>
        ${activity.events?.length ? `<div class="home-found"><span>FOUND</span><ul>${foundItems(activity.events)}</ul></div>` : '<p class="home-no-finds">No collectibles were recorded on this activity.</p>'}
      </button>
    </section>
  `;
};

export const HomePage = (model) => `
  <section class="home-page">
    ${HomePlayerProgress(model)}
    ${HomeRecentActivity(model.latest)}
  </section>
`;

const responseJson = async (response) => {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Unable to load Home data.");
  return body;
};

export const mountHomePage = async (mountPoint, onSelectActivity) => {
  mountPoint.innerHTML = '<section class="home-page"><p class="home-loading" role="status">Loading Home...</p></section>';
  try {
    const [progress, history] = await Promise.all([
      fetch("/api/player/progress").then(responseJson),
      fetch("/api/activities").then(responseJson)
    ]);
    const activities = await Promise.all(history.map(async (activity) => ({
      ...activity,
      ...(await fetch(`/api/activities/${encodeURIComponent(activity.id)}`).then(responseJson))
    })));
    const model = homeViewModel(progress, activities);
    mountPoint.innerHTML = HomePage(model);
    const replay = replayForHome(model.latest);
    if (replay) {
      const basemap = await fetch("/api/world/basemap").then(responseJson).catch(() => undefined);
      mountReplayStillCard(mountPoint.querySelector(".home-activity-card"), replay, basemap);
    }
    mountPoint.querySelector("[data-activity-id]")?.addEventListener("click", () => {
      onSelectActivity?.(model.latest.id);
    });
  } catch (error) {
    mountPoint.innerHTML = `<section class="home-page"><p class="home-load-error" role="alert">Unable to load Home: ${escapeHtml(error.message)}</p></section>`;
  }
};
import { ReplayStill, mountReplayStillCard } from "./replay-tab.js";
