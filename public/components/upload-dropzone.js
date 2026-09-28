const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&#39;"
})[character]);

export const UploadDropzone = ({ id, name, label, detail, accept, required = false }) => `
  <div class="upload-dropzone" data-upload-dropzone>
    <input id="${escapeHtml(id)}" name="${escapeHtml(name)}" type="file" accept="${escapeHtml(accept)}"${required ? " required" : ""}>
    <label for="${escapeHtml(id)}">
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(detail)}</span>
      <b>CHOOSE FILE</b>
    </label>
  </div>
`;

export const mountUploadDropzone = (mountPoint, onFileSelected) => {
  const input = mountPoint.querySelector("input[type=file]");
  const dropzone = mountPoint.closest("[data-upload-dropzone]") ?? mountPoint;
  const select = (file) => {
    if (file) onFileSelected(file);
  };
  input?.addEventListener("change", () => select(input.files?.[0]));
  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragging");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-dragging"));
  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragging");
    select(event.dataTransfer?.files?.[0]);
  });
};
