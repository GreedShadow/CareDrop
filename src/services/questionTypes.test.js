import {
  QUESTION_TYPES,
  buildQuestionReview,
  getQuestionRationaleText,
  getSelectedOptionIds,
  isQuestionAnswered,
  normalizeQuestion,
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

  it("normalizes legacy questions into the richer internal schema", () => {
    const question = normalizeQuestion({
      subject: "Fundamentals",
      topic: "pulmonary tuberculosis",
      difficulty: "medium",
      prompt: "Which isolation is safest for pulmonary tuberculosis?",
      correctAnswer: "Airborne isolation with N95 mask use",
      options: [
        "Droplet precautions only",
        "Airborne isolation with N95 mask use",
        "Standard precautions only",
        "Contact precautions only",
      ],
      rationale: "Correct Answer Explanation: TB needs airborne precautions. Incorrect Options Explanation: Other options do not prevent airborne transmission. Key Takeaway: Use airborne isolation for pulmonary TB.",
    });

    expect(question.stem).toBe("Which isolation is safest for pulmonary tuberculosis?");
    expect(question.options.map((option) => option.id)).toEqual(["a", "b", "c", "d"]);
    expect(question.correctOptionIds).toEqual(["b"]);
    expect(question.correctAnswer).toBe("Airborne isolation with N95 mask use");
    expect(question.rationale.correct).toContain("TB needs airborne precautions");
    expect(question.tags).toContain("safety");
    expect(scoreQuestion({ ...question, userAnswer: "b" })).toBe(1);
  });

  it("renders structured rationale objects without object leakage", () => {
    const question = normalizeQuestion({
      subject: "Medical-Surgical Nursing",
      topic: "pulmonary edema",
      difficulty: "hard",
      prompt: "A client with pulmonary edema becomes severely dyspneic. Which action is the priority?",
      correctAnswer: "Position the client upright and apply oxygen as prescribed",
      options: [
        { id: "a", text: "Position the client upright and apply oxygen as prescribed" },
        { id: "b", text: "Encourage oral fluids to thin secretions" },
        { id: "c", text: "Delay intervention until the provider arrives" },
        { id: "d", text: "Place the client flat to improve venous return" },
      ],
      rationale: {
        correct: "Upright positioning and oxygen improve ventilation and reduce work of breathing.",
        incorrect: {
          b: "Extra fluids can worsen fluid overload.",
          c: "Immediate nursing action is required for respiratory distress.",
          d: "A flat position can worsen dyspnea.",
        },
        takeaway: "Treat acute breathing compromise before lower-priority interventions.",
      },
    });

    const rationale = getQuestionRationaleText(question);

    expect(rationale).toContain("Correct Answer Explanation");
    expect(rationale).toContain("Incorrect Options Explanation");
    expect(rationale).toContain("Key Takeaway");
    expect(rationale).not.toContain("[object Object]");
  });
});
