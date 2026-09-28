const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

export const UploadError = ({ message }) => `<p class="upload-error" role="alert">${escapeHtml(message)}</p>`;
