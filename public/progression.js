const XP_PER_LEVEL = 100;

const assertNonNegativeFinite = (value, name) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite, non-negative number.`);
  }
};

const getLevelThreshold = (level) => XP_PER_LEVEL * (level - 1) * level / 2;

export const getXpRequiredForLevel = (level) => {
  if (!Number.isSafeInteger(level) || level < 1) {
    throw new RangeError("level must be a positive safe integer.");
  }
  return XP_PER_LEVEL * level;
};

export const getLevelForXp = (totalXp) => {
  assertNonNegativeFinite(totalXp, "totalXp");
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + 8 * totalXp / XP_PER_LEVEL)) / 2));
  while (getLevelThreshold(level + 1) <= totalXp) level += 1;
  while (getLevelThreshold(level) > totalXp) level -= 1;
  return level;
};

export const getLevelProgress = (totalXp) => {
  assertNonNegativeFinite(totalXp, "totalXp");
  const level = getLevelForXp(totalXp);
  const currentLevelXp = totalXp - getLevelThreshold(level);
  const nextLevelXp = getXpRequiredForLevel(level);
  return {
    totalXp,
    level,
    currentLevelXp,
    nextLevelXp,
    progressToNextLevel: currentLevelXp / nextLevelXp
  };
};

export const applyActivityXp = (previousTotalXp, xpEarned) => {
  assertNonNegativeFinite(previousTotalXp, "previousTotalXp");
  assertNonNegativeFinite(xpEarned, "xpEarned");
  const newTotalXp = previousTotalXp + xpEarned;
  assertNonNegativeFinite(newTotalXp, "newTotalXp");
  const previousLevel = getLevelForXp(previousTotalXp);
  const newLevel = getLevelForXp(newTotalXp);
  return {
    previousTotalXp,
    xpEarned,
    newTotalXp,
    previousLevel,
    newLevel,
    levelsGained: newLevel - previousLevel
  };
};
