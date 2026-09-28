import { mountReplay } from "../replay.js";

export const Replay = ({
  canvasLabel = "Route replay",
  className = "",
  controls = false,
  height = 422,
  width = 796
} = {}) => `
  <section class="ride-replay ${className}" aria-label="${canvasLabel}">
    <canvas class="ride-replay-canvas" width="${width}" height="${height}" aria-label="${canvasLabel}"></canvas>
    ${controls ? `
      <button class="ride-replay-play" type="button" aria-label="Play replay" aria-pressed="false">
        <img src="/assets/ride-detail-play.svg" width="16" height="16" alt="">
      </button>
    ` : ""}
  </section>
`;

export const ReplayTab = () => Replay({ canvasLabel: "Animated route replay", controls: true });

export const mountReplayTab = (mountPoint, replay) => {
  const button = mountPoint.querySelector(".ride-replay-play");
  const player = mountReplay({
    canvas: mountPoint.querySelector(".ride-replay-canvas"),
    activity: replay.activity,
    activityResult: replay.activityResult,
    onPlaybackStateChange: (isPlaying) => {
      button.classList.toggle("is-playing", isPlaying);
      button.setAttribute("aria-label", isPlaying ? "Pause replay" : "Play replay");
      button.setAttribute("aria-pressed", String(isPlaying));
    }
  });
  button.addEventListener("click", () => {
    if (button.getAttribute("aria-pressed") === "true") player.pause();
    else player.play();
  });
};
