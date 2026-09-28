export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

const canonicalRarities = new Set(["common", "rare", "epic"]);

export const canonicalRarity = (rarity) => canonicalRarities.has(rarity) ? rarity : undefined;

export const collectedEvents = (activity) => Array.isArray(activity.events)
  ? activity.events.filter((event) => event.type === "collectible_collected")
  : [];

export const collectibleRarity = (event) => canonicalRarity(event.collectible?.rarity);

export const CollectibleIcon = (type, rarity) => {
  const asset = type === "landmark"
    ? (rarity === "epic" ? "collectible-landmark-epic.svg" : "collectible-landmark.svg")
    : "collectible-coin.svg";
  return `<span class="collectible-type-icon collectible-type-${escapeHtml(type)}" aria-hidden="true"><img src="/assets/${asset}" width="16" height="16" alt=""></span>`;
};

export const RarityBadge = (rarity) => rarity
  ? `<span class="collectible-rarity rarity-${rarity}">${escapeHtml(rarity)}</span>`
  : "";

export const CollectibleCard = (event) => {
  const rarity = collectibleRarity(event);
  const collectible = event.collectible ?? {};
  return `
    <li class="collectible-card${rarity ? ` rarity-${rarity}` : ""}">
      ${CollectibleIcon(collectible.type, rarity)}
      <div class="collectible-card-details">
        <strong>${escapeHtml(collectible.name ?? event.sourceId)}</strong>
        <span>${escapeHtml(collectible.type ?? "collectible")}</span>
      </div>
      ${RarityBadge(rarity)}
      <strong class="collectible-value">+${escapeHtml(event.value)} XP</strong>
    </li>
  `;
};

export const CollectedList = (activity) => {
  const events = collectedEvents(activity);
  if (!events.length) {
    return `
      <section class="collected-empty-state" aria-label="Collected items">
        <p>NO COLLECTIBLES FOUND</p>
        <span>No collectible events were recorded on this activity.</span>
      </section>
    `;
  }
  return `<ol class="collected-list" aria-label="Collected items">${events.map(CollectibleCard).join("")}</ol>`;
};
