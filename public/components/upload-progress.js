export const UploadProgress = ({ label }) => `
  <div class="upload-progress" role="status" aria-live="polite">
    <span class="upload-progress-indicator" aria-hidden="true"></span>
    <span>${label}</span>
  </div>
`;
