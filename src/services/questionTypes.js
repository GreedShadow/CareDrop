import { normalize } from "../caredrop/helpers";

export const QUESTION_TYPES = {
  SINGLE_CHOICE: "single_choice",
  MULTIPLE_RESPONSE: "multiple_response",
};

function optionIdFromIndex(index) {
  return ["a", "b", "c", "d", "e", "f"][index] || `option-${index + 1}`;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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

export function getCorrectAnswerText(question) {
  const options = getQuestionOptions(question);
  const correctIds = getCorrectOptionIds(question);
  const correctTexts = options
    .filter((option) => correctIds.includes(option.id))
    .map((option) => option.text)
    .filter(Boolean);

  if (correctTexts.length) {
    return correctTexts.join("; ");
  }

  return cleanText(question?.correctAnswer || question?.answer || "");
}

export function getQuestionRationaleText(question) {
  if (question?.rationale && typeof question.rationale === "object") {
    return cleanText(
      question.rationale.text ||
        [
          question.rationale.correct ? `Correct Answer Explanation: ${question.rationale.correct}` : "",
          question.rationale.incorrect && typeof question.rationale.incorrect === "object"
            ? `Incorrect Options Explanation: ${Object.values(question.rationale.incorrect).filter(Boolean).join(" ")}`
            : "",
          question.rationale.takeaway ? `Key Takeaway: ${question.rationale.takeaway}` : "",
        ]
          .filter(Boolean)
          .join(" ")
    );
  }

  return cleanText(question?.rationale || question?.rationaleText || "");
}

function normalizeRationale(question, correctText) {
  const raw = question?.rationale;
  const takeaway = cleanText(question?.keyTakeaway || question?.takeaway || question?.notes);

  if (raw && typeof raw === "object") {
    return {
      correct: cleanText(raw.correct || raw.correctExplanation || raw.correctAnswerExplanation),
      incorrect: raw.incorrect && typeof raw.incorrect === "object" ? raw.incorrect : {},
      takeaway: cleanText(raw.takeaway || raw.keyTakeaway || takeaway),
      text: cleanText(raw.text || raw.summary || ""),
    };
  }

  const text = cleanText(raw);
  return {
    correct: text || (correctText ? `The best answer is ${correctText}.` : ""),
    incorrect: {},
    takeaway,
    text,
  };
}

function inferTags(question) {
  const source = normalize(
    `${question?.prompt || question?.question || ""} ${question?.topic || ""} ${getQuestionRationaleText(question)}`
  );
  return [
    ["priority", /\b(priority|first|best|most important|initial|safest)\b/],
    ["assessment", /\b(assess|assessment|monitor|check|observe|vital|finding)\b/],
    ["safety", /\b(safe|safety|risk|harm|fall|infection|isolation)\b/],
    ["intervention", /\b(intervention|administer|position|oxygen|teach|notify|escalate)\b/],
    ["delegation", /\b(delegate|assign|supervise|uap|nursing assistant)\b/],
    ["patient-teaching", /\b(teach|teaching|instruction|education|discharge)\b/],
  ]
    .filter(([, pattern]) => pattern.test(source))
    .map(([tag]) => tag);
}

export function normalizeQuestion(question, overrides = {}) {
  const type = sanitizeQuestionType(question?.type || overrides.type, Boolean(overrides.allowMultipleResponse));
  const rawOptions = getQuestionOptions(question).filter((option) => cleanText(option.text));
  const options = rawOptions.map((option, index) => ({
    id: cleanText(option.id || optionIdFromIndex(index)),
    text: cleanText(option.text),
    rationale: cleanText(option.rationale),
  }));
  const optionIds = new Set(options.map((option) => option.id));
  const explicitCorrectIds = Array.isArray(question?.correctOptionIds)
    ? question.correctOptionIds.map((value) => String(value)).filter((value) => optionIds.has(value))
    : [];
  const correctAnswer = cleanText(question?.correctAnswer || question?.answer || "");
  const matchedCorrect = options.find((option) => normalize(option.text) === normalize(correctAnswer));
  const correctOptionIds =
    type === QUESTION_TYPES.MULTIPLE_RESPONSE
      ? explicitCorrectIds
      : matchedCorrect
        ? [matchedCorrect.id]
        : explicitCorrectIds.slice(0, 1);
  const correctText = correctOptionIds.length
    ? options.filter((option) => correctOptionIds.includes(option.id)).map((option) => option.text).join("; ")
    : correctAnswer;
  const rationale = normalizeRationale(question, correctText);

  return {
    id: cleanText(question?.id || overrides.id),
    type,
    subject: cleanText(question?.subject || overrides.subject || "Mixed Review"),
    topic: cleanText(question?.topic || overrides.topic || "general review"),
    difficulty: cleanText(question?.difficulty || overrides.difficulty || "medium").toLowerCase(),
    stem: cleanText(question?.stem || question?.prompt || question?.question),
    prompt: cleanText(question?.prompt || question?.stem || question?.question),
    scenario: cleanText(question?.scenario),
    options,
    correctAnswer: correctText,
    correctOptionIds,
    rationale,
    rationaleText: rationale.text || getQuestionRationaleText({ rationale }),
    notes: cleanText(question?.notes || question?.keyTakeaway || rationale.takeaway),
    tags: Array.isArray(question?.tags) && question.tags.length ? question.tags.map(cleanText).filter(Boolean) : inferTags(question),
    source: cleanText(question?.source || overrides.source || "bank"),
    userAnswer:
      type === QUESTION_TYPES.MULTIPLE_RESPONSE
        ? (Array.isArray(question?.userAnswer) ? question.userAnswer.map((value) => String(value)) : [])
        : question?.userAnswer ?? null,
    flagged: Boolean(question?.flagged),
  };
}

export function normalizeQuestions(questions, overrides = {}) {
  return (Array.isArray(questions) ? questions : []).map((question) => normalizeQuestion(question, overrides));
}

function sanitizeQuestionType(type, allowMultipleResponse = false) {
  if (allowMultipleResponse && type === QUESTION_TYPES.MULTIPLE_RESPONSE) {
    return QUESTION_TYPES.MULTIPLE_RESPONSE;
  }
  return QUESTION_TYPES.SINGLE_CHOICE;
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
