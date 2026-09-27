const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

export const RideDetailPlaceholder = (activityId) => `
  <section class="ride-detail-placeholder" aria-labelledby="ride-detail-title">
    <p class="rides-section-label">RIDE DETAIL</p>
    <h1 id="ride-detail-title">Ride selected</h1>
    <p>Ride <code>${escapeHtml(activityId)}</code> is ready for the upcoming Ride Detail experience.</p>
  </section>
`;

export const mountRideDetailPlaceholder = (mountPoint, activityId) => {
  mountPoint.innerHTML = RideDetailPlaceholder(activityId);
};
