const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&quot;", "'": "&#39;"
})[character]);

const formatSize = (bytes) => {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const UploadFileRow = ({ file, kind, removable = true }) => `
  <div class="upload-file-row">
    <div><strong>${escapeHtml(kind)}</strong><span>${escapeHtml(file.name)}${file.size ? ` · ${formatSize(file.size)}` : ""}</span></div>
    ${removable ? `<button type="button" data-remove-upload="${escapeHtml(kind)}" aria-label="Remove ${escapeHtml(kind)} file">REMOVE</button>` : ""}
  </div>
`;
