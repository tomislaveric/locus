export const RideTabs = (activity, selectedTab = "replay", nearMissCount) => `
  <div class="ride-tabs" role="tablist" aria-label="Ride detail sections">
    <button class="${selectedTab === "replay" ? "is-active" : ""}" type="button" role="tab" aria-selected="${selectedTab === "replay"}" data-ride-tab="replay">REPLAY</button>
    <button class="${selectedTab === "collected" ? "is-active" : ""}" type="button" role="tab" aria-selected="${selectedTab === "collected"}" data-ride-tab="collected">COLLECTED (${activity.collectedCount})</button>
    <button class="${selectedTab === "near-misses" ? "is-active" : ""}" type="button" role="tab" aria-selected="${selectedTab === "near-misses"}" data-ride-tab="near-misses">NEAR MISSES${nearMissCount === undefined ? "" : ` (${nearMissCount})`}</button>
    <button class="${selectedTab === "video" ? "is-active" : ""}" type="button" role="tab" aria-selected="${selectedTab === "video"}" data-ride-tab="video">VIDEO</button>
  </div>
`;
