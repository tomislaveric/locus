import { NearMissList } from "./near-miss-list.js";

export const AlmostGotTheseSection = (nearMisses) => {
  const targetLabel = nearMisses.length === 1 ? "target" : "targets";
  return `
    <section class="almost-got-these" aria-labelledby="near-misses-heading">
      <div class="almost-got-these-heading">
        <h2 id="near-misses-heading">${nearMisses.length} ${targetLabel} nearby</h2>
        <p>These were within striking range. Route through them on your next ride to collect.</p>
      </div>
      ${NearMissList(nearMisses)}
    </section>
  `;
};

const NoNearMisses = () => `
  <section class="near-misses-empty-state" aria-label="Near misses">
    <p>NO NEAR MISSES RECORDED</p>
    <span>No nearby targets were recorded on this ride.</span>
  </section>
`;

export const NearMissesTab = (replay) => {
  const nearMisses = replay.activityResult.nearMisses;
  return `<section class="near-misses-tab" aria-label="Near misses">${nearMisses.length ? AlmostGotTheseSection(nearMisses) : NoNearMisses()}</section>`;
};
