import { canonicalRarity, escapeHtml } from "./collected-list.js";

const markerParts = {
  common: ["common-a", "common-b", "common-c"],
  rare: ["rare-a", "rare-b", "rare-c"],
  epic: ["epic-a", "epic-b", "epic-c"]
};

const distanceLabel = (meters) => `${Math.round(meters)} m from your route`;

const NearMissMarker = (rarity) => {
  const parts = markerParts[rarity ?? "common"];
  return `
    <span class="near-miss-marker rarity-${rarity ?? "common"}" aria-hidden="true">
      <img class="near-miss-marker-outer" src="/assets/near-miss-target-${parts[0]}.svg" width="13" height="13" alt="">
      <img class="near-miss-marker-middle" src="/assets/near-miss-target-${parts[2]}.svg" width="8" height="8" alt="">
      <img class="near-miss-marker-core" src="/assets/near-miss-target-${parts[1]}.svg" width="4" height="4" alt="">
    </span>
  `;
};

export const NearMissItem = (nearMiss) => {
  const rarity = canonicalRarity(nearMiss.rarity);
  return `
    <li class="near-miss-card${rarity ? ` rarity-${rarity}` : ""}">
      ${NearMissMarker(rarity)}
      <div class="near-miss-card-details">
        <strong>${escapeHtml(nearMiss.name)}</strong>
        <span>${distanceLabel(nearMiss.minimumDistanceMeters)}</span>
      </div>
      <div class="near-miss-card-status">
        ${rarity ? `<span class="near-miss-rarity rarity-${rarity}">${escapeHtml(rarity)}</span>` : ""}
        <span>Next ride</span>
      </div>
    </li>
  `;
};

export const NearMissList = (nearMisses) => `<ol class="near-miss-list" aria-label="Nearby targets">${nearMisses.map(NearMissItem).join("")}</ol>`;
