import { mountReplay } from "./replay.js";

const form = document.querySelector("#upload");
const status = document.querySelector("#status");
const passagesForm = document.querySelector("#passages");
const passageList = document.querySelector("#passage-list");
const activityResultSection = document.querySelector("#activity-result");
let loadedActivityToken;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  passagesForm.hidden = true;
  activityResultSection.hidden = true;
  passageList.replaceChildren();
  status.textContent = "Uploading and processing activity...";
  try {
    const response = await fetch("/api/jobs", { method: "POST", body: new FormData(form) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    poll(body.token, button);
  } catch (error) {
    status.textContent = `Error: ${error.message}`;
    button.disabled = false;
  }
});

passagesForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = passagesForm.querySelector("button");
  const sourceIds = [...passageList.querySelectorAll("input:checked")].map((input) => input.value);
  if (sourceIds.length === 0) {
    status.textContent = "Select at least one collectible passage.";
    return;
  }
  button.disabled = true;
  status.textContent = "Rendering selected clips...";
  try {
    const response = await fetch(`/api/jobs/${passagesForm.dataset.token}/render`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceIds })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    poll(body.token, form.querySelector("button"));
  } catch (error) {
    status.textContent = `Error: ${error.message}`;
    button.disabled = false;
  }
});

async function showActivity(token) {
  if (loadedActivityToken === token) return;
  const response = await fetch(`/api/jobs/${token}/activity`);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error);
  loadedActivityToken = token;
  const result = body.activityResult;
  const unavailable = "Unavailable";
  const distance = result.distance === undefined ? unavailable : `${(result.distance / 1000).toFixed(2)} km`;
  const duration = result.duration === undefined ? unavailable : `${Math.round(result.duration / 60)} min`;
  document.querySelector("#activity-stats").textContent =
    `${distance} · ${duration} · ${result.collectedCount} collected · ${result.totalPoints} XP`;
  const replay = mountReplay({
    canvas: document.querySelector("#replay"), activity: body.activity, activityResult: result, feed: document.querySelector("#activity-feed")
  });
  document.querySelector("#replay-play").onclick = replay.play;
  document.querySelector("#replay-pause").onclick = replay.pause;
  document.querySelector("#replay-restart").onclick = replay.restart;
  activityResultSection.hidden = false;
}

async function poll(token, button) {
  try {
    const response = await fetch(`/api/jobs/${token}`);
    const job = await response.json();
    if (!response.ok) throw new Error(job.error);
    if (job.state === "processing") {
      status.textContent = "Processing telemetry...";
      setTimeout(() => poll(token, button), 1500);
    } else if (job.state === "awaiting_selection") {
      await showActivity(token);
      showPassages(token, job.events);
      status.textContent = `${synchronizationMessage(job.synchronization)} Select the collectible passages to include.`;
      button.disabled = false;
    } else if (job.state === "rendering") {
      status.textContent = "Rendering selected clips...";
      setTimeout(() => poll(token, button), 1500);
    } else if (job.state === "succeeded") {
      await showActivity(token);
      passagesForm.hidden = true;
      status.replaceChildren();
      if (job.downloadUrl) {
        const link = document.createElement("a");
        link.href = job.downloadUrl;
        link.textContent = "Download clip";
        status.append(link);
      } else status.textContent = "Activity complete.";
      button.disabled = false;
    } else if (job.activityReady) {
      await showActivity(token);
      status.textContent = `Video processing failed: ${job.error}`;
      button.disabled = false;
    } else throw new Error(job.error);
  } catch (error) {
    status.textContent = `Error: ${error.message}`;
    button.disabled = false;
  }
}

function synchronizationMessage(synchronization) {
  if (!synchronization) return "";
  const counts = `${synchronization.availableEvents ?? 0} available, ${synchronization.unavailableEvents ?? 0} outside video.`;
  return synchronization.warnings?.length
    ? `Synchronization ${synchronization.confidence}: ${synchronization.warnings.join(" ")} ${counts}`
    : `Synchronization ${synchronization.confidence}: ${counts}`;
}

function showPassages(token, events) {
  passagesForm.dataset.token = token;
  passageList.replaceChildren();
  for (const event of events) {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "sourceId";
    checkbox.value = event.sourceId;
    checkbox.checked = true;
    const rarity = event.collectible.rarity ? ` (${event.collectible.rarity})` : "";
    label.append(checkbox, `${event.collectible.name}${rarity} (+${event.value} XP) at ${event.videoSecond.toFixed(3)} s`);
    passageList.append(label);
  }
  passagesForm.hidden = false;
  passagesForm.querySelector("button").disabled = false;
}
