const replayDurationSeconds = (duration) => Math.min(30, Math.max(12, duration / 120));

const interpolatePosition = (route, timestampMs) => {
  const afterIndex = route.findIndex((point) => point.timestampMs >= timestampMs);
  if (afterIndex <= 0) return route[0];
  if (afterIndex === -1) return route.at(-1);
  const before = route[afterIndex - 1];
  const after = route[afterIndex];
  const fraction = (timestampMs - before.timestampMs) / (after.timestampMs - before.timestampMs || 1);
  return {
    latitude: before.latitude + (after.latitude - before.latitude) * fraction,
    longitude: before.longitude + (after.longitude - before.longitude) * fraction,
    timestampMs
  };
};

const routeBounds = (route) => ({
  minLatitude: Math.min(...route.map((point) => point.latitude)),
  maxLatitude: Math.max(...route.map((point) => point.latitude)),
  minLongitude: Math.min(...route.map((point) => point.longitude)),
  maxLongitude: Math.max(...route.map((point) => point.longitude))
});

const nearRoute = (collectible, bounds) => {
  const latitudePadding = Math.max((bounds.maxLatitude - bounds.minLatitude) * 0.2, 0.001);
  const longitudePadding = Math.max((bounds.maxLongitude - bounds.minLongitude) * 0.2, 0.001);
  return collectible.latitude >= bounds.minLatitude - latitudePadding &&
    collectible.latitude <= bounds.maxLatitude + latitudePadding &&
    collectible.longitude >= bounds.minLongitude - longitudePadding &&
    collectible.longitude <= bounds.maxLongitude + longitudePadding;
};

const project = (point, bounds, canvas) => {
  const padding = 24;
  const latitudeSpan = Math.max(bounds.maxLatitude - bounds.minLatitude, 0.0001);
  const longitudeSpan = Math.max(bounds.maxLongitude - bounds.minLongitude, 0.0001);
  const scale = Math.min((canvas.width - padding * 2) / longitudeSpan, (canvas.height - padding * 2) / latitudeSpan);
  const width = longitudeSpan * scale;
  const height = latitudeSpan * scale;
  return {
    x: (canvas.width - width) / 2 + (point.longitude - bounds.minLongitude) * scale,
    y: (canvas.height + height) / 2 - (point.latitude - bounds.minLatitude) * scale
  };
};

export const mountReplay = ({ canvas, activity, activityResult, feed }) => {
  const context = canvas.getContext("2d");
  const { route } = activity;
  const bounds = routeBounds(route);
  const duration = replayDurationSeconds(activityResult.duration ?? (activity.endedAt - activity.startedAt) / 1000);
  let startedAt;
  let elapsed = 0;
  let frame;

  const draw = () => {
    const progress = Math.min(1, elapsed / duration);
    const timestamp = activity.startedAt + (activity.endedAt - activity.startedAt) * progress;
    const collected = activityResult.events.filter((event) => event.activityTimestamp <= timestamp);
    const collectedSourceIds = new Set(collected.map((event) => event.sourceId));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#43506b";
    context.lineWidth = 3;
    context.beginPath();
    route.forEach((point, index) => {
      const position = project(point, bounds, canvas);
      if (index === 0) context.moveTo(position.x, position.y);
      else context.lineTo(position.x, position.y);
    });
    context.stroke();
    context.strokeStyle = "#ffd83d";
    context.beginPath();
    route.filter((point) => point.timestampMs <= timestamp).forEach((point, index) => {
      const position = project(point, bounds, canvas);
      if (index === 0) context.moveTo(position.x, position.y);
      else context.lineTo(position.x, position.y);
    });
    context.stroke();
    for (const collectible of activityResult.collectibles.filter((collectible) => nearRoute(collectible, bounds))) {
      const position = project(collectible, bounds, canvas);
      context.fillStyle = collectedSourceIds.has(collectible.id) ? "#7ee787" : "#ffd83d";
      context.beginPath();
      context.arc(position.x, position.y, 6, 0, Math.PI * 2);
      context.fill();
    }
    for (const event of activityResult.events.filter((event) => !activityResult.collectibles.some((collectible) => collectible.id === event.sourceId))) {
      const position = project(event, bounds, canvas);
      context.fillStyle = collectedSourceIds.has(event.sourceId) ? "#7ee787" : "#ffd83d";
      context.fillRect(position.x - 5, position.y - 5, 10, 10);
    }
    const rider = project(interpolatePosition(route, timestamp), bounds, canvas);
    context.fillStyle = "#f5f7fa";
    context.beginPath();
    context.arc(rider.x, rider.y, 7, 0, Math.PI * 2);
    context.fill();
    const score = collected.reduce((total, event) => total + event.value, 0);
    context.fillStyle = "#f5f7fa";
    context.font = "14px system-ui";
    context.fillText(`Score ${score}/${activityResult.totalPoints}`, 12, 20);
    feed.replaceChildren(...collected.slice().reverse().map((event) => {
      const item = document.createElement("li");
      const rarity = event.collectible.rarity ? ` (${event.collectible.rarity})` : "";
      item.textContent = `${event.collectible.name}${rarity}: +${event.value} XP`;
      return item;
    }));
  };

  const play = (now) => {
    if (startedAt === undefined) startedAt = now - elapsed * 1000;
    elapsed = Math.min(duration, (now - startedAt) / 1000);
    draw();
    if (elapsed < duration) frame = requestAnimationFrame(play);
  };
  const pause = () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    startedAt = undefined;
  };
  const restart = () => {
    pause();
    elapsed = 0;
    draw();
  };
  draw();
  return { play: () => { if (frame === undefined && elapsed < duration) frame = requestAnimationFrame(play); }, pause, restart };
};

export { interpolatePosition, replayDurationSeconds };
