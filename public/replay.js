const FEEDBACK_DURATION_MS = 1_500;

const replayDurationSeconds = (duration) => Math.min(30, Math.max(12, duration / 120));

const replayCollectibles = (activityResult) => activityResult.collectibles;

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

export const rarityPresentation = (rarity) => {
  const presentations = {
    common: { className: "rarity-common", label: "Common", color: "#aab6ca" },
    rare: { className: "rarity-rare", label: "Rare", color: "#62b6ff" },
    epic: { className: "rarity-epic", label: "Epic", color: "#cf8cff" }
  };
  return presentations[rarity];
};

export const collectiblePresentation = (collectible) => ({
  typeClass: collectible.type === "landmark" ? "collectible-landmark" : "collectible-coin",
  typeLabel: collectible.type === "landmark" ? "Landmark" : "Coin",
  rarity: rarityPresentation(collectible.rarity)
});

export const eventAtTimestamp = (events, timestampMs) =>
  events.filter((event) => event.activityTimestamp <= timestampMs).sort(
    (left, right) => left.activityTimestamp - right.activityTimestamp
  );

export const activeCollectionFeedback = (events, timestampMs) =>
  [...events].reverse().find(
    (event) => timestampMs >= event.activityTimestamp && timestampMs < event.activityTimestamp + FEEDBACK_DURATION_MS
  );

export const markerState = (sourceId, events, timestampMs) => {
  const event = events.find((candidate) => candidate.sourceId === sourceId);
  if (!event || timestampMs < event.activityTimestamp) return "available";
  return timestampMs < event.activityTimestamp + FEEDBACK_DURATION_MS ? "collecting" : "collected";
};

export const replayScore = (events, timestampMs) =>
  eventAtTimestamp(events, timestampMs).reduce((total, event) => total + event.value, 0);

export const feedDisplayData = (events, timestampMs) =>
  eventAtTimestamp(events, timestampMs).reverse().map((event) => ({
    event,
    name: event.collectible?.name || event.sourceId,
    value: event.value,
    rarity: rarityPresentation(event.collectible?.rarity)
  }));

const distanceMeters = (left, right) => {
  const radians = Math.PI / 180;
  const latitudeDelta = (right.latitude - left.latitude) * radians;
  const longitudeDelta = (right.longitude - left.longitude) * radians;
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(left.latitude * radians) * Math.cos(right.latitude * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6_371_000 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const nextCollectibleData = (collectibles, events, timestampMs, rider) => {
  const collectibleIds = new Set(collectibles.map((collectible) => collectible.id));
  const event = events
    .filter((candidate) => collectibleIds.has(candidate.sourceId) && candidate.activityTimestamp > timestampMs)
    .sort((left, right) => left.activityTimestamp - right.activityTimestamp)[0];
  if (!event) return undefined;
  return {
    event,
    name: event.collectible?.name || event.sourceId,
    distanceMeters: distanceMeters(rider, event)
  };
};

export const replayCompletion = (elapsedSeconds, durationSeconds, collectedCount, totalPoints) =>
  elapsedSeconds >= durationSeconds
    ? { collectedCount, totalPoints }
    : undefined;

export const nearMissDisplayData = (nearMisses) =>
  nearMisses.length === 0
    ? undefined
    : nearMisses.map((nearMiss) => ({
      ...nearMiss,
      rarity: rarityPresentation(nearMiss.rarity),
      distanceLabel: `${Math.round(nearMiss.minimumDistanceMeters)} m away`
    }));

export const replayMarkers = (activityResult) => {
  const sources = activityResult.collectibles.map((collectible) => ({ ...collectible, event: undefined }));
  const knownIds = new Set(sources.map((collectible) => collectible.id));
  for (const event of activityResult.events) {
    if (!knownIds.has(event.sourceId)) {
      sources.push({
        id: event.sourceId,
        name: event.collectible?.name || event.sourceId,
        type: event.collectible?.type || "coin",
        rarity: event.collectible?.rarity,
        latitude: event.latitude,
        longitude: event.longitude,
        event
      });
    }
  }
  return sources;
};

const drawMarker = (context, position, collectible, state) => {
  const presentation = collectiblePresentation(collectible);
  const scale = state === "collecting" ? 1.55 : 1;
  const radius = (presentation.typeClass === "collectible-landmark" ? 8 : 6) * scale;
  const rarity = presentation.rarity;
  context.save();
  context.globalAlpha = state === "collected" ? 0.4 : 1;
  context.fillStyle = rarity?.color ?? "#ffd83d";
  context.strokeStyle = state === "collecting" ? "#f5f7fa" : "#10131a";
  context.lineWidth = state === "collecting" ? 3 : 2;
  context.beginPath();
  if (presentation.typeClass === "collectible-landmark") {
    context.rect(position.x - radius, position.y - radius, radius * 2, radius * 2);
  } else {
    context.arc(position.x, position.y, radius, 0, Math.PI * 2);
  }
  context.fill();
  context.stroke();
  if (state === "collected") {
    context.fillStyle = "#f5f7fa";
    context.font = "bold 11px system-ui";
    context.textAlign = "center";
    context.fillText("✓", position.x, position.y + 4);
  } else if (presentation.typeClass === "collectible-landmark") {
    context.fillStyle = "#10131a";
    context.font = "bold 9px system-ui";
    context.textAlign = "center";
    context.fillText("L", position.x, position.y + 3);
    context.fillStyle = "#f5f7fa";
    context.font = "11px system-ui";
    context.fillText(collectible.name, position.x, position.y - radius - 6);
  }
  context.restore();
};

export const mountReplay = ({ canvas, activity, activityResult, onPlaybackStateChange = () => {}, staticRoute = false }) => {
  const context = canvas.getContext("2d");
  const { route } = activity;
  const bounds = routeBounds(route);
  const duration = replayDurationSeconds(activityResult.duration ?? (activity.endedAt - activity.startedAt) / 1000);
  const sources = replayMarkers(activityResult);
  let startedAt;
  let elapsed = 0;
  let frame;

  const draw = () => {
    const progress = staticRoute ? 1 : Math.min(1, elapsed / duration);
    const timestamp = activity.startedAt + (activity.endedAt - activity.startedAt) * progress;
    const riderPosition = interpolatePosition(route, timestamp);
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
    context.lineWidth = 4;
    context.beginPath();
    route.filter((point) => staticRoute || point.timestampMs <= timestamp).forEach((point, index) => {
      const position = project(point, bounds, canvas);
      if (index === 0) context.moveTo(position.x, position.y);
      else context.lineTo(position.x, position.y);
    });
    context.stroke();
    for (const collectible of sources) {
      drawMarker(
        context,
        project(collectible, bounds, canvas),
        collectible,
        staticRoute ? "available" : markerState(collectible.id, activityResult.events, timestamp)
      );
    }
    const rider = project(riderPosition, bounds, canvas);
    context.fillStyle = "#f5f7fa";
    context.strokeStyle = "#10131a";
    context.lineWidth = 3;
    context.beginPath();
    context.arc(rider.x, rider.y, 8, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  };

  const play = (now) => {
    if (startedAt === undefined) startedAt = now - elapsed * 1000;
    elapsed = Math.min(duration, (now - startedAt) / 1000);
    draw();
    if (elapsed < duration) frame = requestAnimationFrame(play);
    else {
      frame = undefined;
      onPlaybackStateChange(false);
    }
  };
  const pause = () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    startedAt = undefined;
    onPlaybackStateChange(false);
  };
  const restart = () => {
    pause();
    elapsed = 0;
    draw();
  };
  draw();
  return {
    play: () => {
      if (frame !== undefined) return;
      if (elapsed >= duration) {
        elapsed = 0;
        startedAt = undefined;
      }
      onPlaybackStateChange(true);
      frame = requestAnimationFrame(play);
    },
    pause,
    restart
  };
};

export {
  interpolatePosition,
  replayCollectibles,
  replayDurationSeconds
};
