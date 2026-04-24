import {
  QUESTION_TYPES,
  buildQuestionReview,
  getSelectedOptionIds,
  isQuestionAnswered,
  scoreQuestion,
} from "./questionTypes";

describe("question type helpers", () => {
  it("keeps single_choice backward compatibility with text answers", () => {
    const question = {
      type: QUESTION_TYPES.SINGLE_CHOICE,
      correctAnswer: "Assess airway patency first",
      userAnswer: "Assess airway patency first",
      options: [
        { id: "a", text: "Start discharge teaching" },
        { id: "b", text: "Assess airway patency first" },
        { id: "c", text: "Document the finding" },
        { id: "d", text: "Offer oral fluids" },
      ],
    };

    expect(isQuestionAnswered(question)).toBe(true);
    expect(getSelectedOptionIds(question)).toEqual(["b"]);
    expect(scoreQuestion(question)).toBe(1);
  });

  it("supports multiple_response selection and all-or-nothing scoring", () => {
    const correctQuestion = {
      type: QUESTION_TYPES.MULTIPLE_RESPONSE,
      correctOptionIds: ["a", "c"],
      userAnswer: ["a", "c"],
      options: [
        { id: "a", text: "Place the client on oxygen" },
        { id: "b", text: "Delay the assessment for 30 minutes" },
        { id: "c", text: "Assess respiratory effort" },
        { id: "d", text: "Encourage ambulation immediately" },
      ],
    };
    const partialQuestion = {
      ...correctQuestion,
      userAnswer: ["a"],
    };
    const overSelectedQuestion = {
      ...correctQuestion,
      userAnswer: ["a", "c", "d"],
    };

    expect(scoreQuestion(correctQuestion)).toBe(1);
    expect(scoreQuestion(partialQuestion)).toBe(0);
    expect(scoreQuestion(overSelectedQuestion)).toBe(0);
  });

  it("builds result review details for SATA items", () => {
    const question = {
      type: QUESTION_TYPES.MULTIPLE_RESPONSE,
      correctOptionIds: ["a", "c"],
      userAnswer: ["a", "d"],
      options: [
        { id: "a", text: "Assess respiratory status", rationale: "This confirms oxygenation and work of breathing." },
        { id: "b", text: "Offer a full meal", rationale: "Feeding is not the immediate priority." },
        { id: "c", text: "Prepare supplemental oxygen", rationale: "This supports immediate oxygen needs." },
        { id: "d", text: "Ambulate the client now", rationale: "This can worsen instability." },
      ],
    };

    const review = buildQuestionReview(question);

    expect(review.isCorrect).toBe(false);
    expect(review.selectedOptions.map((option) => option.id)).toEqual(["a", "d"]);
    expect(review.correctOptions.map((option) => option.id)).toEqual(["a", "c"]);
    expect(review.missedCorrectOptions.map((option) => option.id)).toEqual(["c"]);
    expect(review.incorrectSelectedOptions.map((option) => option.id)).toEqual(["d"]);
    expect(review.options.every((option) => typeof option.rationale === "string")).toBe(true);
  });
});
