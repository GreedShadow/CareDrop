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
          type: { type: "string", enum: ["single_choice", "multiple_response"] },
          prompt: { type: "string" },
          correctAnswer: { type: "string" },
          options: {
            type: "array",
            items: {
              anyOf: [
                { type: "string" },
                {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    text: { type: "string" },
                    rationale: { type: "string" },
                  },
                  required: ["id", "text"],
                },
              ],
            },
            minItems: 4,
            maxItems: 5,
          },
          correctOptionIds: {
            type: "array",
            items: { type: "string" },
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

export const SUMMARY_SECTION_HEADINGS = [
  "Key Concepts",
  "Important Terms",
  "Signs and Symptoms",
  "Nursing Interventions",
  "Patient Teaching",
  "Safety Considerations",
  "Exam Traps",
  "High-Yield PNLE Points",
];

const CLINICAL_REASONING_CUES = [
  "first",
  "best",
  "priority",
  "most important",
  "initial",
  "immediate",
  "safest",
  "assessment",
  "intervention",
  "teaching",
  "monitor",
  "delegate",
  "client",
  "patient",
  "nurse",
  "symptom",
  "sign",
  "risk",
  "complication",
  "contraindication",
  "adverse",
  "emergency",
  "unstable",
  "airway",
  "breathing",
  "circulation",
];

const LOW_QUALITY_OPTION_PATTERNS = [
  /all of the above/i,
  /none of the above/i,
  /both a and b/i,
  /always/i,
  /never/i,
  /joke/i,
  /random/i,
  /unrelated/i,
  /not sure/i,
  /maybe/i,
];

const SUMMARY_STOP_WORDS = new Set([
  "about",
  "after",
  "before",
  "between",
  "client",
  "clients",
  "clinical",
  "common",
  "considerations",
  "disease",
  "during",
  "important",
  "include",
  "includes",
  "intervention",
  "interventions",
  "management",
  "material",
  "monitor",
  "nurse",
  "nurses",
  "nursing",
  "patient",
  "patients",
  "priority",
  "report",
  "review",
  "safety",
  "should",
  "signs",
  "symptoms",
  "teaching",
  "their",
  "these",
  "those",
  "where",
  "which",
  "while",
  "with",
]);

const KNOWN_TOPIC_TERMS = [
  "stroke",
  "cva",
  "ischemic",
  "hemorrhagic",
  "thrombolytic",
  "alteplase",
  "tpa",
  "seizure",
  "diabetes",
  "insulin",
  "hypertension",
  "shock",
  "perfusion",
  "sepsis",
  "dengue",
  "tuberculosis",
  "pneumonia",
  "asthma",
  "bronchiolitis",
  "heart failure",
  "myocardial",
  "postpartum",
  "preeclampsia",
  "heparin",
  "warfarin",
  "digoxin",
];

const AMBIGUOUS_STEM_PATTERNS = [
  /^what is (the )?(definition|meaning) of\b/i,
  /^which statement is true\??$/i,
  /\bit depends\b/i,
  /\bchoose the correct answer\b/i,
  /\bselect the best answer\b/i,
];

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSourceKeywords(text, limit = 10) {
  const counts = {};
  normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 5 && !SUMMARY_STOP_WORDS.has(word))
    .forEach((word) => {
      counts[word] = (counts[word] || 0) + 1;
    });

  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .map(([word]) => word)
    .slice(0, limit);
}

function validateSummaryGrounding(summary, sourceText) {
  const issues = [];
  const source = normalizeText(sourceText).toLowerCase();
  const generated = normalizeText(summary).toLowerCase();

  if (!source || source.length < 80) {
    return issues;
  }

  const sourceKeywords = extractSourceKeywords(source, 12);
  const matchedKeywords = sourceKeywords.filter((keyword) => generated.includes(keyword));
  const requiredMatches = Math.min(3, Math.max(1, Math.ceil(sourceKeywords.length * 0.25)));

  if (sourceKeywords.length >= 4 && matchedKeywords.length < requiredMatches) {
    issues.push(
      `summary appears weakly grounded in the uploaded file; matched ${matchedKeywords.length}/${sourceKeywords.length} source keywords`
    );
  }

  const sourceTopicTerms = KNOWN_TOPIC_TERMS.filter((term) => source.includes(term));
  const generatedTopicTerms = KNOWN_TOPIC_TERMS.filter((term) => generated.includes(term));
  const unsupportedTerms = generatedTopicTerms.filter((term) => !sourceTopicTerms.includes(term));

  if (unsupportedTerms.length >= 2) {
    issues.push(`summary introduces unsupported topic content: ${unsupportedTerms.slice(0, 5).join(", ")}`);
  }

  return issues;
}

function hasCategoryLeak(text) {
  const normalized = normalizeText(text).toLowerCase();
  return SUBJECT_HINTS.some((hint) => normalized.includes(hint));
}

function rationaleHasTeachingValue(text) {
  const normalized = normalizeText(text).toLowerCase();
  return (
    (normalized.includes("correct answer explanation") ||
      normalized.includes("why the correct answer") ||
      normalized.includes("because")) &&
    (normalized.includes("incorrect options explanation") ||
      normalized.includes("less appropriate") ||
      normalized.includes("less correct") ||
      normalized.includes("weaker") ||
      normalized.includes("wrong choice") ||
      normalized.includes("distractor") ||
      normalized.includes("priority") ||
      normalized.includes("safest")) &&
    (normalized.includes("key takeaway") || normalized.includes("remember") || normalized.includes("board"))
  );
}

function cardRationaleHasTeachingValue(text) {
  const normalized = normalizeText(text).toLowerCase();
  return (
    normalized.length >= 24 &&
    (normalized.includes("because") ||
      normalized.includes("rationale") ||
      normalized.includes("priority") ||
      normalized.includes("safety") ||
      normalized.includes("assessment") ||
      normalized.includes("intervention") ||
      normalized.includes("teaching")) &&
    (normalized.includes("takeaway") ||
      normalized.includes("remember") ||
      normalized.includes("board") ||
      normalized.includes("pnle") ||
      normalized.includes("nle") ||
      normalized.includes("clinical"))
  );
}

function hasClinicalReasoningCue(...values) {
  const normalized = normalizeText(values.filter(Boolean).join(" ")).toLowerCase();
  return CLINICAL_REASONING_CUES.some((cue) => normalized.includes(cue));
}

function hasAmbiguousStem(text) {
  const normalized = normalizeText(text);
  return AMBIGUOUS_STEM_PATTERNS.some((pattern) => pattern.test(normalized));
}

function hasWeakOption(text) {
  const normalized = normalizeText(text);
  return LOW_QUALITY_OPTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function hasRepeatedOptionPattern(options) {
  const starters = options
    .map((option) => normalizeText(option).toLowerCase().split(" ").slice(0, 3).join(" "))
    .filter(Boolean);
  if (starters.length < 4) {
    return false;
  }

  const counts = starters.reduce((accumulator, starter) => {
    accumulator[starter] = (accumulator[starter] || 0) + 1;
    return accumulator;
  }, {});

  return Object.values(counts).some((count) => count >= 3);
}

function optionRationalesHaveValue(rawOptions) {
  const optionObjects = rawOptions.filter((option) => typeof option === "object" && option);
  if (!optionObjects.length) {
    return true;
  }

  return optionObjects.every((option) => {
    const rationale = normalizeText(option.rationale);
    return !rationale || rationale.length >= 16;
  });
}

function buildValidationPrompt(basePrompt, attempt, issues, retryInstruction = "Retry and fix every listed problem. Return only valid JSON.") {
  if (!issues.length || attempt === 0) {
    return basePrompt;
  }

  return [
    basePrompt,
    "Validation feedback from the previous attempt:",
    ...issues.map((issue) => `- ${issue}`),
    retryInstruction,
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
  if (hasAmbiguousStem(question)) issues.push(`card ${index + 1}: question is too broad or ambiguous`);
  if (!hasClinicalReasoningCue(question, answer, rationale, notes)) {
    issues.push(`card ${index + 1}: card needs a clearer nursing priority, safety, assessment, or teaching cue`);
  }
  if (!cardRationaleHasTeachingValue(`${rationale} ${notes}`)) {
    issues.push(`card ${index + 1}: rationale should include the correct-answer reason and key takeaway`);
  }
  if (requestedDifficulty !== "mixed" && difficulty !== requestedDifficulty) {
    issues.push(`card ${index + 1}: difficulty must stay ${requestedDifficulty}`);
  }

  return issues;
}

export function validateQuestion(question, index, requestedDifficulty) {
  const issues = [];
  const prompt = normalizeText(question?.prompt);
  const correctAnswer = normalizeText(question?.correctAnswer);
  const rationale = normalizeText(question?.rationale);
  const type = normalizeText(question?.type || "single_choice");
  const rawOptions = Array.isArray(question?.options) ? question.options : [];
  const options = rawOptions.map((option) => normalizeText(typeof option === "string" ? option : option?.text));
  const difficulty = normalizeText(question?.difficulty).toLowerCase();
  const correctOptionIds = Array.isArray(question?.correctOptionIds) ? question.correctOptionIds.map(normalizeText) : [];
  const optionIds = rawOptions.map((option, optionIndex) =>
    normalizeText(typeof option === "string" ? `option-${optionIndex + 1}` : option?.id || `option-${optionIndex + 1}`)
  );

  if (!prompt || prompt.length < 18) issues.push(`question ${index + 1}: prompt is too short`);
  if (hasAmbiguousStem(prompt)) issues.push(`question ${index + 1}: prompt is too broad or ambiguous`);
  if (!hasClinicalReasoningCue(prompt, rationale, question?.notes)) {
    issues.push(`question ${index + 1}: prompt should require nursing clinical reasoning, prioritization, assessment, or intervention logic`);
  }
  if (options.length < 4 || options.length > 5) issues.push(`question ${index + 1}: must have 4 to 5 options`);
  if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) {
    issues.push(`question ${index + 1}: options must be distinct`);
  }
  if (options.some(hasWeakOption)) {
    issues.push(`question ${index + 1}: options contain low-quality or giveaway wording`);
  }
  if (hasRepeatedOptionPattern(options)) {
    issues.push(`question ${index + 1}: options repeat a wording pattern that may leak the answer`);
  }
  if (!optionRationalesHaveValue(rawOptions)) {
    issues.push(`question ${index + 1}: option rationales are too vague`);
  }
  if (type === "multiple_response") {
    if (correctOptionIds.length < 2) {
      issues.push(`question ${index + 1}: SATA items need at least two correctOptionIds`);
    }
    if (correctOptionIds.length >= options.length && options.length) {
      issues.push(`question ${index + 1}: SATA items cannot have every option marked correct`);
    }
    if (new Set(correctOptionIds).size !== correctOptionIds.length) {
      issues.push(`question ${index + 1}: SATA correctOptionIds must be distinct`);
    }
    if (!correctOptionIds.every((id) => optionIds.includes(id))) {
      issues.push(`question ${index + 1}: SATA correctOptionIds must match real option ids`);
    }
  } else if (!options.map((option) => option.toLowerCase()).includes(correctAnswer.toLowerCase())) {
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
    issues.push(`question ${index + 1}: rationale must include correct answer explanation, incorrect options explanation, and key takeaway`);
  }
  if (requestedDifficulty !== "mixed" && difficulty !== requestedDifficulty) {
    issues.push(`question ${index + 1}: difficulty must stay ${requestedDifficulty}`);
  }

  return issues;
}

export function validateSummary(summary, sourceText = "") {
  const issues = [];
  const normalized = normalizeText(summary);
  const lower = normalized.toLowerCase();

  if (!normalized || normalized.length < 300) {
    issues.push("summary is too short to be useful as a reviewer");
  }

  SUMMARY_SECTION_HEADINGS.forEach((heading) => {
    if (!lower.includes(heading.toLowerCase())) {
      issues.push(`summary is missing section: ${heading}`);
    }
  });

  if (!/[-*]\s+\S/.test(summary)) {
    issues.push("summary should use bullet points for scan-friendly review");
  }

  if (!hasClinicalReasoningCue(summary)) {
    issues.push("summary needs clearer nursing assessment, intervention, safety, or teaching cues");
  }

  issues.push(...validateSummaryGrounding(summary, sourceText));

  return issues;
}

export async function generateValidatedSummary({
  client,
  generateText,
  systemInstruction,
  prompt,
  sourceText = "",
  maxOutputTokens = 2600,
  attempts = 3,
  timeoutMs,
  logger = console,
}) {
  const failureReasons = [];

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const summary = await generateText(
      client,
      {
        systemInstruction,
        prompt: buildValidationPrompt(
          prompt,
          attempt,
          failureReasons.slice(-8),
          "Retry and fix every listed problem. Return the same plain-text reviewer-summary format, not JSON."
        ),
        maxOutputTokens,
      },
      timeoutMs
    );
    const issues = validateSummary(summary, sourceText);

    if (!issues.length) {
      return summary;
    }

    failureReasons.push(...issues);
    logger.warn("AI summary validation retry", { attempt: attempt + 1, issues });
  }

  logger.error("AI summary validation failed", { failureReasons });
  throw new Error("The AI returned an incomplete reviewer summary repeatedly. Please try again.");
}

export async function generateValidatedCards({
  client,
  generateJson,
  systemInstruction,
  prompt,
  count,
  difficulty = "mixed",
  maxOutputTokens = 2200,
  attempts = 3,
  timeoutMs,
  logger = console,
}) {
  const failureReasons = [];

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const parsed = await generateJson(
      client,
      {
        systemInstruction,
        prompt: buildValidationPrompt(prompt, attempt, failureReasons.slice(-8)),
        schema: cardSchema,
        maxOutputTokens,
      },
      timeoutMs
    );

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
  attempts = 3,
  timeoutMs,
  logger = console,
}) {
  const failureReasons = [];

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const parsed = await generateJson(
      client,
      {
        systemInstruction,
        prompt: buildValidationPrompt(prompt, attempt, failureReasons.slice(-10)),
        schema: quizSchema,
        maxOutputTokens,
      },
      timeoutMs
    );

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


