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
    expect(result.recommendationReasons.length).toBeGreaterThan(0);
    expect(result.pattern).toBeTruthy();
  });

  it("tracks remediation recovery trends", () => {
    const sessions = [
      {
        id: "r1",
        mode: "remediation",
        subject: "Pharmacology",
        score: 78,
        previousScore: 42,
        topic: "insulin",
        questions: [{ id: "q1", topic: "insulin", selected: 1, answer: 1 }],
      },
    ];

    const result = summarizePerformanceBuckets(sessions);

    expect(result.remediationSummary.improved).toBe(true);
    expect(result.remediationSummary.improvedTopic?.topic).toBe("insulin");
  });

  it("reads flashcard ratings from saved cardRatings maps", () => {
    const sessions = [
      {
        id: "f1",
        mode: "flashcard",
        subject: "Fundamentals",
        score: 50,
        responseTimes: { card1: 8000, card2: 12000 },
        cardRatings: { card1: "again", card2: "easy" },
        cards: [
          { id: "card1", topic: "infection control" },
          { id: "card2", topic: "infection control" },
        ],
      },
    ];

    const result = summarizePerformanceBuckets(sessions);

    expect(result.primaryFocus?.subject).toBe("Fundamentals");
    expect(result.primaryFocus?.topic).toBe("infection control");
  });

  it("counts SATA misses toward weak topic tracking", () => {
    const sessions = [
      {
        id: "sim-sata-1",
        mode: "simulation",
        subject: "Medical-Surgical",
        score: 25,
        topic: "respiratory",
        responseTimes: { sata1: 38000, sata2: 34000 },
        questions: [
          {
            id: "sata1",
            type: "multiple_response",
            topic: "respiratory",
            subject: "Medical-Surgical",
            correctOptionIds: ["a", "c"],
            userAnswer: ["a", "d"],
            options: [
              { id: "a", text: "Assess respiratory status" },
              { id: "b", text: "Delay reassessment" },
              { id: "c", text: "Prepare oxygen support" },
              { id: "d", text: "Ambulate immediately" },
            ],
          },
          {
            id: "sata2",
            type: "multiple_response",
            topic: "respiratory",
            subject: "Medical-Surgical",
            correctOptionIds: ["b", "c"],
            userAnswer: ["b", "d"],
            options: [
              { id: "a", text: "Delay intervention until rounds" },
              { id: "b", text: "Monitor oxygen saturation" },
              { id: "c", text: "Position for easier breathing" },
              { id: "d", text: "Give unrestricted oral intake" },
            ],
          },
        ],
      },
    ];

    const result = summarizePerformanceBuckets(sessions);

    expect(result.primaryFocus?.subject).toBe("Medical-Surgical");
    expect(result.primaryFocus?.topic).toBe("respiratory");
    expect(result.recommendationReasons.length).toBeGreaterThan(0);
  });
});
