import { normalize } from "../caredrop/helpers";

export const QUESTION_TYPES = {
  SINGLE_CHOICE: "single_choice",
  MULTIPLE_RESPONSE: "multiple_response",
};

function optionIdFromIndex(index) {
  return `option-${index + 1}`;
}

export function getQuestionType(question) {
  return question?.type === QUESTION_TYPES.MULTIPLE_RESPONSE
    ? QUESTION_TYPES.MULTIPLE_RESPONSE
    : QUESTION_TYPES.SINGLE_CHOICE;
}

export function getQuestionOptions(question) {
  return (Array.isArray(question?.options) ? question.options : []).map((option, index) => {
    if (typeof option === "string") {
      return {
        id: optionIdFromIndex(index),
        text: option,
        rationale: "",
      };
    }

    return {
      id: String(option?.id || optionIdFromIndex(index)),
      text: String(option?.text || option?.label || option?.value || ""),
      rationale: String(option?.rationale || ""),
    };
  });
}

export function getCorrectOptionIds(question) {
  const options = getQuestionOptions(question);
  const optionIds = new Set(options.map((option) => option.id));

  if (getQuestionType(question) === QUESTION_TYPES.MULTIPLE_RESPONSE) {
    const explicitIds = (Array.isArray(question?.correctOptionIds) ? question.correctOptionIds : [])
      .map((value) => String(value))
      .filter((value) => optionIds.has(value));

    if (explicitIds.length) {
      return explicitIds;
    }
  }

  const correctAnswer = normalize(question?.correctAnswer || question?.answer || "");
  const match = options.find((option) => normalize(option.text) === correctAnswer);
  return match ? [match.id] : [];
}

export function getSelectedOptionIds(question) {
  if (getQuestionType(question) === QUESTION_TYPES.MULTIPLE_RESPONSE) {
    return Array.isArray(question?.userAnswer)
      ? question.userAnswer.map((value) => String(value))
      : [];
  }

  if (question?.userAnswer === null || question?.userAnswer === undefined || question?.userAnswer === "") {
    return [];
  }

  const options = getQuestionOptions(question);
  const directId = options.find((option) => option.id === question.userAnswer);
  if (directId) {
    return [directId.id];
  }

  const matchedText = options.find((option) => normalize(option.text) === normalize(question.userAnswer));
  return matchedText ? [matchedText.id] : [];
}

export function isQuestionAnswered(question) {
  return getSelectedOptionIds(question).length > 0;
}

export function scoreQuestion(question) {
  const selected = getSelectedOptionIds(question);
  const correct = getCorrectOptionIds(question);

  if (!selected.length || !correct.length) {
    return 0;
  }

  if (selected.length !== correct.length) {
    return 0;
  }

  return correct.every((id) => selected.includes(id)) ? 1 : 0;
}

export function buildQuestionReview(question) {
  const options = getQuestionOptions(question);
  const selectedIds = getSelectedOptionIds(question);
  const correctIds = getCorrectOptionIds(question);
  const selectedOptions = options.filter((option) => selectedIds.includes(option.id));
  const correctOptions = options.filter((option) => correctIds.includes(option.id));
  const missedCorrectOptions = options.filter(
    (option) => correctIds.includes(option.id) && !selectedIds.includes(option.id)
  );
  const incorrectSelectedOptions = options.filter(
    (option) => selectedIds.includes(option.id) && !correctIds.includes(option.id)
  );

  return {
    type: getQuestionType(question),
    options,
    selectedIds,
    correctIds,
    selectedOptions,
    correctOptions,
    missedCorrectOptions,
    incorrectSelectedOptions,
    isCorrect: scoreQuestion(question) === 1,
  };
}

