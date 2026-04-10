import { describe, expect, it } from "vitest";

import {
  buildDueFlashcardPool,
  getDueCardIds,
  getDueTodayCount,
  updateCardSchedule,
} from "./spacedRepetition";

describe("spaced repetition", () => {
  it("schedules missed cards again very soon", () => {
    const reviewedAt = "2026-04-10T00:00:00.000Z";
    const result = updateCardSchedule({}, { cardId: "card-1", rating: "again", reviewedAt });

    expect(result["card-1"].intervalDays).toBe(0);
    expect(new Date(result["card-1"].dueAt).getTime()).toBeGreaterThan(new Date(reviewedAt).getTime());
  });

  it("grows interval and ease for easy cards", () => {
    const first = updateCardSchedule({}, { cardId: "card-1", rating: "easy", reviewedAt: "2026-04-10T00:00:00.000Z" });
    const second = updateCardSchedule(first, { cardId: "card-1", rating: "easy", reviewedAt: "2026-04-12T00:00:00.000Z" });

    expect(second["card-1"].intervalDays).toBeGreaterThan(first["card-1"].intervalDays);
    expect(second["card-1"].easeFactor).toBeGreaterThan(first["card-1"].easeFactor);
  });

  it("collects due cards for today", () => {
    const schedule = {
      a: { dueAt: "2026-04-09T00:00:00.000Z" },
      b: { dueAt: "2026-04-11T00:00:00.000Z" },
    };

    expect(getDueCardIds(schedule, "2026-04-10T12:00:00.000Z")).toEqual(["a"]);
    expect(getDueTodayCount(schedule, "2026-04-10T12:00:00.000Z")).toBe(1);
  });

  it("builds a due-card pool from the current deck", () => {
    const cards = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const schedule = {
      a: { dueAt: "2026-04-09T00:00:00.000Z" },
      c: { dueAt: "2026-04-10T00:00:00.000Z" },
    };

    expect(buildDueFlashcardPool(cards, schedule, "2026-04-10T12:00:00.000Z")).toEqual([
      { id: "a" },
      { id: "c" },
    ]);
  });
});
