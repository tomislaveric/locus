import { UploadProgress } from "./upload-progress.js";

const labels = {
  validating: "Validating selected files",
  uploading: "Uploading files",
  processing: "Processing activity",
  persisting: "Saving your ride",
  syncing: "Synchronizing video"
};

export const ProcessingState = ({ state }) => `
  <section class="processing-state">
    <p>ADD ACTIVITY</p>
    <h1>${labels[state] ?? "Processing activity"}</h1>
    ${UploadProgress({ label: "This can take a moment. Progress updates as each stage completes." })}
  </section>
`;
