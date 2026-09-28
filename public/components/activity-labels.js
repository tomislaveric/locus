const labels = {
  cycling: { singular: "Ride", plural: "Rides" },
  running: { singular: "Run", plural: "Runs" },
  hiking: { singular: "Hike", plural: "Hikes" },
  walking: { singular: "Walk", plural: "Walks" },
  unknown: { singular: "Activity", plural: "Activities" }
};

const labelSet = (type) => labels[type] ?? labels.unknown;

export const getActivityLabel = (type = "unknown", count = 1) => (
  count === 1 ? labelSet(type).singular : labelSet(type).plural
);

export const getActivityCompleteLabel = (type = "unknown") => `${getActivityLabel(type)} complete`;
