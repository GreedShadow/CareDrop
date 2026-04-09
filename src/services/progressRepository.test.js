import { describe, expect, it } from "vitest";

import { buildProgressSnapshot, buildStructuredProgressRecords } from "./progressRepository";

describe("progressRepository", () => {
  it("builds a stable progress snapshot", () => {
    const snapshot = buildProgressSnapshot({
      subject: "Pharmacology",
      difficulty: "medium",
      topicFilter: "cardio",
      mode: "quiz",
      ratings: { one: "easy" },
      sessions: 2,
      reviewSessions: [],
      flashcards: [],
      cardIdx: 0,
      flashcardSessionRatings: {},
      flashcardResponseTimes: {},
      flashcardSessionSubmitted: false,
      quiz: [],
      quizIdx: 0,
      quizResponseTimes: {},
      quizSubmitted: false,
      simulationQuestions: [],
      simulationIdx: 0,
      simulationResponseTimes: {},
      simulationSubmitted: false,
      simulationSize: 50,
      simulationUsedAi: false,
      remediationContext: null,
      usedFlashcardIds: [],
      usedFlashcardQuestions: [],
      usedQuizPrompts: [],
      recentFlashcardIds: [],
      recentQuizPrompts: [],
      noteText: "note",
      uploadedText: "upload",
      uploadedFileName: "file.txt",
      summaryText: "summary",
      filterWeakOnly: false,
      calendarMonth: "2026-04-01T00:00:00.000Z",
      calendarSelectedDate: "2026-04-10",
      calendarEvents: [],
      plannerItems: [],
      adminView: "overview",
    });

    expect(snapshot.subject).toBe("Pharmacology");
    expect(snapshot.calendarMonth).toContain("2026-04-01");
    expect(snapshot.uploadedFileName).toBe("file.txt");
  });

  it("creates structured rows from snapshot data", () => {
    const rows = buildStructuredProgressRecords({
      userId: "user-1",
      snapshot: {
        plannerItems: [{ id: "p1", title: "Review cardio", subject: "Medical-Surgical", mode: "quiz", dueDate: "2026-04-12", completed: false }],
        calendarEvents: [{ id: "c1", dateKey: "2026-04-12", title: "Simulation", type: "Simulation", subject: "Mixed Review" }],
        reviewSessions: [{ id: "s1", mode: "quiz", subject: "Pharmacology", topic: "cardio", score: 80, questions: [{ id: "q1" }], createdAt: "2026-04-10T00:00:00.000Z" }],
      },
      recommendation: {
        primaryFocus: { subject: "Pharmacology", topic: "cardio", focusScore: 52 },
        recommendedAction: { type: "remediation" },
        strongestSubject: { subject: "Fundamentals" },
        mostImprovedSubject: { subject: "Pharmacology" },
      },
    });

    expect(rows.planner_items).toHaveLength(1);
    expect(rows.calendar_events).toHaveLength(1);
    expect(rows.review_sessions[0].item_count).toBe(1);
    expect(rows.recommendation_snapshots[0].recommended_action).toBe("remediation");
  });
});
