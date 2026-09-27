import { mountReplay } from "../replay.js";

export const ReplayTab = () => `
  <section class="ride-replay" aria-label="Route replay">
    <canvas class="ride-replay-canvas" width="796" height="422" aria-label="Animated route replay"></canvas>
    <div class="ride-replay-controls">
      <div class="ride-replay-timeline" aria-hidden="true"><span></span></div>
      <span class="ride-replay-status">READY</span>
    </div>
    <div class="ride-replay-accessible-controls">
      <button class="ride-replay-play" type="button" aria-label="Play replay"><img src="/assets/ride-detail-play.svg" width="16" height="16" alt=""></button>
      <button type="button" data-replay-action="pause">Pause</button>
      <button type="button" data-replay-action="restart">Restart</button>
    </div>
    <div class="ride-replay-events" aria-live="polite">
      <strong data-replay-score>0 XP</strong><span data-replay-count>0 collectibles</span>
      <p data-replay-feedback hidden></p><p data-replay-next hidden></p><p data-replay-completion hidden></p>
      <ul data-replay-feed></ul><section data-near-misses hidden><ul data-near-miss-list></ul></section>
    </div>
  </section>
`;

export const mountReplayTab = (mountPoint, replay) => {
  const player = mountReplay({
    canvas: mountPoint.querySelector(".ride-replay-canvas"),
    activity: replay.activity,
    activityResult: replay.activityResult,
    ui: {
      score: mountPoint.querySelector("[data-replay-score]"),
      count: mountPoint.querySelector("[data-replay-count]"),
      feedback: mountPoint.querySelector("[data-replay-feedback]"),
      next: mountPoint.querySelector("[data-replay-next]"),
      completion: mountPoint.querySelector("[data-replay-completion]"),
      feed: mountPoint.querySelector("[data-replay-feed]"),
      nearMisses: mountPoint.querySelector("[data-near-misses]"),
      nearMissList: mountPoint.querySelector("[data-near-miss-list]")
    }
  });
  mountPoint.querySelector(".ride-replay-play").addEventListener("click", player.play);
  mountPoint.querySelector('[data-replay-action="pause"]').addEventListener("click", player.pause);
  mountPoint.querySelector('[data-replay-action="restart"]').addEventListener("click", player.restart);
};
