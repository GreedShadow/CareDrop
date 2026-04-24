import { buildSubjectScoreBreakdown, summarizeAnswerSet } from "./sessionScoring";

describe("session scoring", () => {
  it("summarizes answered sets with percentage score", () => {
    const result = summarizeAnswerSet([
      { selected: 1, answer: 1 },
      { selected: 0, answer: 1 },
      { selected: 2, answer: 2 },
    ]);

    expect(result).toMatchObject({
      total: 3,
      answeredCount: 3,
      correctCount: 2,
      incorrectCount: 1,
      score: 67,
    });
  });

  it("builds per-subject score breakdown", () => {
    const result = buildSubjectScoreBreakdown([
      { subject: "Pharmacology", selected: 1, answer: 1 },
      { subject: "Pharmacology", selected: 0, answer: 1 },
      { subject: "Fundamentals", selected: 2, answer: 2 },
    ]);

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subject: "Pharmacology", total: 2, correct: 1, score: 50 }),
        expect.objectContaining({ subject: "Fundamentals", total: 1, correct: 1, score: 100 }),
      ])
    );
  });

  it("scores multiple_response questions as all-or-nothing", () => {
    const result = summarizeAnswerSet([
      {
        type: "multiple_response",
        correctOptionIds: ["a", "c"],
        userAnswer: ["a", "c"],
        options: [
          { id: "a", text: "Assess breath sounds" },
          { id: "b", text: "Delay reassessment" },
          { id: "c", text: "Prepare oxygen support" },
          { id: "d", text: "Encourage immediate ambulation" },
        ],
      },
      {
        type: "multiple_response",
        correctOptionIds: ["a", "b"],
        userAnswer: ["a"],
        options: [
          { id: "a", text: "Raise side rails" },
          { id: "b", text: "Pad seizure rails" },
          { id: "c", text: "Insert tongue blade" },
          { id: "d", text: "Restrain the client" },
        ],
      },
    ]);

    expect(result).toMatchObject({
      total: 2,
      answeredCount: 2,
      correctCount: 1,
      incorrectCount: 1,
      score: 50,
    });
  });
});
