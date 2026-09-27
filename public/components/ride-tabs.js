export const RideTabs = (activity, selectedTab = "replay") => `
  <div class="ride-tabs" role="tablist" aria-label="Ride detail sections">
    <button class="${selectedTab === "replay" ? "is-active" : ""}" type="button" role="tab" aria-selected="${selectedTab === "replay"}" data-ride-tab="replay">REPLAY</button>
    <button class="${selectedTab === "collected" ? "is-active" : ""}" type="button" role="tab" aria-selected="${selectedTab === "collected"}" data-ride-tab="collected">COLLECTED (${activity.collectedCount})</button>
    <button type="button" role="tab" aria-selected="false" disabled>NEAR MISSES</button>
    <button type="button" role="tab" aria-selected="false" disabled>VIDEO</button>
  </div>
`;
