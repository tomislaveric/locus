export const ActivityTabs = (activity, selectedTab = "replay") => `
  <div class="activity-tabs" role="tablist" aria-label="Activity detail sections">
    <button class="${selectedTab === "replay" ? "is-active" : ""}" type="button" role="tab" aria-selected="${selectedTab === "replay"}" data-activity-tab="replay">REPLAY</button>
    <button class="${selectedTab === "video" ? "is-active" : ""}" type="button" role="tab" aria-selected="${selectedTab === "video"}" data-activity-tab="video">VIDEO</button>
  </div>
`;
