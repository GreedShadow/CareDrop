import { clamp } from "../caredrop/helpers";

const DAY_MS = 1000 * 60 * 60 * 24;

export function normalizeSchedule(schedule) {
  return schedule && typeof schedule === "object" && !Array.isArray(schedule) ? schedule : {};
}

export function getCardScheduleEntry(schedule, cardId) {
  return normalizeSchedule(schedule)[cardId] || null;
}

export function getDueCardIds(schedule, now = new Date()) {
  const currentTime = new Date(now).getTime();

  return Object.entries(normalizeSchedule(schedule))
    .filter(([, entry]) => {
      if (!entry?.dueAt) {
        return true;
      }

      return new Date(entry.dueAt).getTime() <= currentTime;
    })
    .map(([cardId]) => cardId);
}

export function getDueTodayCount(schedule, now = new Date()) {
  return getDueCardIds(schedule, now).length;
}

export function updateCardSchedule(schedule, { cardId, rating, reviewedAt = new Date() }) {
  if (!cardId) {
    return normalizeSchedule(schedule);
  }

  const reviewedDate = new Date(reviewedAt);
  const previous = getCardScheduleEntry(schedule, cardId) || {
    intervalDays: 0,
    easeFactor: 2.5,
    reviewCount: 0,
    consecutiveCorrect: 0,
    lapses: 0,
  };

  const next = {
    ...previous,
    reviewCount: Number(previous.reviewCount || 0) + 1,
    lastReviewedAt: reviewedDate.toISOString(),
  };

  if (rating === "again") {
    next.intervalDays = 0;
    next.easeFactor = clamp(Number(previous.easeFactor || 2.5) - 0.2, 1.3, 3.1);
    next.consecutiveCorrect = 0;
    next.lapses = Number(previous.lapses || 0) + 1;
    next.dueAt = new Date(reviewedDate.getTime() + 15 * 60 * 1000).toISOString();
  } else if (rating === "hard") {
    const baseInterval = Math.max(1, Number(previous.intervalDays || 1));
    next.intervalDays = Math.max(1, Math.round(baseInterval * 1.2));
    next.easeFactor = clamp(Number(previous.easeFactor || 2.5) - 0.08, 1.3, 3.1);
    next.consecutiveCorrect = Number(previous.consecutiveCorrect || 0) + 1;
    next.dueAt = new Date(reviewedDate.getTime() + next.intervalDays * DAY_MS).toISOString();
  } else {
    const priorInterval = Number(previous.intervalDays || 0);
    const nextEase = clamp(Number(previous.easeFactor || 2.5) + 0.12, 1.3, 3.2);
    const grownInterval =
      priorInterval <= 0
        ? 2
        : Math.max(2, Math.round(priorInterval * nextEase));

    next.intervalDays = grownInterval;
    next.easeFactor = nextEase;
    next.consecutiveCorrect = Number(previous.consecutiveCorrect || 0) + 1;
    next.dueAt = new Date(reviewedDate.getTime() + next.intervalDays * DAY_MS).toISOString();
  }

  return {
    ...normalizeSchedule(schedule),
    [cardId]: next,
  };
}

export function buildDueFlashcardPool(cards, schedule, now = new Date()) {
  const dueSet = new Set(getDueCardIds(schedule, now));

  return (cards || []).filter((card) => dueSet.has(card.id));
}
