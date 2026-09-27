export const MainContent = () => `
  <main class="main-content">
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
      <form id="passages" hidden>
        <fieldset>
          <legend>Detected Coin passages</legend>
          <div id="passage-list"></div>
        </fieldset>
        <button type="submit">Generate selected clips</button>
      </form>
      <section id="activity-result" hidden>
        <h2>Completed ride</h2>
        <p id="activity-stats"></p>
        <section id="progression" aria-label="Player progression">
          <div id="progression-summary">
            <strong id="progression-earned">+0 XP</strong>
            <strong id="progression-level">LEVEL 1</strong>
            <span id="progression-total">0 -> 0 XP</span>
          </div>
          <progress id="progression-progress" max="1" value="0"></progress>
          <span id="progression-progress-label">0 / 100 XP (0%)</span>
          <p id="progression-level-up" aria-live="polite" hidden></p>
        </section>
        <div class="replay-summary" aria-live="polite">
          <strong id="replay-score">0 XP</strong>
          <span id="replay-count">0 collectibles</span>
        </div>
        <canvas id="replay" width="560" height="320" aria-label="Animated route replay"></canvas>
        <div id="replay-feedback" aria-live="polite" hidden></div>
        <div id="replay-next" hidden></div>
        <div id="replay-completion" aria-live="polite" hidden></div>
        <div id="replay-controls">
          <button id="replay-play" type="button">Play</button>
          <button id="replay-pause" type="button">Pause</button>
          <button id="replay-restart" type="button">Restart</button>
        </div>
        <ul id="activity-feed"></ul>
        <section id="near-misses" hidden>
          <h3>Almost got these</h3>
          <ul id="near-miss-list"></ul>
        </section>
      </section>
    </section>
  </main>
`;

export const mainContent = MainContent;
