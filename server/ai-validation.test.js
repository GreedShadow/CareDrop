import { describe, expect, it } from "vitest";

import { generateValidatedQuestions } from "./ai-validation.js";

describe("ai-validation", () => {
  it("retries malformed MCQs until they become valid", async () => {
    let attempt = 0;
    const fakeGenerateJson = async () => {
      attempt += 1;
      if (attempt === 1) {
        return {
          questions: [
            {
              subject: "Pharmacology",
              difficulty: "medium",
              topic: "cardio",
              prompt: "Which drug is best?",
              correctAnswer: "Pharmacology clue",
              options: ["Pharmacology clue", "Pharmacology clue", "B", "C"],
              rationale: "short",
              notes: "n",
            },
          ],
        };
      }

      return {
        questions: [
          {
            subject: "Pharmacology",
            difficulty: "medium",
            topic: "cardio",
            prompt: "Which action best fits a patient receiving digoxin with a low pulse?",
            correctAnswer: "Hold the medication and assess the apical pulse again before notifying the provider.",
            options: [
              "Hold the medication and assess the apical pulse again before notifying the provider.",
              "Give the medication with food to reduce nausea.",
              "Administer the dose early to avoid a missed level.",
              "Increase the next dose if the pulse stays low.",
            ],
            rationale: "A low pulse can signal increased risk, so holding and reassessing is the safest next nursing action.",
            notes: "Focus on the safest nursing priority.",
          },
        ],
      };
    };

    const questions = await generateValidatedQuestions({
      client: {},
      generateJson: fakeGenerateJson,
      systemInstruction: "test",
      prompt: "test",
      count: 1,
      difficulty: "medium",
      logger: { warn() {}, error() {} },
    });

    expect(attempt).toBe(2);
    expect(questions).toHaveLength(1);
    expect(questions[0].options).toHaveLength(4);
  });
});
