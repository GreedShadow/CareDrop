import { buildRemediationEntries, collectIncorrectQuestions, getTopicSearchTerms } from "./remediation";

describe("remediation helpers", () => {
  it("collects incorrect questions from saved sessions", () => {
    const sessions = [
      {
        subject: "Medical-Surgical",
        questions: [
          { prompt: "Q1", userAnswer: "A", correctAnswer: "B", topic: "cardio" },
          { prompt: "Q2", userAnswer: "C", correctAnswer: "C", topic: "renal" },
        ],
      },
    ];

    expect(collectIncorrectQuestions(sessions)).toEqual([
      expect.objectContaining({ subject: "Medical-Surgical", topic: "cardio", prompt: "Q1" }),
    ]);
  });

  it("matches topic aliases like cardio and cardiac", () => {
    const terms = getTopicSearchTerms("cardio");
    expect(terms).toContain("cardiac");
    expect(terms).toContain("heart");
  });

  it("prefers targeted remediation entries before falling back", () => {
    const sourceEntries = [
      { subject: "Medical-Surgical", topic: "cardiac", q: "Heart failure priority", a: "Assess breathing first" },
      { subject: "Fundamentals", topic: "infection", q: "Hand hygiene", a: "Wash hands" },
    ];
    const incorrectItems = [{ subject: "Medical-Surgical", topic: "cardio", prompt: "weak cardio item" }];
    const result = buildRemediationEntries(sourceEntries, incorrectItems, "");

    expect(result).toHaveLength(1);
    expect(result[0].topic).toBe("cardiac");
  });
});
