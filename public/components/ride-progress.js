const formatNumber = (value) => new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0
}).format(value);

export const RideProgress = (activity, progress) => {
  const remaining = Math.max(0, progress.nextLevelXp - progress.currentLevelXp);
  const percent = Math.max(0, Math.min(100, progress.progressToNextLevel * 100));
  return `
    <section class="ride-progress-card" aria-label="Ride progression">
      <div class="ride-progress-top">
        <div><p class="ride-progress-label">XP EARNED</p><strong class="ride-progress-earned">+${formatNumber(activity.xpEarned)}</strong></div>
        <div class="ride-progress-found"><p class="ride-progress-label">FOUND</p><strong>${formatNumber(activity.collectedCount)}</strong><span>collectibles</span></div>
      </div>
      <div class="ride-progress-level">
        <div><span>Level ${formatNumber(progress.level)}</span><small>Explorer</small></div>
        <p><strong>${formatNumber(progress.currentLevelXp)}</strong> <em>/ ${formatNumber(progress.nextLevelXp)}</em></p>
      </div>
      <div class="ride-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="${progress.nextLevelXp}" aria-valuenow="${progress.currentLevelXp}">
        <span style="width: ${percent}%"></span>
      </div>
      <p class="ride-progress-caption">${formatNumber(remaining)} XP to Level ${formatNumber(progress.level + 1)}</p>
    </section>
  `;
};
