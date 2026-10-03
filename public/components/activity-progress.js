import { getAppLocale } from "../app-locales.js";

const formatNumber = (value) => new Intl.NumberFormat(getAppLocale(), {
  maximumFractionDigits: 0
}).format(value);

export const ActivityProgress = (activity, progress) => {
  const remaining = Math.max(0, progress.nextLevelXp - progress.currentLevelXp);
  const percent = Math.max(0, Math.min(100, progress.progressToNextLevel * 100));
  return `
    <section class="activity-progress-card" aria-label="Activity progression">
      <div class="activity-progress-top">
        <div><p class="activity-progress-label">XP EARNED</p><strong class="activity-progress-earned">+${formatNumber(activity.xpEarned)}</strong></div>
        <div class="activity-progress-found"><p class="activity-progress-label">FOUND</p><strong>${formatNumber(activity.collectedCount)}</strong><span>collectibles</span></div>
      </div>
      <div class="activity-progress-level">
        <div><span>Level ${formatNumber(progress.level)}</span><small>Explorer</small></div>
        <p><strong>${formatNumber(progress.currentLevelXp)}</strong> <em>/ ${formatNumber(progress.nextLevelXp)}</em></p>
      </div>
      <div class="activity-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="${progress.nextLevelXp}" aria-valuenow="${progress.currentLevelXp}">
        <span style="width: ${percent}%"></span>
      </div>
      <p class="activity-progress-caption">${formatNumber(remaining)} XP to Level ${formatNumber(progress.level + 1)}</p>
    </section>
  `;
};
