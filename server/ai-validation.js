const SUBJECT_HINTS = [
  "fundamentals",
  "pharmacology",
  "medical-surgical",
  "medical surgical",
  "maternal",
  "newborn",
  "pediatrics",
  "psychiatric",
  "community",
  "leadership",
  "management",
  "med-surg",
];

export const cardSchema = {
  type: "object",
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          subject: { type: "string" },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          question: { type: "string" },
          answer: { type: "string" },
          rationale: { type: "string" },
          notes: { type: "string" },
          topic: { type: "string" },
        },
        required: ["subject", "difficulty", "question", "answer", "rationale", "notes", "topic"],
      },
    },
  },
  required: ["cards"],
};

export const quizSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          subject: { type: "string" },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          topic: { type: "string" },
          prompt: { type: "string" },
          correctAnswer: { type: "string" },
          options: {
            type: "array",
            items: { type: "string" },
            minItems: 4,
            maxItems: 4,
          },
          rationale: { type: "string" },
          notes: { type: "string" },
        },
        required: ["subject", "difficulty", "topic", "prompt", "correctAnswer", "options", "rationale", "notes"],
      },
    },
  },
  required: ["questions"],
};

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasCategoryLeak(text) {
  const normalized = normalizeText(text).toLowerCase();
  return SUBJECT_HINTS.some((hint) => normalized.includes(hint));
}

function rationaleHasTeachingValue(text) {
  const normalized = normalizeText(text).toLowerCase();
  return (
    normalized.includes("because") &&
    (normalized.includes("other") ||
      normalized.includes("less appropriate") ||
      normalized.includes("less correct") ||
      normalized.includes("priority") ||
      normalized.includes("safest"))
  );
}

function buildValidationPrompt(basePrompt, attempt, issues) {
  if (!issues.length || attempt === 0) {
    return basePrompt;
  }

  return [
    basePrompt,
    "Validation feedback from the previous attempt:",
    ...issues.map((issue) => `- ${issue}`),
    "Retry and fix every listed problem. Return only valid JSON.",
  ].join("\n\n");
}

function validateCard(card, index, requestedDifficulty) {
  const issues = [];
  const question = normalizeText(card?.question);
  const answer = normalizeText(card?.answer);
  const rationale = normalizeText(card?.rationale);
  const notes = normalizeText(card?.notes);
  const topic = normalizeText(card?.topic);
  const difficulty = normalizeText(card?.difficulty).toLowerCase();

  if (!question || question.length < 12) issues.push(`card ${index + 1}: question is too short`);
  if (!answer || answer.length < 6) issues.push(`card ${index + 1}: answer is too short`);
  if (!rationale || rationale.length < 12) issues.push(`card ${index + 1}: rationale is too short`);
  if (!notes || notes.length < 12) issues.push(`card ${index + 1}: key takeaway is too short`);
  if (!topic) issues.push(`card ${index + 1}: topic is missing`);
  if (!rationaleHasTeachingValue(rationale)) {
    issues.push(`card ${index + 1}: rationale should explain why the answer matters`);
  }
  if (requestedDifficulty !== "mixed" && difficulty !== requestedDifficulty) {
    issues.push(`card ${index + 1}: difficulty must stay ${requestedDifficulty}`);
  }

  return issues;
}

function validateQuestion(question, index, requestedDifficulty) {
  const issues = [];
  const prompt = normalizeText(question?.prompt);
  const correctAnswer = normalizeText(question?.correctAnswer);
  const rationale = normalizeText(question?.rationale);
  const options = Array.isArray(question?.options) ? question.options.map(normalizeText) : [];
  const difficulty = normalizeText(question?.difficulty).toLowerCase();

  if (!prompt || prompt.length < 12) issues.push(`question ${index + 1}: prompt is too short`);
  if (options.length !== 4) issues.push(`question ${index + 1}: must have exactly 4 options`);
  if (new Set(options.map((option) => option.toLowerCase())).size !== 4) {
    issues.push(`question ${index + 1}: options must be distinct`);
  }
  if (!options.includes(correctAnswer)) {
    issues.push(`question ${index + 1}: correct answer must appear inside options`);
  }
  if (options.some((option) => option.length < 2)) {
    issues.push(`question ${index + 1}: options contain empty or too-short entries`);
  }
  if (options.some(hasCategoryLeak)) {
    issues.push(`question ${index + 1}: options leak subject/category hints`);
  }
  if (hasCategoryLeak(correctAnswer)) {
    issues.push(`question ${index + 1}: correct answer leaks subject/category hints`);
  }
  if (!rationale || rationale.length < 12) {
    issues.push(`question ${index + 1}: rationale is too short`);
  }
  if (!rationaleHasTeachingValue(rationale)) {
    issues.push(`question ${index + 1}: rationale must explain why the best answer is correct and why the others are weaker`);
  }
  if (requestedDifficulty !== "mixed" && difficulty !== requestedDifficulty) {
    issues.push(`question ${index + 1}: difficulty must stay ${requestedDifficulty}`);
  }

  return issues;
}

export async function generateValidatedCards({
  client,
  generateJson,
  systemInstruction,
  prompt,
  count,
  difficulty = "mixed",
  maxOutputTokens = 2200,
  logger = console,
}) {
  const failureReasons = [];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parsed = await generateJson(client, {
      systemInstruction,
      prompt: buildValidationPrompt(prompt, attempt, failureReasons.slice(-8)),
      schema: cardSchema,
      maxOutputTokens,
    });

    const cards = Array.isArray(parsed?.cards) ? parsed.cards.slice(0, count) : [];
    const issues = [];

    if (cards.length < Math.min(count, 4)) {
      issues.push(`expected ${count} cards but received ${cards.length}`);
    }

    const seenQuestions = new Set();
    cards.forEach((card, index) => {
      issues.push(...validateCard(card, index, difficulty));
      const key = normalizeText(card?.question).toLowerCase();
      if (key) {
        if (seenQuestions.has(key)) {
          issues.push(`card ${index + 1}: duplicate question detected`);
        }
        seenQuestions.add(key);
      }
    });

    if (!issues.length) {
      return cards;
    }

    failureReasons.push(...issues);
    logger.warn("AI flashcard validation retry", { attempt: attempt + 1, issues });
  }

  logger.error("AI flashcard validation failed", { failureReasons });
  throw new Error("The AI returned invalid flashcards repeatedly. Please try again.");
}

export async function generateValidatedQuestions({
  client,
  generateJson,
  systemInstruction,
  prompt,
  count,
  difficulty = "mixed",
  maxOutputTokens = 3600,
  logger = console,
}) {
  const failureReasons = [];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parsed = await generateJson(client, {
      systemInstruction,
      prompt: buildValidationPrompt(prompt, attempt, failureReasons.slice(-10)),
      schema: quizSchema,
      maxOutputTokens,
    });

    const questions = Array.isArray(parsed?.questions) ? parsed.questions.slice(0, count) : [];
    const issues = [];

    if (questions.length < Math.min(count, 4)) {
      issues.push(`expected ${count} questions but received ${questions.length}`);
    }

    const seenPrompts = new Set();
    questions.forEach((question, index) => {
      issues.push(...validateQuestion(question, index, difficulty));
      const key = normalizeText(question?.prompt).toLowerCase();
      if (key) {
        if (seenPrompts.has(key)) {
          issues.push(`question ${index + 1}: duplicate prompt detected`);
        }
        seenPrompts.add(key);
      }
    });

    if (!issues.length) {
      return questions;
    }

    failureReasons.push(...issues);
    logger.warn("AI quiz validation retry", { attempt: attempt + 1, issues });
  }

  logger.error("AI quiz validation failed", { failureReasons });
  throw new Error("The AI returned invalid quiz questions repeatedly. Please try again.");
}
