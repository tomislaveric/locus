import { mountReplay } from "../replay.js";
import { applyActivityXp } from "/shared/progression.js";

export const AddRidePage = () => `
  <section class="legacy-activity" aria-labelledby="activity-title">
    <header class="legacy-activity-header">
      <p class="eyebrow">ACTIVITY PROCESSING</p>
      <h1 id="activity-title">Post-ride activity</h1>
      <p>Upload a FIT activity to replay collected Coins, optionally with a matching GPS5 GoPro MP4 to create a highlight video.</p>
    </header>
    <form id="upload">
      <label>FIT file <input name="fit" type="file" accept=".fit" required></label>
      <label>GoPro MP4 (optional) <input name="video" type="file" accept="video/mp4,.mp4"></label>
      <button>Process ride</button>
    </form>
    <p id="status" role="status"></p>
    <form id="passages" hidden><fieldset><legend>Detected Coin passages</legend><div id="passage-list"></div></fieldset><button type="submit">Generate selected clips</button></form>
    <section id="activity-result" hidden>
      <h2>Completed ride</h2><p id="activity-stats"></p>
      <section id="progression" aria-label="Player progression"><div id="progression-summary"><strong id="progression-earned">+0 XP</strong><strong id="progression-level">LEVEL 1</strong><span id="progression-total">0 -> 0 XP</span></div><progress id="progression-progress" max="1" value="0"></progress><span id="progression-progress-label">0 / 100 XP (0%)</span><p id="progression-level-up" aria-live="polite" hidden></p></section>
      <div class="replay-summary" aria-live="polite"><strong id="replay-score">0 XP</strong><span id="replay-count">0 collectibles</span></div>
      <canvas id="replay" width="560" height="320" aria-label="Animated route replay"></canvas>
      <div id="replay-feedback" aria-live="polite" hidden></div><div id="replay-next" hidden></div><div id="replay-completion" aria-live="polite" hidden></div>
      <div id="replay-controls"><button id="replay-play" type="button">Play</button><button id="replay-pause" type="button">Pause</button><button id="replay-restart" type="button">Restart</button></div>
      <ul id="activity-feed"></ul><section id="near-misses" hidden><h3>Almost got these</h3><ul id="near-miss-list"></ul></section>
    </section>
  </section>
`;

export const mountAddRidePage = (mountPoint) => {
  mountPoint.innerHTML = AddRidePage();
  const form = mountPoint.querySelector("#upload");
  const status = mountPoint.querySelector("#status");
  const passagesForm = mountPoint.querySelector("#passages");
  const passageList = mountPoint.querySelector("#passage-list");
  const activityResultSection = mountPoint.querySelector("#activity-result");
  let loadedActivityToken;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    button.disabled = true; passagesForm.hidden = true; activityResultSection.hidden = true; passageList.replaceChildren();
    status.textContent = "Uploading and processing activity...";
    try {
      const response = await fetch("/api/jobs", { method: "POST", body: new FormData(form) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      poll(body.token, button);
    } catch (error) { status.textContent = `Error: ${error.message}`; button.disabled = false; }
  });

  passagesForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = passagesForm.querySelector("button");
    const sourceIds = [...passageList.querySelectorAll("input:checked")].map((input) => input.value);
    if (sourceIds.length === 0) { status.textContent = "Select at least one collectible passage."; return; }
    button.disabled = true; status.textContent = "Rendering selected clips...";
    try {
      const response = await fetch(`/api/jobs/${passagesForm.dataset.token}/render`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceIds }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      poll(body.token, form.querySelector("button"));
    } catch (error) { status.textContent = `Error: ${error.message}`; button.disabled = false; }
  });

  async function showActivity(token) {
    if (loadedActivityToken === token) return;
    const [response, progressResponse] = await Promise.all([fetch(`/api/jobs/${token}/activity`), fetch("/api/player/progress")]);
    const body = await response.json(); const progress = await progressResponse.json();
    if (!response.ok) throw new Error(body.error);
    if (!progressResponse.ok) throw new Error(progress.error);
    loadedActivityToken = token;
    const result = body.activityResult;
    const distance = result.distance === undefined ? "Unavailable" : `${(result.distance / 1000).toFixed(2)} km`;
    const duration = result.duration === undefined ? "Unavailable" : `${Math.round(result.duration / 60)} min`;
    mountPoint.querySelector("#activity-stats").textContent = `${distance} · ${duration} · ${result.collectedCount} collected · ${result.totalPoints} XP`;
    const replay = mountReplay({ canvas: mountPoint.querySelector("#replay"), activity: body.activity, activityResult: result, ui: {
      score: mountPoint.querySelector("#replay-score"), count: mountPoint.querySelector("#replay-count"), feedback: mountPoint.querySelector("#replay-feedback"), next: mountPoint.querySelector("#replay-next"), completion: mountPoint.querySelector("#replay-completion"), feed: mountPoint.querySelector("#activity-feed"), nearMisses: mountPoint.querySelector("#near-misses"), nearMissList: mountPoint.querySelector("#near-miss-list")
    }});
    mountPoint.querySelector("#replay-play").onclick = replay.play; mountPoint.querySelector("#replay-pause").onclick = replay.pause; mountPoint.querySelector("#replay-restart").onclick = replay.restart;
    const progression = applyActivityXp(Math.max(0, progress.totalXp - result.totalPoints), result.totalPoints);
    mountPoint.querySelector("#progression-earned").textContent = `+${progression.xpEarned} XP`;
    mountPoint.querySelector("#progression-level").textContent = `LEVEL ${progress.level}`;
    mountPoint.querySelector("#progression-total").textContent = `${progression.previousTotalXp.toLocaleString()} -> ${progression.newTotalXp.toLocaleString()} XP`;
    mountPoint.querySelector("#progression-progress").value = progress.progressToNextLevel;
    mountPoint.querySelector("#progression-progress-label").textContent = `${Math.round(progress.currentLevelXp).toLocaleString()} / ${progress.nextLevelXp.toLocaleString()} XP (${Math.round(progress.progressToNextLevel * 100)}%)`;
    const levelUp = mountPoint.querySelector("#progression-level-up");
    levelUp.hidden = progression.levelsGained === 0;
    if (!levelUp.hidden) levelUp.textContent = `LEVEL UP · ${progression.previousLevel} -> ${progression.newLevel}`;
    activityResultSection.hidden = false;
  }

  function showPassages(token, events) {
    passagesForm.dataset.token = token; passageList.replaceChildren();
    for (const event of events) {
      const label = document.createElement("label"); const checkbox = document.createElement("input");
      checkbox.type = "checkbox"; checkbox.name = "sourceId"; checkbox.value = event.sourceId; checkbox.checked = true;
      const rarity = event.collectible.rarity ? ` (${event.collectible.rarity})` : "";
      label.append(checkbox, `${event.collectible.name}${rarity} (+${event.value} XP) at ${event.videoSecond.toFixed(3)} s`);
      passageList.append(label);
    }
    passagesForm.hidden = false; passagesForm.querySelector("button").disabled = false;
  }

  async function poll(token, button) {
    try {
      const response = await fetch(`/api/jobs/${token}`); const job = await response.json();
      if (!response.ok) throw new Error(job.error);
      if (job.state === "processing" || job.state === "rendering") { status.textContent = job.state === "processing" ? "Processing telemetry..." : "Rendering selected clips..."; setTimeout(() => poll(token, button), 1500); }
      else if (job.state === "awaiting_selection") { await showActivity(token); showPassages(token, job.events); status.textContent = `${synchronizationMessage(job.synchronization)} Select the collectible passages to include.`; button.disabled = false; }
      else if (job.state === "succeeded") { await showActivity(token); passagesForm.hidden = true; status.replaceChildren(); if (job.downloadUrl) { const link = document.createElement("a"); link.href = job.downloadUrl; link.textContent = "Download clip"; status.append(link); } else status.textContent = "Activity complete."; button.disabled = false; }
      else if (job.activityReady && job.resultMode === "video") { await showActivity(token); status.textContent = `Video processing failed: ${job.error}`; button.disabled = false; }
      else throw new Error(job.error ?? "Activity processing failed.");
    } catch (error) { status.textContent = `Error: ${error.message}`; button.disabled = false; }
  }
};

const synchronizationMessage = (synchronization) => {
  if (!synchronization) return "";
  const counts = `${synchronization.availableEvents ?? 0} available, ${synchronization.unavailableEvents ?? 0} outside video.`;
  return synchronization.warnings?.length ? `Synchronization ${synchronization.confidence}: ${synchronization.warnings.join(" ")} ${counts}` : `Synchronization ${synchronization.confidence}: ${counts}`;
};
