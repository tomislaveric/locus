import { canonicalRarity, escapeHtml } from "../collected-list.js";
import { CollectibleSwatch } from "./collectible-swatch.js";
import { formatProgressPercent, questProgressLabel } from "./quest-list.js";

const formatDistance = (meters) => meters === undefined || meters === null
  ? undefined
  : `${(meters / 1000).toFixed(1)} km`;

export const externalRouteLabel = (externalRoute) => {
  if (!externalRoute) return undefined;
  const provider = externalRoute.provider.charAt(0).toUpperCase() + externalRoute.provider.slice(1);
  return externalRoute.title ? `${externalRoute.title} \u00b7 ${provider}` : `Open route on ${provider}`;
};

export const ExternalRouteCta = (externalRoute) => {
  const label = externalRouteLabel(externalRoute);
  if (!label) return "";
  return `
    <a class="quest-route-cta" href="${escapeHtml(externalRoute.url)}" target="_blank" rel="noopener noreferrer">
      VIEW ROUTE<small>${escapeHtml(label)}</small>
    </a>
  `;
};

export const QuestCollectibleRow = (collectible) => {
  const rarity = canonicalRarity(collectible.rarity);
  return `
    <li class="quest-collectible${collectible.found ? " is-found" : ""}">
      <button type="button" data-world-marker="${escapeHtml(collectible.id)}">
        ${CollectibleSwatch({ visited: Boolean(collectible.found), rarity })}
        <span class="quest-collectible-name">${escapeHtml(collectible.name)}</span>
        <span class="quest-collectible-state">${collectible.found ? "Visited" : "Unvisited"}</span>
      </button>
    </li>
  `;
};

export const QuestDetail = (quest) => {
  const routeDistance = formatDistance(quest.route?.distanceMeters);
  return `
    <section class="world-detail quest-detail" aria-label="Quest detail">
      <header>
        <div>
          <h2>${escapeHtml(quest.title)}</h2>
          <p class="world-detail-meta">
            ${quest.status === "draft" ? '<span class="quest-badge is-draft">Draft</span>' : ""}
            <small>by ${escapeHtml(quest.createdBy)}</small>
            ${routeDistance ? `<small>${escapeHtml(routeDistance)}</small>` : ""}
          </p>
        </div>
        <button class="world-detail-close" type="button" data-world-close aria-label="Close quest detail">\u00d7</button>
      </header>
      ${quest.description ? `<p class="quest-detail-description">${escapeHtml(quest.description)}</p>` : ""}
      <p class="quest-detail-progress">
        <span class="quest-progress-track" aria-hidden="true">
          <i style="width: ${escapeHtml(formatProgressPercent(quest.progress))};"></i>
        </span>
        <strong>${escapeHtml(questProgressLabel(quest.progress))}</strong>
        <small>${escapeHtml(formatProgressPercent(quest.progress))}</small>
      </p>
      ${ExternalRouteCta(quest.externalRoute)}
      ${quest.collectibles.length
    ? `<ol class="quest-collectibles">${quest.collectibles.map(QuestCollectibleRow).join("")}</ol>`
    : '<p class="world-detail-empty">This quest has no collectibles yet.</p>'}
      ${quest.isOwner ? `
        <div class="quest-detail-owner-actions">
          <button type="button" data-quest-edit="${escapeHtml(quest.id)}">EDIT</button>
          <button type="button" data-quest-status="${escapeHtml(quest.id)}">
            ${quest.status === "published" ? "UNPUBLISH" : "PUBLISH"}
          </button>
        </div>
      ` : ""}
    </section>
  `;
};
