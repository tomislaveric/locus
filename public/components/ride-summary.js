const formatNumber = (value, maximumFractionDigits = 0) => new Intl.NumberFormat("en-US", {
  maximumFractionDigits
}).format(value);

export const rideDistanceLabel = (distanceMeters) => Number.isFinite(distanceMeters)
  ? `${formatNumber(distanceMeters / 1000, 1)} KM`
  : "DISTANCE UNAVAILABLE";

export const rideDurationLabel = (durationSeconds) => {
  if (!Number.isFinite(durationSeconds)) return "DURATION UNAVAILABLE";
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};

export const RideSummary = (activity) => `
  <header class="ride-detail-summary">
    <p class="ride-detail-eyebrow">RIDE COMPLETE</p>
    <h1 id="ride-detail-title">${rideDistanceLabel(activity.distanceMeters)}</h1>
    <p class="ride-detail-duration">${rideDurationLabel(activity.durationSeconds)}</p>
  </header>
`;
