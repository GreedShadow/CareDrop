export const TIMER_LIMITS = {
  minMinutes: 1,
  maxMinutes: 600,
};

export const TIMER_PRESETS = {
  flashcard: [5, 10, 15, 20],
  quiz: [10, 15, 20, 30],
  simulation: {
    50: [30, 45, 60],
    100: [60, 90, 120],
    500: [300],
  },
};

export function clampTimerMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) {
    return null;
  }

  return Math.min(TIMER_LIMITS.maxMinutes, Math.max(TIMER_LIMITS.minMinutes, Math.round(minutes)));
}

export function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds || 0)));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (hours) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function buildTimerSessionMeta(timer, { completedItemCount = 0, totalItemCount = 0, modeType = "" } = {}) {
  const startedAt = timer?.startedAt || null;
  const endedAt = timer?.endedAt || new Date().toISOString();
  const actualDurationSeconds = startedAt
    ? Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000))
    : 0;

  return {
    modeType,
    timerMode: timer?.timerMode || "untimed",
    timerDurationMinutes: timer?.durationMinutes ?? null,
    startedAt,
    endedAt,
    actualDurationSeconds,
    timeExpired: Boolean(timer?.timeExpired),
    averageTimePerItem: completedItemCount ? Math.round(actualDurationSeconds / completedItemCount) : 0,
    completedItemCount,
    totalItemCount,
  };
}

export function getPacingInsight(meta, label = "this session") {
  if (!meta?.actualDurationSeconds) {
    return "CareDrop will show pacing insight after this session has enough timing data.";
  }

  const average = Number(meta.averageTimePerItem || 0);
  if (meta.timerMode === "timed" && meta.timeExpired) {
    return `Timed practice may help pacing for ${label}. You kept working until the clock ended, so review the items that felt rushed.`;
  }

  if (average >= 90) {
    return `You were careful with ${label}, but your average pace was slower. A short timed repeat may help build confidence under time pressure.`;
  }

  if (average && average <= 20) {
    return `You moved quickly through ${label}. If accuracy dipped, slow down slightly and look for the priority cue before answering.`;
  }

  return `Your pacing for ${label} looked steady. Keep using timed practice when you want to build exam stamina.`;
}
