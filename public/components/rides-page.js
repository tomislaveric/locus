const formatNumber = (value, maximumFractionDigits = 0) => new Intl.NumberFormat("en-US", {
  maximumFractionDigits
}).format(value);

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

export const formatRideDate = (startedAt) => new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "short",
  weekday: "short",
  timeZone: "UTC"
}).format(new Date(startedAt)).toUpperCase();

export const formatRideDistance = (distanceMeters) => (
  Number.isFinite(distanceMeters) ? `${formatNumber(distanceMeters / 1000, 1)} km` : "Distance unavailable"
);

export const formatRideDuration = (durationSeconds) => {
  if (!Number.isFinite(durationSeconds)) return "Duration unavailable";
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};

export const ridesViewModel = (activities) => ({
  activities,
  stats: {
    count: activities.length,
    distanceMeters: activities.reduce((total, activity) => total + (activity.distanceMeters ?? 0), 0),
    xp: activities.reduce((total, activity) => total + activity.xpEarned, 0),
    collected: activities.reduce((total, activity) => total + activity.collectedCount, 0)
  }
});

export const RideStats = ({ count, distanceMeters, xp, collected }) => `
  <p class="rides-stats">
    <span>${formatNumber(count)} ${count === 1 ? "ride" : "rides"} ·</span>
    <strong>${formatNumber(distanceMeters / 1000, 1)} km</strong>
    <span>explored ·</span>
    <strong class="rides-stats-xp">+${formatNumber(xp)} XP</strong>
    <span>earned ·</span>
    <strong>${formatNumber(collected)}</strong>
    <span>collectibles found</span>
  </p>
`;

export const RideMeta = (activity) => `
  <div class="ride-meta">
    <div class="ride-meta-heading">
      <p>${escapeHtml(formatRideDate(activity.startedAt))}</p>
      ${activity.hasVideo ? '<span class="ride-pov">POV</span>' : ""}
    </div>
    <div class="ride-measurements">
      <strong>${escapeHtml(formatRideDistance(activity.distanceMeters).replace(" km", ""))}<span>${Number.isFinite(activity.distanceMeters) ? " km" : ""}</span></strong>
      <span>${escapeHtml(formatRideDuration(activity.durationSeconds))}</span>
    </div>
    <div class="ride-rewards">
      <span class="ride-xp-chip">+${formatNumber(activity.xpEarned)} XP</span>
      <span class="ride-collected-count">${formatNumber(activity.collectedCount)} ${activity.collectedCount === 1 ? "collectible" : "collectibles"}</span>
    </div>
  </div>
`;

export const RideCard = (activity) => `
  <button class="ride-card" type="button" data-activity-id="${escapeHtml(activity.id)}" aria-label="View ride from ${escapeHtml(formatRideDate(activity.startedAt))}">
    <div class="ride-card-content">${RideMeta(activity)}</div>
  </button>
`;

export const RideList = (activities) => `
  <div class="ride-list" aria-label="Ride history">
    ${activities.map(RideCard).join("")}
  </div>
`;

export const RidesEmptyState = () => `
  <section class="rides-empty-state">
    <p class="rides-section-label">NO COMPLETED RIDES YET</p>
    <p>Complete a FIT ride to see your exploration history here.</p>
  </section>
`;

export const RidesPage = (model) => `
  <section class="rides-page" aria-labelledby="rides-title">
    <header class="rides-header">
      <h1 id="rides-title">Rides</h1>
      <p>Your exploration history</p>
    </header>
    ${RideStats(model.stats)}
    ${model.activities.length ? RideList(model.activities) : RidesEmptyState()}
  </section>
`;

const responseJson = async (response) => {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Unable to load rides.");
  return body;
};

export const mountRidesPage = async (mountPoint, onSelectActivity) => {
  mountPoint.innerHTML = '<section class="rides-page"><p class="rides-loading" role="status">Loading rides...</p></section>';
  try {
    const activities = await fetch("/api/activities").then(responseJson);
    mountPoint.innerHTML = RidesPage(ridesViewModel(activities));
    mountPoint.querySelector(".ride-list")?.addEventListener("click", (event) => {
      const card = event.target.closest("[data-activity-id]");
      if (card) onSelectActivity(card.dataset.activityId);
    });
  } catch (error) {
    mountPoint.innerHTML = `<section class="rides-page"><p class="rides-load-error" role="alert">Unable to load rides: ${escapeHtml(error.message)}</p></section>`;
  }
};
