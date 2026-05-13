import { describe, expect, it } from "vitest";
import { buildTimerSessionMeta, clampTimerMinutes, formatDuration } from "./timerUtils";

describe("timerUtils", () => {
  it("formats short and long durations", () => {
    expect(formatDuration(75)).toBe("1:15");
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("clamps custom timer minutes to the supported range", () => {
    expect(clampTimerMinutes(0)).toBe(1);
    expect(clampTimerMinutes(999)).toBe(600);
    expect(clampTimerMinutes("15")).toBe(15);
  });

  it("builds persisted timer session metadata", () => {
    const meta = buildTimerSessionMeta(
      {
        timerMode: "timed",
        durationMinutes: 10,
        startedAt: "2026-05-13T00:00:00.000Z",
        endedAt: "2026-05-13T00:05:00.000Z",
        timeExpired: false,
      },
      {
        modeType: "quiz",
        completedItemCount: 10,
        totalItemCount: 10,
      }
    );

    expect(meta).toMatchObject({
      modeType: "quiz",
      timerMode: "timed",
      timerDurationMinutes: 10,
      actualDurationSeconds: 300,
      averageTimePerItem: 30,
      completedItemCount: 10,
      totalItemCount: 10,
    });
  });
});
