const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

export const UploadStatus = ({ title, detail, actionLabel }) => `
  <section class="upload-status" role="status" aria-live="polite">
    <div class="upload-status-check" aria-hidden="true">✓</div>
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(detail)}</p>
    ${actionLabel ? `<button class="upload-primary-button" type="button" data-upload-complete>${escapeHtml(actionLabel)}</button>` : ""}
  </section>
`;
