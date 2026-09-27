const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&#39;"
})[character]);

const duration = (seconds) => {
  if (!Number.isFinite(seconds)) return "";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
};

const errorCopy = (video) => video.synchronization?.code
  ? `We could not synchronize this video (${video.synchronization.code}).`
  : video.error ?? "We could not process this video.";

const VideoEmptyState = () => `
  <section class="video-empty-state" aria-label="Ride video">
    <p>NO VIDEO ATTACHED</p><h2>Add your ride video</h2>
    <span>No video attached to this ride yet. Video is optional—add your GoPro or action-camera footage to create automatic highlights.</span>
    <form data-video-upload><input name="video" type="file" accept="video/mp4,.mp4" required><button class="video-attach-button">ATTACH VIDEO</button></form>
  </section>
`;

const VideoProcessingState = (video) => `
  <section class="video-processing-state" aria-live="polite">
    <p>${video.state === "rendering" ? "CREATING HIGHLIGHTS" : "SYNCHRONIZING VIDEO"}</p>
    <h2>${video.state === "rendering" ? "Rendering selected moments" : "Matching video to your ride"}</h2>
    <span>${video.state === "rendering" ? "Your selected highlights are rendering." : "Using your existing ride timestamps and route data."}</span>
  </section>
`;

const VideoErrorState = (video) => `
  <section class="video-error-state" role="alert">
    <p>${video.state === "render_failed" ? "HIGHLIGHT FAILED" : "VIDEO SYNC FAILED"}</p>
    <h2>${escapeHtml(errorCopy(video))}</h2>
    <span>Your ride and collected items are unchanged.</span>
    ${video.state === "sync_failed" ? '<button class="video-attach-button" type="button" data-video-retry>TRY ANOTHER VIDEO</button>' : ""}
  </section>
`;

const VideoSelection = (video) => `
  <section class="video-selection" aria-label="Highlight selection">
    <p>VIDEO ATTACHED</p><h2>Select moments for your highlights</h2>
    <span>Choose the detected moments to include in the rendered video.</span>
    <form data-video-selection>
      <ul>${(video.events ?? []).map((event) => `<li><label><input type="checkbox" name="sourceId" value="${escapeHtml(event.sourceId)}" checked> <b>${escapeHtml(event.collectible.name)}</b><em>${duration(event.videoSecond)}</em></label></li>`).join("")}</ul>
      <button class="video-attach-button">GENERATE HIGHLIGHTS</button>
    </form>
  </section>
`;

const HighlightReadyState = (video) => {
  const events = video.events ?? [];
  const outputDuration = video.render?.outputDurationSeconds;
  return `
    <section class="video-player" aria-label="Auto-generated highlights">
      <div class="video-player-frame">
        <video controls preload="metadata" src="${escapeHtml(video.previewUrl)}"></video>
        <span class="video-rec">● REC</span><span class="video-duration">${duration(outputDuration)}</span>
      </div>
      <div class="video-player-title"><strong>Auto-Generated Highlights</strong><span>${events.length} ${events.length === 1 ? "moment" : "moments"}${Number.isFinite(outputDuration) ? ` · ${duration(outputDuration)}` : ""}</span></div>
      ${video.downloadUrl ? `<a class="video-download" href="${escapeHtml(video.downloadUrl)}">DOWNLOAD VIDEO</a>` : ""}
      <ul class="video-event-list">${events.map((event) => `<li><time>${duration(event.videoSecond)}</time><i></i><strong>${escapeHtml(event.collectible.name)}</strong></li>`).join("")}</ul>
    </section>
  `;
};

export const VideoTab = (activity) => {
  const video = activity.video;
  if (!video) return VideoEmptyState();
  if (video.state === "syncing" || video.state === "rendering") return VideoProcessingState(video);
  if (video.state === "sync_failed" || video.state === "render_failed") return VideoErrorState(video);
  if (video.state === "awaiting_selection") return VideoSelection(video);
  return HighlightReadyState(video);
};

export const mountVideoTab = (mountPoint, activity, onActivityUpdated) => {
  const showError = (error) => {
    const state = mountPoint.querySelector(".ride-detail-tab-content");
    if (state) state.insertAdjacentHTML("afterbegin", `<p class="ride-detail-state ride-detail-error" role="alert">${escapeHtml(error instanceof Error ? error.message : "Unable to update ride video.")}</p>`);
  };
  const upload = mountPoint.querySelector("[data-video-upload]");
  if (upload) upload.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const response = await fetch(`/api/activities/${encodeURIComponent(activity.id)}/video`, { method: "POST", body: new FormData(upload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      onActivityUpdated({ ...activity, video: body.video });
    } catch (error) {
      showError(error);
    }
  });
  const selection = mountPoint.querySelector("[data-video-selection]");
  if (selection) selection.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const sourceIds = [...selection.querySelectorAll("input:checked")].map((input) => input.value);
      const response = await fetch(`/api/activities/${encodeURIComponent(activity.id)}/video/render`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceIds })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      onActivityUpdated({ ...activity, video: body.video });
    } catch (error) {
      showError(error);
    }
  });
  const retry = mountPoint.querySelector("[data-video-retry]");
  if (retry) retry.addEventListener("click", async () => {
    try {
      retry.disabled = true;
      const response = await fetch(`/api/activities/${encodeURIComponent(activity.id)}/video`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error);
      }
      onActivityUpdated({ ...activity, video: undefined });
    } catch (error) {
      retry.disabled = false;
      showError(error);
    }
  });
};
