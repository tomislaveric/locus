import { CollectedList, collectedEvents } from "./collected-list.js";

const validRoutePoint = (point) => Number.isFinite(point?.timestampMs)
  && Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude);

const routePosition = (event, route) => {
  const start = route[0].timestampMs;
  const end = route.at(-1).timestampMs;
  return Math.max(0, Math.min(1, (event.activityTimestamp - start) / (end - start || 1)));
};

const metersBetween = (left, right) => {
  const radians = Math.PI / 180;
  const latitudeDelta = (right.latitude - left.latitude) * radians;
  const longitudeDelta = (right.longitude - left.longitude) * radians;
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(left.latitude * radians) * Math.cos(right.latitude * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const routeDistanceMeters = (route, position) => {
  const target = route[0].timestampMs + (route.at(-1).timestampMs - route[0].timestampMs) * position;
  let distance = 0;
  for (let index = 1; index < route.length; index += 1) {
    const previous = route[index - 1];
    const current = route[index];
    if (target <= current.timestampMs) {
      return distance + metersBetween(previous, current) * ((target - previous.timestampMs) / (current.timestampMs - previous.timestampMs || 1));
    }
    distance += metersBetween(previous, current);
  }
  return distance;
};

const distanceLabel = (meters) => `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(meters / 1000)}km`;

export const collectedRouteTimeline = (activity, replay) => {
  const route = replay?.activity?.route?.filter(validRoutePoint);
  const events = collectedEvents(activity).filter((event) => Number.isFinite(event.activityTimestamp));
  if (!route || route.length < 2 || !events.length) return "";

  const markers = events.map((event) => {
    const position = routePosition(event, route);
    const x = 20 + position * 720;
    const rarity = event.collectible?.rarity ?? "common";
    return `<g class="collected-route-marker rarity-${rarity}"><circle cx="${x.toFixed(1)}" cy="24" r="6"/><text x="${x.toFixed(1)}" y="47">${distanceLabel(routeDistanceMeters(route, position))}</text></g>`;
  }).join("");
  return `
    <section class="collected-route" aria-label="Historical collected route">
      <svg viewBox="0 0 760 60" role="img" aria-label="Historical route with collected item markers">
        <path class="collected-route-path" d="M20 24H740"/>
        ${markers}
      </svg>
    </section>
  `;
};

export const CollectedTab = (activity, replay) => `
  <section class="collected-tab" aria-label="Collected items">
    ${collectedRouteTimeline(activity, replay)}
    ${CollectedList(activity)}
  </section>
`;
