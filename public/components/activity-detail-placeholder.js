const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

export const RideDetailPlaceholder = (activityId) => `
  <section class="activity-detail-placeholder" aria-labelledby="activity-detail-title">
    <p class="activities-section-label">ACTIVITY DETAIL</p>
    <h1 id="activity-detail-title">Activity selected</h1>
    <p>Activity <code>${escapeHtml(activityId)}</code> is ready for the Activity Detail experience.</p>
  </section>
`;

export const mountRideDetailPlaceholder = (mountPoint, activityId) => {
  mountPoint.innerHTML = RideDetailPlaceholder(activityId);
};
