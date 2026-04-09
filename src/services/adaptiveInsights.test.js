import { summarizePerformanceBuckets } from "./adaptiveInsights";

describe("summarizePerformanceBuckets", () => {
  it("prioritizes weak repeated topics and recommends remediation or retry flow", () => {
    const sessions = [
      {
        id: "q1",
        mode: "quiz",
        subject: "Medical-Surgical",
        score: 40,
        topic: "cardio",
        responseTimes: { a: 32000, b: 28000 },
        questions: [
          { id: "a", topic: "cardio", selected: 0, answer: 1 },
          { id: "b", topic: "cardio", selected: 1, answer: 2 },
        ],
      },
      {
        id: "s1",
        mode: "simulation",
        subject: "Medical-Surgical",
        score: 48,
        topic: "cardio",
        responseTimes: { c: 35000, d: 31000 },
        questions: [
          { id: "c", topic: "cardio", selected: 0, answer: 1 },
          { id: "d", topic: "cardio", selected: 0, answer: 0 },
        ],
      },
    ];

    const result = summarizePerformanceBuckets(sessions);

    expect(result.primaryFocus).toBeTruthy();
    expect(result.primaryFocus.subject).toBe("Medical-Surgical");
    expect(result.primaryFocus.topic).toBe("cardio");
    expect(result.recommendedAction).toBeTruthy();
    expect(["remediation", "simulation"]).toContain(result.recommendedAction.type);
  });
});
