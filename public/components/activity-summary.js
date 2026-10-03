import { getActivityCompleteLabel } from "./activity-labels.js";
import { getAppLocale } from "../app-locales.js";

const formatNumber = (value, maximumFractionDigits = 0) => new Intl.NumberFormat(getAppLocale(), {
  maximumFractionDigits
}).format(value);

export const activityDistanceLabel = (distanceMeters) => Number.isFinite(distanceMeters)
  ? `${formatNumber(distanceMeters / 1000, 1)} KM`
  : "DISTANCE UNAVAILABLE";

export const activityDurationLabel = (durationSeconds) => {
  if (!Number.isFinite(durationSeconds)) return "DURATION UNAVAILABLE";
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};

export const ActivitySummary = (activity) => `
  <header class="activity-detail-summary">
    <p class="activity-detail-eyebrow">${getActivityCompleteLabel(activity.type).toUpperCase()}</p>
    <h1 id="activity-detail-title">${activityDistanceLabel(activity.distanceMeters)}</h1>
    <p class="activity-detail-duration">${activityDurationLabel(activity.durationSeconds)}</p>
  </header>
`;
