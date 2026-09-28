export const ActivityTabs = (activity, selectedTab = "replay", nearMissCount) => `
  <div class="activity-tabs" role="tablist" aria-label="Activity detail sections">
    <button class="${selectedTab === "replay" ? "is-active" : ""}" type="button" role="tab" aria-selected="${selectedTab === "replay"}" data-activity-tab="replay">REPLAY</button>
    <button class="${selectedTab === "collected" ? "is-active" : ""}" type="button" role="tab" aria-selected="${selectedTab === "collected"}" data-activity-tab="collected">COLLECTED (${activity.collectedCount})</button>
    <button class="${selectedTab === "near-misses" ? "is-active" : ""}" type="button" role="tab" aria-selected="${selectedTab === "near-misses"}" data-activity-tab="near-misses">NEAR MISSES${nearMissCount === undefined ? "" : ` (${nearMissCount})`}</button>
    <button class="${selectedTab === "video" ? "is-active" : ""}" type="button" role="tab" aria-selected="${selectedTab === "video"}" data-activity-tab="video">VIDEO</button>
  </div>
`;
