export const RideTabs = (activity) => `
  <div class="ride-tabs" role="tablist" aria-label="Ride detail sections">
    <button class="is-active" type="button" role="tab" aria-selected="true">REPLAY</button>
    <button type="button" role="tab" aria-selected="false" disabled>COLLECTED (${activity.collectedCount})</button>
    <button type="button" role="tab" aria-selected="false" disabled>NEAR MISSES</button>
    <button type="button" role="tab" aria-selected="false" disabled>VIDEO</button>
  </div>
`;
