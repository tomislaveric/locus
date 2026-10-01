import { canonicalRarity, escapeHtml } from "../collected-list.js";
import { CollectionPanel, CollectionRow } from "../shared/collection-panel.js";

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

export const QuestCollectibleRow = (collectible) => CollectionRow({
  id: collectible.id,
  name: collectible.name,
  rarity: canonicalRarity(collectible.rarity),
  state: collectible.found ? "completed" : "unvisited",
  interactive: true
});

export const QuestDetail = (quest) => {
  const routeDistance = formatDistance(quest.route?.distanceMeters);
  const metaLeading = quest.status === "draft" ? '<span class="quest-badge is-draft">Draft</span>' : "";
  const metaTrailing = routeDistance ? `<small>${escapeHtml(routeDistance)}</small>` : "";
  const ownerActions = quest.isOwner ? `
    <div class="quest-detail-owner-actions">
      <button type="button" data-quest-edit="${escapeHtml(quest.id)}">EDIT</button>
      <button type="button" data-quest-status="${escapeHtml(quest.id)}">
        ${quest.status === "published" ? "UNPUBLISH" : "PUBLISH"}
      </button>
    </div>
  ` : "";
  return CollectionPanel({
    title: quest.title,
    creator: quest.createdBy,
    description: quest.description,
    progress: quest.progress,
    closable: true,
    ariaLabel: "Quest detail",
    metaLeading,
    metaTrailing,
    emptyMessage: "This quest has no collectibles yet.",
    rows: quest.collectibles.map((collectible) => ({
      id: collectible.id,
      name: collectible.name,
      rarity: canonicalRarity(collectible.rarity),
      state: collectible.found ? "completed" : "unvisited",
      interactive: true
    })),
    footer: `${ExternalRouteCta(quest.externalRoute)}${ownerActions}`
  });
};
