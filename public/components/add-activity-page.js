import { ActivityFileUpload } from "./activity-file-upload.js";
import { ProcessingState } from "./processing-state.js";
import { UploadError } from "./upload-error.js";
import { UploadStatus } from "./upload-status.js";
import { VideoFileUpload } from "./video-file-upload.js";
import { mountUploadDropzone } from "./upload-dropzone.js";

const importKey = () => crypto.randomUUID();

const selectedFiles = ({ fit, video }) => `
  <div class="add-activity-files">
    <section><p>REQUIRED</p>${ActivityFileUpload(fit)}</section>
    <section><p>OPTIONAL</p>${VideoFileUpload({ file: video, optional: true })}</section>
  </div>
`;

const content = (state) => {
  if (state.complete) {
    return `${UploadStatus({
      title: "Ride Ready",
      detail: `${state.complete.collectedCount} collectible${state.complete.collectedCount === 1 ? "" : "s"} found along your route · +${state.complete.xpEarned} XP`,
      actionLabel: "VIEW RIDE"
    })}${state.error ? UploadError({ message: `Your ride was saved, but video processing could not start: ${state.error}` }) : ""}`;
  }
  if (state.processing) return ProcessingState({ state: state.processing });
  return `
    <header class="add-activity-header">
      <div><h1 id="add-activity-title">Add Activity</h1><p>Import a FIT file to start discovering</p></div>
    </header>
    <form class="add-activity-form" novalidate>
      ${selectedFiles(state)}
      ${state.error ? UploadError({ message: state.error }) : ""}
      <button class="upload-primary-button" type="submit">${state.fit ? "PROCESS ACTIVITY" : "SELECT ACTIVITY FILE"}</button>
    </form>
  `;
};

export const AddActivityPage = (state = {}) => `
  <section class="add-activity-page" aria-labelledby="add-activity-title">
    <div class="add-activity-panel">${content(state)}</div>
  </section>
`;

export const mountAddActivityPage = (mountPoint, onActivityReady) => {
  const state = { fit: undefined, video: undefined, importKey: importKey(), processing: undefined, error: undefined, complete: undefined };
  const render = () => {
    mountPoint.innerHTML = AddActivityPage(state);
    if (state.complete) {
      mountPoint.querySelector("[data-upload-complete]")?.addEventListener("click", () => onActivityReady(state.complete.id));
      return;
    }
    if (state.processing) return;
    mountPoint.querySelectorAll("[data-upload-dropzone]").forEach((dropzone) => {
      const input = dropzone.querySelector("input");
      mountUploadDropzone(dropzone, (file) => {
        if (input.name === "fit") state.fit = file;
        else state.video = file;
        state.error = undefined;
        render();
      });
    });
    mountPoint.querySelectorAll("[data-remove-upload]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.removeUpload === "ACTIVITY FILE") state.fit = undefined;
        else state.video = undefined;
        state.error = undefined;
        render();
      });
    });
    mountPoint.querySelector(".add-activity-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!state.fit) {
        state.error = "Choose a FIT activity file before processing.";
        render();
        return;
      }
      state.processing = "processing";
      render();
      const data = new FormData();
      data.append("fit", state.fit);
      if (state.video) data.append("video", state.video);
      try {
        const response = await fetch("/api/activities/import", {
          method: "POST",
          headers: { "Idempotency-Key": state.importKey },
          body: data
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Unable to import activity.");
        state.complete = body.activity;
        state.error = body.videoError;
      } catch (error) {
        state.error = error instanceof Error ? error.message : "Unable to import activity.";
      } finally {
        state.processing = undefined;
        render();
      }
    });
  };
  render();
};
