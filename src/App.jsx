import { useEffect, useMemo, useRef, useState } from "react";
import { Menu, MessageCircleMore, X } from "lucide-react";
import {
  AIPanel,
  AnalyticsCard,
  Badge,
  Flashcard,
  HeroMetric,
  ProgressRing,
  SidebarNavButton,
  SubjectTab,
  ThemeToggle,
} from "./caredrop/components";
import {
  FLASHCARD_SET_SIZE,
  LOGO_SRC,
  QUIZ_SET_SIZE,
  RECENT_MEMORY_LIMIT,
  REQUEST_STORAGE_KEY,
  SIMULATION_BATCH_SIZE,
  SIMULATION_SIZE_OPTIONS,
  SUPPORTED_UPLOAD_EXTENSIONS,
} from "./caredrop/constants";
import {
  buildStudyText,
  clearAuthSession,
  getAuthRedirectUrl,
  getDateKey,
  getGreeting,
  getJson,
  getLocalDateLabel,
  getProgressStorageKey,
  getStudyStreak,
  hashSecret,
  isAdminEmail,
  loadAccounts,
  loadAuthSession,
  loadPersisted,
  loadRequestPersisted,
  mapSupabaseUser,
  normalizeAiErrorMessage,
  normalizeAuthErrorMessage,
  postJson,
  readTextFileLocally,
  saveAccounts,
  saveAuthSession,
  uploadFileForExtraction,
  useWindowWidth,
} from "./caredrop/app-utils";
import { clamp, formatTopicHeading, normalize, shuffle, uid, uniqueBy } from "./caredrop/helpers";
import {
  buildCalendarDays,
  coerceDate,
  formatDateKey,
  getDateInputValue,
  getMonthLabel,
  getOverduePlannerItems,
  getPlannerCompletionRate,
  getUpcomingEvents,
  PLANNER_EVENT_TYPES,
  PLANNER_MODE_OPTIONS,
  shiftMonth,
  sortByDateAsc,
  sortByDateDesc,
} from "./caredrop/planning";
import { applyThemeMode, C, getPreferredThemeMode, persistThemeMode } from "./caredrop/theme";
import { RequestModal } from "./features/admin/RequestModal";
import { AuthScreen } from "./features/auth/AuthScreen";
import { TermsModal } from "./features/auth/TermsModal";
import { SavedSessionCard } from "./features/history/SavedSessionCard";
import { ErrorBoundary } from "./features/shared/ErrorBoundary";
import { useAdaptiveInsights } from "./hooks/useAdaptiveInsights";
import { safeArray, safeMode, safeObject, safeString, useInactivityTimeout } from "./hooks/useProgressPersistence";
import {
  buildProgressSnapshot,
  loadRemoteSnapshot,
  persistLocalSnapshot,
  saveRemoteSnapshot,
} from "./services/progressRepository";
import { buildRemediationEntries, collectIncorrectQuestions, getTopicSearchTerms } from "./services/remediation";
import {
  buildDueFlashcardPool,
  getDueTodayCount,
  updateCardSchedule,
} from "./services/spacedRepetition";
import {
  buildQuestionReview,
  getCorrectOptionIds,
  getQuestionOptions,
  getQuestionType,
  getSelectedOptionIds,
  isQuestionAnswered,
  QUESTION_TYPES,
  scoreQuestion,
} from "./services/questionTypes";
import {
  BANK_ITEMS_PER_BUCKET,
  BUCKET_DIFFICULTIES,
  FLASHCARD_RATING_POINTS,
  QUESTION_LEAD_INS,
  QUESTION_TEMPLATES,
  SEED_QUESTION_BANK,
  SLOW_RESPONSE_THRESHOLDS_MS,
} from "./data/questionBank/index.js";
import { supabase, supabaseConfigured } from "./lib/supabaseClient";

function normalizeSeedKey(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

function buildExpandedQuestion(entry, subject, difficulty, variantIndex) {
  const leadIn = QUESTION_LEAD_INS[Math.floor(variantIndex / QUESTION_TEMPLATES.length) % QUESTION_LEAD_INS.length];
  const template = QUESTION_TEMPLATES[variantIndex % QUESTION_TEMPLATES.length];
  return `${leadIn} ${template(entry, subject, difficulty)}`.trim();
}

function buildExpandedAnswer(entry, subject, difficulty, variantIndex) {
  return String(entry.a || "").trim();
}

function buildExpandedBank(seedBank, targetPerBucket = BANK_ITEMS_PER_BUCKET) {
  const bank = {};

  for (const [subject, entries] of Object.entries(seedBank)) {
    bank[subject] = [];

    for (const difficulty of BUCKET_DIFFICULTIES) {
      const seeds = entries.filter((entry) => entry.difficulty === difficulty);
      const bucket = [];
      const seen = new Set();

      if (!seeds.length) {
        continue;
      }

      let variantIndex = 0;
      while (bucket.length < targetPerBucket && variantIndex < targetPerBucket * 30) {
        const seed = seeds[variantIndex % seeds.length];
        const question = buildExpandedQuestion(seed, subject, difficulty, variantIndex);
        const key = `${subject}-${difficulty}-${normalizeSeedKey(question)}`;

        if (!seen.has(key)) {
          seen.add(key);
          bucket.push({
            ...seed,
            q: question,
            a: buildExpandedAnswer(seed, subject, difficulty, variantIndex),
            subject,
            difficulty,
            seedQuestion: seed.q,
          });
        }

        variantIndex += 1;
      }

      bank[subject].push(...bucket);
    }
  }

  return bank;
}

const QUESTION_BANK = buildExpandedBank(SEED_QUESTION_BANK);
const ALL_BANK_ENTRIES = Object.entries(QUESTION_BANK).flatMap(([subject, entries]) =>
  entries.map((entry) => ({ ...entry, subject }))
);
const SUBJECT_OPTIONS = [...Object.keys(QUESTION_BANK), "Mixed Review"];
const DIFFICULTIES = ["All", "easy", "medium", "hard"];
const ENCOURAGEMENTS = [
  "You've got this, future RN.",
  "One focused session at a time still counts.",
  "Read the stem slowly. Your nursing judgment is getting stronger.",
  "Progress matters more than perfection.",
  "The board exam is hard. You're training for it every day.",
  "A calm review session still moves you forward.",
  "Missed questions are still helping you pass.",
  "You are building safe instincts, not just memorizing facts.",
  "Small wins count on low-energy days too.",
  "Pause, breathe, then trust your nursing priorities.",
  "Every set you finish sharpens your recall.",
  "This is hard work, and you are doing it well.",
  "You can be gentle with yourself and still make strong progress.",
  "One more set is one more step closer.",
  "Slow progress is still real progress.",
];

const SUBJECT_VISUALS = {
  Fundamentals: { icon: "📚", color: "linear-gradient(90deg, #3B82F6 0%, #22D3EE 100%)" },
  Pharmacology: { icon: "💊", color: "linear-gradient(90deg, #A855F7 0%, #EC4899 100%)" },
  "Medical-Surgical": { icon: "🏥", color: "linear-gradient(90deg, #10B981 0%, #2DD4BF 100%)" },
  "Maternal & Newborn": { icon: "👶", color: "linear-gradient(90deg, #F472B6 0%, #FF3D9A 100%)" },
  Pediatrics: { icon: "🧸", color: "linear-gradient(90deg, #F59E0B 0%, #F97316 100%)" },
  "Psychiatric Nursing": { icon: "🧠", color: "linear-gradient(90deg, #8B5CF6 0%, #A78BFA 100%)" },
  "Community Health": { icon: "🌍", color: "linear-gradient(90deg, #14B8A6 0%, #34D399 100%)" },
  "Leadership & Management": { icon: "🧭", color: "linear-gradient(90deg, #60A5FA 0%, #22C55E 100%)" },
};

function buildLocalSummary(text) {
  const cleaned = String(text || "").replace(/\r/g, " ").trim();
  if (!cleaned) {
    return "Paste notes or upload a document to generate a reviewer summary.";
  }

  const parts = sentenceSplit(cleaned).slice(0, 28);

  if (!parts.length) {
    return "Paste notes or upload a document to generate a reviewer summary.";
  }

  const inferredSubject = inferSubject(cleaned);
  const keywordLines = extractKeywords(cleaned).slice(0, 6);
  const topicGroups = new Map();

  parts.forEach((line) => {
    const topic = inferTopic(line);
    if (!topicGroups.has(topic)) {
      topicGroups.set(topic, []);
    }
    topicGroups.get(topic).push(line);
  });

  const groupedTopics = Array.from(topicGroups.entries())
    .sort((left, right) => right[1].length - left[1].length)
    .slice(0, 5);

  const lines = [
    "Key Concepts",
    `- Likely focus: ${inferredSubject}.`,
    `- Main point: ${parts[0]}`,
    `- Topics found: ${groupedTopics.map(([topic]) => formatTopicHeading(topic)).join(", ") || "General nursing review"}.`,
    "",
    "Important Terms",
    ...(keywordLines.length
      ? keywordLines.map((keyword) => `- ${keyword}`)
      : ["- Key terms will become clearer after more detailed notes are added."]),
    "",
    "Signs and Symptoms",
  ];

  groupedTopics.forEach(([topic, topicLines], index) => {
    const overview = topicLines[0];
    const detailPoints = topicLines.slice(0, 5);
    const assessmentCue =
      topicLines.find((line) =>
        /(assess|monitor|observe|check|evaluate|vital signs|inspect|palpate|auscultate)/i.test(line)
      ) || topicLines[1] || overview;
    const interventionCue =
      topicLines.find((line) =>
        /(intervention|administer|position|teach|educate|withhold|notify|support|oxygen|fluids|medication|manage)/i.test(line)
      ) || topicLines[2] || overview;
    const cautionCue =
      topicLines.find((line) =>
        /(priority|first|unsafe|critical|warning|monitor|withhold|notify|emergency|contraindicat|risk|avoid|do not|unless|only if)/i.test(line)
      ) || "";

    lines.push(`- ${formatTopicHeading(topic)}: ${overview}`);
    detailPoints.slice(1, 3).forEach((line) => {
      lines.push(`- ${formatTopicHeading(topic)} cue: ${line}`);
    });
    lines.push(`- ${formatTopicHeading(topic)} assessment cue: ${assessmentCue}`);
    lines.push(`- ${formatTopicHeading(topic)} intervention cue: ${interventionCue}`);
    if (cautionCue) {
      lines.push(`- ${formatTopicHeading(topic)} safety limit: ${cautionCue}`);
    }
  });

  lines.push(
    "",
    "Nursing Interventions",
    ...groupedTopics.map(([topic, topicLines]) => {
      const cue =
        topicLines.find((line) =>
          /(intervention|administer|position|teach|educate|withhold|notify|support|oxygen|fluids|medication|manage)/i.test(line)
        ) || topicLines[0];
      return `- ${formatTopicHeading(topic)}: prioritize the safest nursing action supported by the notes. ${cue}`;
    }),
    "",
    "Patient Teaching",
    "- Explain warning signs, medication precautions, follow-up needs, and when to seek help using the learner's source material.",
    "- Keep teaching concrete: what to report, what to avoid, and what the client should do next.",
    "",
    "Safety Considerations",
    "- Preserve any source warnings, contraindications, limits, or only-if conditions before choosing an intervention.",
    "- In PNLE-style items, assess instability and safety risks before routine care.",
    "",
    "Exam Traps",
    "- Do not choose an intervention before assessment when the stem asks for the first nursing action.",
    "- Watch for answers that are possible but not the safest, most immediate, or most patient-centered.",
    "",
    "High-Yield PNLE Points",
    "- Use each topic as a separate review target, then convert the same material into flashcards or quiz questions.",
    "- Focus on clue words such as first, best, priority, most important, monitor, and teach."
  );

  return lines.join("\n");
}

function sentenceSplit(text) {
  return String(text || "")
    .replace(/\r/g, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 24);
}

function extractKeywords(text) {
  const stopWords = new Set([
    "about", "after", "again", "because", "before", "between", "during", "every", "focus",
    "their", "there", "these", "those", "under", "which", "while", "would", "nurse", "nursing",
    "patient", "review", "question", "answer", "notes",
  ]);

  return uniqueBy(
    normalize(text)
      .split(/\s+/)
      .filter((word) => word.length > 4 && !stopWords.has(word)),
    (word) => word
  );
}

function inferDifficulty(text) {
  const target = String(text || "").toLowerCase();

  if (["priority", "first", "best", "initial", "critical", "unsafe", "shock", "airway", "delegate", "severe"].some((word) => target.includes(word))) {
    return "hard";
  }

  if (["assess", "monitor", "teaching", "intervention", "medication", "warning", "management"].some((word) => target.includes(word))) {
    return "medium";
  }

  return "easy";
}

function inferSubject(text) {
  const target = String(text || "").toLowerCase();

  if (/(drug|medication|dose|digoxin|insulin|heparin|warfarin|morphine|antibiotic)/.test(target)) return "Pharmacology";
  if (/(postpartum|pregnan|labor|fetus|fundus|lochia|newborn|maternity)/.test(target)) return "Maternal & Newborn";
  if (/(child|infant|pediatric|adolescent|bronchiolitis|epiglottitis)/.test(target)) return "Pediatrics";
  if (/(therapeutic|suicid|depression|hallucination|psychi|mental health|lithium|haloperidol)/.test(target)) return "Psychiatric Nursing";
  if (/(community|prevention|immunization|public health|barangay|dengue|tuberculosis|dots)/.test(target)) return "Community Health";
  if (/(delegate|uap|staff|leadership|management|assignment|incident)/.test(target)) return "Leadership & Management";
  if (/(surgery|shock|respiratory|cardiac|electrolyte|thyroid|embol|hypoglycemia|med-surg)/.test(target)) return "Medical-Surgical";
  return "Fundamentals";
}

function inferTopic(text, fallbackKeyword = "general review") {
  const target = String(text || "").toLowerCase();
  const match = target.match(
    /(airway|breathing|circulation|infection control|patient safety|assessment|delegation|shock|respiratory|cardiac|newborn|postpartum|dehydration|therapeutic communication|prevention|dengue|tuberculosis|medication safety|anticoagulants|opioids|electrolytes|disaster nursing)/
  );

  return (match?.[0] || fallbackKeyword || "general review").trim();
}

function buildCustomEntries(text, selectedSubject) {
  const sentences = sentenceSplit(text).slice(0, 48);
  const keywords = extractKeywords(text);

  return uniqueBy(
    sentences.map((sentence, index) => {
      const inferredSubject = selectedSubject && selectedSubject !== "Mixed Review" ? selectedSubject : inferSubject(sentence);
      const keyword = keywords[index % Math.max(keywords.length, 1)] || inferTopic(sentence);

      return {
        q: `What nursing point should you remember about ${keyword} from these notes?`,
        a: sentence,
        difficulty: inferDifficulty(sentence),
        topic: inferTopic(sentence, keyword),
        subject: inferredSubject,
      };
    }),
    (entry) => `${entry.subject}-${normalize(entry.q)}-${normalize(entry.a)}`
  );
}

function matchesStudyFilter(entry, subject, difficulty, topic) {
  const matchesSubject = !subject || subject === "Mixed Review" ? true : entry.subject === subject;
  const matchesDifficulty = difficulty === "All" ? true : entry.difficulty === difficulty;
  const matchesTopic = topic ? matchesTopicFocus(entry, topic) : true;

  return matchesSubject && matchesDifficulty && matchesTopic;
}

function matchesTopicFocus(entry, topic) {
  const haystack = normalize(
    `${entry.topic || ""} ${entry.q || entry.prompt || ""} ${entry.a || entry.answer || ""} ${entry.rationale || ""} ${entry.subject || ""}`
  );
  return getTopicSearchTerms(topic).some((term) => haystack.includes(term));
}

function matchesPrimaryTopicFocus(entry, topic) {
  const terms = getTopicSearchTerms(topic);
  if (!terms.length) {
    return true;
  }

  const haystack = normalize(
    `${entry.topic || ""} ${entry.q || entry.prompt || entry.question || ""} ${entry.subject || ""}`
  );
  return terms.some((term) => haystack.includes(term));
}

function matchesGeneratedTopicContent(item, topic) {
  const terms = getTopicSearchTerms(topic);
  if (!terms.length) {
    return true;
  }

  const optionsText = Array.isArray(item.options)
    ? item.options.map((option) => (typeof option === "string" ? option : option?.text || "")).join(" ")
    : "";
  const haystack = normalize(
    `${item.topic || ""} ${item.q || item.prompt || item.question || ""} ${item.a || item.answer || item.correctAnswer || ""} ${optionsText}`
  );
  return terms.some((term) => haystack.includes(term));
}

function cleanQuizPrompt(prompt) {
  return String(prompt || "")
    .replace(/^\s*(question\s*:|q\s*:)\s*/i, "")
    .replace(/\b(answer\s*:|instruction\s*:|directions\s*:).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanQuizOption(option) {
  return String(option || "")
    .replace(/^\s*[A-D][.)]\s*/i, "")
    .replace(/^\s*-\s*/, "")
    .replace(/\b(correct answer|answer|instruction|directions)\b\s*:?.*$/i, "")
    .replace(/\b(review note|board focus|exam cue|careDrop focus|remember|memory hook|review clue|key takeaway|clinical anchor)\s*:.*$/i, "")
    .replace(/\b(?:in|for)\s+(fundamentals?|pharmacology|medical[\s-]*surgical(?: nursing)?|med[\s-]*surg|maternal(?:\s*&\s*newborn)?|pediatrics?|psychiatric nursing|community health|leadership(?:\s*&\s*management)?)\b\.?/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+[,;:.!?-]+$/g, "")
    .trim();
}

function normalizeOptionKey(option) {
  return normalize(cleanQuizOption(option))
    .replace(/\b(memory hook|review clue|key takeaway|board focus|remember)\b.*$/i, "")
    .split(" ")
    .slice(0, 14)
    .join(" ")
    .trim();
}

const CATEGORY_CLUE_PATTERN =
  /\b(fundamentals?|pharmacology|medical[\s-]*surgical(?: nursing)?|med[\s-]*surg|maternal(?:\s*&\s*newborn)?|newborn|pediatrics?|psychiatric nursing|community health|leadership(?:\s*&\s*management)?|nursing board|prc nle)\b/i;

function stripCategoryLeakage(text) {
  return String(text || "")
    .replace(/^\s*(topic|category|subject)\s*:\s*/i, "")
    .replace(/^\s*(fundamentals?|pharmacology|medical[\s-]*surgical(?: nursing)?|med[\s-]*surg|maternal(?:\s*&\s*newborn)?|pediatrics?|psychiatric nursing|community health|leadership(?:\s*&\s*management)?)\s*[:\-]\s*/i, "")
    .replace(/\((fundamentals?|pharmacology|medical[\s-]*surgical(?: nursing)?|med[\s-]*surg|maternal(?:\s*&\s*newborn)?|pediatrics?|psychiatric nursing|community health|leadership(?:\s*&\s*management)?)\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasCategoryLeakage(text) {
  return CATEGORY_CLUE_PATTERN.test(String(text || ""));
}

function getSentenceChunks(text) {
  const cleaned = String(text || "").trim();
  return cleaned.match(/[^.!?]+[.!?]?/g)?.map((part) => part.trim()).filter(Boolean) || [];
}

function limitWords(text, maxWords) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return words.join(" ");
  }
  return `${words.slice(0, maxWords).join(" ").replace(/[,:;]+$/, "")}...`;
}

function inferQuestionScope(prompt) {
  const value = normalize(prompt);
  if (!value) {
    return "general";
  }

  if (
    /\b(antidote|dose|stands for|level of prevention|which isolation|what does|which electrolyte|which finding|which lab value|which site|apgar|fundal|4 ts|therapeutic range|priority assessment before)\b/.test(
      value
    )
  ) {
    return "specific";
  }

  if (
    /\b(most accurate|safest nursing takeaway|what should .* remember|what key principle|board recall|clinical decision point|which clue|general response|priority response|best response)\b/.test(
      value
    )
  ) {
    return "broad";
  }

  return value.split(" ").length > 18 ? "broad" : "specific";
}

function alignTextToPrompt(prompt, text, maxSpecificWords = 18, maxBroadWords = 28) {
  const cleaned = stripCategoryLeakage(cleanQuizOption(text)).replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "";
  }

  const scope = inferQuestionScope(prompt);
  const chunks = getSentenceChunks(cleaned);
  let selected = chunks[0] || cleaned;

  if (scope === "broad" && chunks.length > 1 && selected.split(/\s+/).length < 12) {
    selected = `${selected} ${chunks[1]}`.trim();
  }

  return limitWords(selected, scope === "broad" ? maxBroadWords : maxSpecificWords);
}

function hasScopeMismatch(prompt, answer) {
  const scope = inferQuestionScope(prompt);
  const wordCount = String(answer || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  if (!wordCount) {
    return true;
  }

  if (scope === "specific") {
    return wordCount > 24;
  }

  if (scope === "broad") {
    return wordCount < 6;
  }

  return false;
}

function isWeakDistractor(option, correctAnswer) {
  const normalizedOption = normalize(option);
  const optionKey = normalizeOptionKey(option);
  const correctKey = normalizeOptionKey(correctAnswer);
  return (
    !normalizedOption ||
    normalizedOption === normalize(correctAnswer) ||
    (optionKey && correctKey && (optionKey === correctKey || optionKey.includes(correctKey) || correctKey.includes(optionKey))) ||
    isInstructionLikeOption(option) ||
    hasCategoryLeakage(option) ||
    normalizedOption.includes("correct answer") ||
    normalizedOption.includes("because it is correct") ||
    normalizedOption.includes("memory hook")
  );
}

function buildFallbackDistractors(prompt, correctAnswer) {
  const scope = inferQuestionScope(prompt);
  const trimmedCorrect = alignTextToPrompt(prompt, correctAnswer);

  if (scope === "specific") {
    return [
      "Delay the priority action until more symptoms appear.",
      "Continue routine monitoring before addressing the priority cue.",
      "Delegate the judgment call before completing the nursing assessment.",
    ].filter((option) => normalize(option) !== normalize(trimmedCorrect));
  }

  return [
    "Continue routine care before reassessing the client.",
    "Delay the priority intervention until the provider evaluates the client.",
    "Focus on a secondary comfort measure before addressing the main clinical need.",
  ].filter((option) => normalize(option) !== normalize(trimmedCorrect));
}

function isInstructionLikeOption(option) {
  const value = normalize(option);
  return (
    !value ||
    value.startsWith("instruction") ||
    value.startsWith("directions") ||
    value.startsWith("answer") ||
    value.includes("choose the best answer") ||
    value.includes("select the best answer") ||
    value.includes("all of the above") ||
    value.includes("none of the above")
  );
}

function toFlashcard(entry, subject) {
  const alignedAnswer = alignTextToPrompt(entry.q, entry.a, 20, 30) || entry.a;
  const rationale = buildFlashcardRationale(entry, alignedAnswer);
  return {
    id: `${subject}-${normalize(entry.q)}`,
    subject,
    difficulty: entry.difficulty || "medium",
    topic: entry.topic || "general",
    question: entry.q,
    answer: alignedAnswer,
    rationale,
    notes: buildFlashcardTakeaway(entry, alignedAnswer),
  };
}

function buildFlashcardRationale(entry, answer) {
  const topic = entry.topic || "this nursing concept";
  const subject = entry.subject || "PNLE review";
  return `Correct Answer Explanation: ${answer} is the key point because it supports safe nursing judgment for ${topic} in ${subject}. Key Takeaway: connect the concept to the safest assessment cue, priority intervention, or patient-teaching point.`;
}

function buildFlashcardTakeaway(entry, answer) {
  const topic = entry.topic || "general review";
  return `Key takeaway: link ${topic} to the safest nursing priority, core assessment cue, or first-line intervention. Remember: ${answer}`;
}

function resolveTopicSubject(subject, topic) {
  if (subject && subject !== "Mixed Review") {
    return subject;
  }

  return inferSubject(topic || "");
}

function resolveTopicDifficulty(difficulty, index = 0) {
  if (["easy", "medium", "hard"].includes(difficulty)) {
    return difficulty;
  }

  return ["easy", "medium", "hard"][index % 3];
}

function buildTopicFallbackAnswer(topic, index) {
  const topicLabel = String(topic || "the requested topic").trim();
  const templates = [
    `For ${topicLabel}, start with the assessment cue that can threaten safety, then choose the nursing action that protects airway, breathing, circulation, or deterioration risk first.`,
    `In ${topicLabel}, the safest PNLE approach is to identify the priority finding, reassess focused signs, and avoid routine care when the stem suggests instability.`,
    `When reviewing ${topicLabel}, connect symptoms, vital signs, labs, and patient teaching to the best nursing priority rather than choosing a merely possible intervention.`,
    `For ${topicLabel}, ask whether the item is testing assessment before intervention, urgent escalation, medication safety, or patient teaching, then choose the option that prevents harm.`,
    `A strong ${topicLabel} answer should match the stem cue, address the most immediate risk, and avoid delaying care with low-priority comfort or documentation actions.`,
  ];

  return templates[index % templates.length];
}

function buildTopicFallbackEntries(topic, subject, difficulty, count, offset = 0) {
  const topicLabel = String(topic || "").trim();
  if (!topicLabel) {
    return [];
  }

  const safeSubject = resolveTopicSubject(subject, topicLabel);
  const prompts = [
    `What is the safest nursing priority when a PNLE item focuses on ${topicLabel}?`,
    `Which assessment cue should guide care first for ${topicLabel}?`,
    `What should the nurse remember when reviewing ${topicLabel}?`,
    `Which patient-safety point is most important for ${topicLabel}?`,
    `How should a student approach a board-style question about ${topicLabel}?`,
    `Which nursing judgment best supports safe care for ${topicLabel}?`,
    `What common exam trap should be avoided when answering about ${topicLabel}?`,
    `Which clinical thinking rule helps identify the best answer for ${topicLabel}?`,
    `What patient-teaching focus is important when reviewing ${topicLabel}?`,
    `Which sign of worsening status should be considered first in ${topicLabel}?`,
  ];

  return Array.from({ length: count }, (_, index) => {
    const sequence = offset + index;
    const q = prompts[sequence % prompts.length];
    const a = buildTopicFallbackAnswer(topicLabel, sequence);

    return {
      q,
      a,
      subject: safeSubject,
      difficulty: resolveTopicDifficulty(difficulty, sequence),
      topic: topicLabel,
    };
  });
}

function buildQuizRationale(entry, prompt, correctAnswer) {
  const topic = entry.topic || "this concept";
  const subject = entry.subject || "PNLE review";
  return `Correct Answer Explanation: ${correctAnswer} is best because it matches the priority nursing judgment for ${topic} in ${subject}. Incorrect Options Explanation: Other choices may sound relevant, but they are less appropriate when they delay the priority action, miss the main assessment cue, or fail to address the safest next step in the stem. Key Takeaway: choose the answer that best protects safety and follows assessment-before-intervention logic.`;
}

function sanitizeQuestionType(type, allowMultipleResponse = false) {
  if (allowMultipleResponse && type === QUESTION_TYPES.MULTIPLE_RESPONSE) {
    return QUESTION_TYPES.MULTIPLE_RESPONSE;
  }
  return QUESTION_TYPES.SINGLE_CHOICE;
}

function getAllEntries() {
  return ALL_BANK_ENTRIES;
}

function getExactEntries(sourceEntries, subject, difficulty, topic) {
  return sourceEntries.filter((entry) => matchesStudyFilter(entry, subject, difficulty, topic));
}

function getTopicAlignedEntries(sourceEntries, subject, difficulty, topic) {
  if (!String(topic || "").trim()) {
    return getExactEntries(sourceEntries, subject, difficulty, topic);
  }

  const tiers = [
    sourceEntries.filter((entry) => matchesStudyFilter(entry, subject, difficulty, "") && matchesPrimaryTopicFocus(entry, topic)),
    sourceEntries.filter((entry) => matchesStudyFilter(entry, subject, "All", "") && matchesPrimaryTopicFocus(entry, topic)),
    sourceEntries.filter((entry) => matchesStudyFilter(entry, "", difficulty, "") && matchesPrimaryTopicFocus(entry, topic)),
    sourceEntries.filter((entry) => matchesStudyFilter(entry, "", "All", "") && matchesPrimaryTopicFocus(entry, topic)),
  ];

  return uniqueBy(tiers.flat(), (entry) =>
    `${entry.subject || ""}-${entry.difficulty || ""}-${normalize(entry.topic || "")}-${normalize(entry.q || entry.prompt || "")}`
  );
}

function buildTopicFocusContext(sourceEntries, topic, difficulty = "All", limit = 18) {
  const exactMatches = getTopicAlignedEntries(sourceEntries, "", difficulty, topic);
  const selected = exactMatches.slice(0, limit);

  if (!selected.length) {
    return "";
  }

  return [
    `CareDrop topic focus: ${topic}`,
    "Use these bank-supported reviewer points as seed material. Keep the topic central, preserve nursing accuracy, and generate a fresh set without copying the wording too closely.",
    ...selected.map(
      (entry, index) =>
        `${index + 1}. [${entry.subject} | ${entry.difficulty} | ${entry.topic}] Q: ${entry.q} A: ${entry.a}`
    ),
  ].join("\n");
}

function buildTopicGenerationNotes(sourceEntries, topic, difficulty = "All", notes = "") {
  const topicContext = buildTopicFocusContext(sourceEntries, topic, difficulty);
  const uploadedNotes = String(notes || "").trim();

  if (topicContext && uploadedNotes) {
    return [
      `CareDrop generation target: ${topic}`,
      "Build a complete study set around this topic. Use the matched bank context first, then deepen or widen the set with the uploaded notes where relevant.",
      topicContext,
      `Uploaded notes:\n${uploadedNotes}`,
    ].join("\n\n");
  }

  if (topicContext) {
    return topicContext;
  }

  if (uploadedNotes && topic) {
    return [
      `CareDrop generation target: ${topic}`,
      "The learner wants a full topic-focused set. If the uploaded notes are thin, expand with safe board-review nursing knowledge while staying centered on the requested topic.",
      `Uploaded notes:\n${uploadedNotes}`,
    ].join("\n\n");
  }

  return uploadedNotes;
}

function buildFlashcardVariants(entry) {
  const subject = entry.subject;
  const baseId = `${subject}-${normalize(entry.q)}`;
  const topic = entry.topic || "general review";
  const answer = alignTextToPrompt(entry.q, entry.a, 20, 30) || entry.a;
  const rationale = buildFlashcardRationale(entry, answer);
  const notes = buildFlashcardTakeaway(entry, answer);
  const prompts = [
    entry.q,
    `In ${subject}, what should you remember about ${topic}?`,
    `Board recall: what is the safest nursing takeaway for ${topic}?`,
    `Which nursing priority cue should you remember first for ${topic}?`,
  ];

  return uniqueBy(
    prompts.map((prompt, index) => ({
      id: `${baseId}-card-${index + 1}`,
      subject,
      difficulty: entry.difficulty || "medium",
      topic,
      question: prompt,
      answer,
      rationale,
      notes,
    })),
    (item) => item.id
  );
}

function buildQuizVariants(entry) {
  const alignedAnswer = alignTextToPrompt(entry.q, entry.a, 18, 26) || entry.a;
  const baseRationale = buildQuizRationale(entry, entry.q, alignedAnswer);
  const sourceCue = cleanQuizPrompt(entry.q || "");
  const topicLabel = entry.topic || "this nursing concept";
  const subjectLabel = entry.subject || "nursing review";
  const contextualCue = sourceCue
    ? `The review cue is: ${sourceCue}`
    : `The main concern is ${topicLabel}.`;

  return [
    { prompt: entry.q, rationale: baseRationale },
    {
      prompt: `A PNLE-style ${subjectLabel} item focuses on ${topicLabel}. ${contextualCue} Which option is the best nursing answer?`,
      rationale: buildQuizRationale(entry, `A PNLE-style ${subjectLabel} item focuses on ${topicLabel}. ${contextualCue} Which option is the best nursing answer?`, alignedAnswer),
    },
    {
      prompt: `The nurse is answering a board-review question about ${topicLabel}. ${contextualCue} Which choice best matches the priority nursing judgment?`,
      rationale: buildQuizRationale(entry, `The nurse is answering a board-review question about ${topicLabel}. ${contextualCue} Which choice best matches the priority nursing judgment?`, alignedAnswer),
    },
    {
      prompt: `A student is reviewing ${topicLabel} and must connect the stem to the safest nursing priority. ${contextualCue} What is the best answer?`,
      rationale: buildQuizRationale(entry, `A student is reviewing ${topicLabel} and must connect the stem to the safest nursing priority. ${contextualCue} What is the best answer?`, alignedAnswer),
    },
  ];
}

function finalizeQuizOptions(prompt, correctAnswer, options, subject, difficulty, topic) {
  const alignedCorrect = alignTextToPrompt(prompt, correctAnswer, 18, 26);
  const pool = getExactEntries(
    getAllEntries(),
    subject === "Mixed Review" ? "" : subject,
    difficulty === "All" ? "All" : difficulty,
    topic
  );
  const alignedPool = uniqueBy(
    shuffle(pool)
      .map((entry) => alignTextToPrompt(prompt, entry.a, 18, 24))
      .filter((option) => option && !isWeakDistractor(option, alignedCorrect)),
    (option) => normalize(option)
  );

  const distractors = uniqueBy(
    (Array.isArray(options) ? options : [])
      .map((option) => alignTextToPrompt(prompt, option, 18, 24))
      .filter((option) => option && !isWeakDistractor(option, alignedCorrect)),
    (option) => normalizeOptionKey(option)
  ).filter((option) => normalize(option) !== normalize(alignedCorrect));

  const mergedDistractors = [...distractors];

  for (const option of alignedPool) {
    if (mergedDistractors.length >= 3) {
      break;
    }
    const optionKey = normalizeOptionKey(option);
    if (!mergedDistractors.some((item) => normalizeOptionKey(item) === optionKey) && normalize(option) !== normalize(alignedCorrect)) {
      mergedDistractors.push(option);
    }
  }

  for (const option of buildFallbackDistractors(prompt, alignedCorrect)) {
    if (mergedDistractors.length >= 3) {
      break;
    }
    const optionKey = normalizeOptionKey(option);
    if (!mergedDistractors.some((item) => normalizeOptionKey(item) === optionKey) && normalize(option) !== normalize(alignedCorrect)) {
      mergedDistractors.push(option);
    }
  }

  return shuffle([alignedCorrect, ...mergedDistractors.slice(0, 3)]).slice(0, 4);
}

function buildDistractors(entry, pool) {
  const prioritizedPool = uniqueBy(
    shuffle(
      pool.filter((item) => {
        if (normalize(item.a) === normalize(entry.a)) {
          return false;
        }
        if (entry.topic && item.topic && normalize(item.topic) === normalize(entry.topic)) {
          return true;
        }
        if (entry.subject && item.subject && normalize(item.subject) === normalize(entry.subject)) {
          return true;
        }
        return false;
      })
    ),
    (item) => normalize(item.a)
  );

  const fallbackPool = prioritizedPool.length ? prioritizedPool : uniqueBy(shuffle(pool), (item) => normalize(item.a));
  const options = fallbackPool.slice(0, 8).map((item) => item.a);
  return finalizeQuizOptions(entry.q, entry.a, options, entry.subject, entry.difficulty, entry.topic);
}

function buildLocalQuizFallback(sourceEntries, subject, difficulty, topic, count, usedPrompts = [], options = {}) {
  const { includeSyntheticTopicFill = true } = options;
  const topicFallbackEntries = includeSyntheticTopicFill
    ? buildTopicFallbackEntries(topic, subject, difficulty, count)
    : [];
  const prioritized = shuffle(
    uniqueBy(
      [...getTopicAlignedEntries(sourceEntries, subject, difficulty, topic), ...topicFallbackEntries],
      (entry) => `${entry.subject || ""}-${entry.difficulty || ""}-${normalize(entry.topic || "")}-${normalize(entry.q || "")}`
    )
  );
  const distractorPool = prioritized;

  function collectQuestions(ignoreUsedPrompts) {
    const questions = [];

    for (const entry of prioritized) {
      for (const variant of shuffle(buildQuizVariants(entry))) {
        const normalizedPrompt = normalize(variant.prompt);
        if (!normalizedPrompt || (!ignoreUsedPrompts && usedPrompts.includes(normalizedPrompt))) {
          continue;
        }

        questions.push({
          id: `${entry.subject}-${uid()}`,
          subject: entry.subject,
          difficulty: entry.difficulty,
          topic: entry.topic,
          type: QUESTION_TYPES.SINGLE_CHOICE,
          prompt: variant.prompt,
          correctAnswer: alignTextToPrompt(variant.prompt, entry.a, 18, 26),
          options: buildDistractors({ ...entry, q: variant.prompt }, distractorPool),
          rationale: variant.rationale,
          notes: `Key takeaway: focus on the best nursing priority for ${entry.topic}.`,
          userAnswer: null,
        });

        if (questions.length >= count) {
          return questions;
        }
      }
    }

    return questions;
  }

  const freshQuestions = collectQuestions(false);
  if (freshQuestions.length >= count) {
    return freshQuestions;
  }

  const recycledQuestions = collectQuestions(true).filter(
    (item) => !freshQuestions.some((existing) => normalize(existing.prompt) === normalize(item.prompt))
  );

  return [...freshQuestions, ...recycledQuestions].slice(0, count);
}

function sanitizeFlashcards(cards, subject, difficulty, topic, usedIds, allowRepeat) {
  return uniqueBy(
    (Array.isArray(cards) ? cards : []).map((card) => {
      const nextSubject = card.subject || subject || "Mixed Review";
      const question = cleanQuizPrompt(card.question || card.prompt || "");
      const answer = alignTextToPrompt(question, card.answer || "", 20, 30);
      return {
        id: `${nextSubject}-${normalize(question)}`,
        subject: nextSubject,
        difficulty: ["easy", "medium", "hard"].includes(card.difficulty) ? card.difficulty : "medium",
        topic: topic || card.topic || "ai review",
        question,
        answer,
        rationale: alignTextToPrompt(
          question,
          card.rationale || buildFlashcardRationale({ ...card, subject: nextSubject, topic: topic || card.topic }, answer),
          24,
          48
        ),
        notes: String(card.notes || buildFlashcardTakeaway({ ...card, subject: nextSubject, topic: topic || card.topic }, answer)),
      };
    }),
    (card) => card.id
  ).filter(
    (card) =>
      card.question &&
      card.answer &&
      !hasScopeMismatch(card.question, card.answer) &&
      matchesStudyFilter(
        {
          subject: card.subject,
          difficulty: card.difficulty,
          topic: card.topic,
          q: card.question,
          a: card.answer,
          rationale: card.rationale,
        },
        subject,
        difficulty,
        topic
      ) &&
      matchesGeneratedTopicContent(card, topic) &&
      (allowRepeat ? true : !usedIds.includes(card.id))
  );
}

function sanitizeQuizQuestions(questions, subject, difficulty, topic, usedPrompts, allowRepeat, allowMultipleResponse = false) {
  return uniqueBy(
    (Array.isArray(questions) ? questions : []).map((item) => {
      const prompt = cleanQuizPrompt(item.prompt || item.question || "");
      const rawOptions = uniqueBy(
        (Array.isArray(item.options) ? item.options : [])
          .map((option, index) => {
            if (typeof option === "string") {
              return {
                id: `option-${index + 1}`,
                text: cleanQuizOption(option),
                rationale: "",
              };
            }

            return {
              id: String(option?.id || `option-${index + 1}`),
              text: cleanQuizOption(option?.text || option?.label || option?.value || ""),
              rationale: String(option?.rationale || ""),
            };
          })
          .filter((option) => option.text && !isInstructionLikeOption(option.text)),
        (option) => normalizeOptionKey(option.text)
      );
      const correctAnswer = alignTextToPrompt(prompt, item.correctAnswer || "", 18, 26);
      const sanitizedType = sanitizeQuestionType(item.type, allowMultipleResponse);
      const options = sanitizedType === QUESTION_TYPES.MULTIPLE_RESPONSE
        ? rawOptions.slice(0, 5)
        : finalizeQuizOptions(
            prompt,
            correctAnswer,
            rawOptions.map((option) => option.text),
            item.subject || subject || "Mixed Review",
            ["easy", "medium", "hard"].includes(item.difficulty)
              ? item.difficulty
              : ["easy", "medium", "hard"].includes(difficulty)
                ? difficulty
                : "All",
            topic || item.topic || "ai review"
          ).map((option, index) => ({
            id: rawOptions.find((candidate) => normalize(candidate.text) === normalize(option))?.id || `option-${index + 1}`,
            text: option,
            rationale: rawOptions.find((candidate) => normalize(candidate.text) === normalize(option))?.rationale || "",
          }));
      const correctOptionIds = sanitizedType === QUESTION_TYPES.MULTIPLE_RESPONSE
        ? (Array.isArray(item.correctOptionIds) ? item.correctOptionIds : [])
            .map((value) => String(value))
            .filter((value) => options.some((option) => option.id === value))
        : [];

      return {
        id: item.id || uid(),
        subject: item.subject || subject || "Mixed Review",
        difficulty: ["easy", "medium", "hard"].includes(item.difficulty) ? item.difficulty : "medium",
        topic: topic || item.topic || "ai review",
        type: sanitizedType,
        prompt,
        correctAnswer,
        options,
        correctOptionIds: sanitizedType === QUESTION_TYPES.MULTIPLE_RESPONSE ? correctOptionIds : [],
        rationale: alignTextToPrompt(
          prompt,
          item.rationale || buildQuizRationale({ ...item, subject: item.subject || subject || "Mixed Review", topic: topic || item.topic || "ai review" }, prompt, correctAnswer),
          30,
          70
        ),
        notes: String(item.notes || `Key takeaway: choose the best nursing answer, not just a possible answer, for ${topic || item.topic || "the topic"}.`),
        userAnswer:
          sanitizedType === QUESTION_TYPES.MULTIPLE_RESPONSE
            ? (Array.isArray(item.userAnswer) ? item.userAnswer.map((value) => String(value)) : [])
            : item.userAnswer ?? null,
      };
    }),
    (item) => normalize(item.prompt)
  ).filter((item) => {
    const valid =
      item.prompt &&
      item.prompt.length > 18 &&
      (item.correctAnswer || item.correctOptionIds.length) &&
      item.options.length >= 4 &&
      item.options.length <= 5 &&
      !hasScopeMismatch(item.prompt, item.correctAnswer || item.options.find((option) => item.correctOptionIds.includes(option.id))?.text || "");
    const notUsed = allowRepeat ? true : !usedPrompts.includes(normalize(item.prompt));
    const includesCorrect = item.type === QUESTION_TYPES.MULTIPLE_RESPONSE
      ? item.correctOptionIds.length >= 2 && item.correctOptionIds.length < item.options.length
      : item.options.some((option) => normalize(option.text) === normalize(item.correctAnswer));
    return (
      valid &&
      notUsed &&
      includesCorrect &&
      matchesStudyFilter(
        {
          subject: item.subject,
          difficulty: item.difficulty,
          topic: item.topic,
          prompt: item.prompt,
          answer: item.correctAnswer || item.options.find((option) => item.correctOptionIds.includes(option.id))?.text || "",
          rationale: item.rationale,
        },
        subject,
        difficulty,
        topic
      ) &&
      matchesGeneratedTopicContent(item, topic)
    );
  });
}

function buildSessionLabel(session) {
  return `${session.subject}${session.topic ? ` - ${session.topic}` : ""} (${session.mode})`;
}

function selectSessionItems(pool, size, usedKeys, recentKeys, keySelector) {
  const distinctPool = uniqueBy(pool, keySelector);
  if (!distinctPool.length) {
    return [];
  }

  const nextUsed = usedKeys.filter((key) => distinctPool.some((item) => keySelector(item) === key));
  const nextRecent = recentKeys.filter((key) => distinctPool.some((item) => keySelector(item) === key));
  const unseen = nextUsed.length >= distinctPool.length
    ? []
    : distinctPool.filter((item) => !nextUsed.includes(keySelector(item)));
  const selected = [];
  const targetSize = Math.max(size, 1);

  function takeDistinct(candidates) {
    for (const item of shuffle(candidates)) {
      const key = keySelector(item);
      if (selected.some((selectedItem) => keySelector(selectedItem) === key)) {
        continue;
      }
      selected.push(item);
      if (selected.length >= targetSize || selected.length >= distinctPool.length) {
        return;
      }
    }
  }

  takeDistinct(unseen.filter((item) => !nextRecent.includes(keySelector(item))));
  if (selected.length < Math.min(targetSize, distinctPool.length)) {
    takeDistinct(unseen);
  }
  if (selected.length < Math.min(targetSize, distinctPool.length)) {
    takeDistinct(distinctPool.filter((item) => !nextRecent.includes(keySelector(item))));
  }
  if (selected.length < Math.min(targetSize, distinctPool.length)) {
    takeDistinct(distinctPool);
  }

  if (selected.length >= targetSize) {
    return selected.slice(0, targetSize);
  }

  while (selected.length < targetSize) {
    const recycledPool = shuffle(distinctPool);

    for (const item of recycledPool) {
      const previous = selected[selected.length - 1];
      if (previous && distinctPool.length > 1 && keySelector(previous) === keySelector(item)) {
        continue;
      }

      selected.push(item);
      if (selected.length >= targetSize) {
        return selected;
      }
    }

    if (distinctPool.length === 1) {
      selected.push(distinctPool[0]);
    }
  }

  return selected.slice(0, targetSize);
}

export default function App() {
  const width = useWindowWidth();
  const initialUser = loadAuthSession();
  const persisted = initialUser ? loadPersisted(initialUser.id) : null;
  const legacySavedSessions = safeArray(persisted?.savedQuizSessions);
  const persistedRequests = loadRequestPersisted();
  const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [currentUser, setCurrentUser] = useState(initialUser);
  const [authMode, setAuthMode] = useState("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [authNotice, setAuthNotice] = useState(null);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [authReady, setAuthReady] = useState(!supabaseConfigured);
  const [cloudSyncReady, setCloudSyncReady] = useState(supabaseConfigured);
  const [cloudSyncStatus, setCloudSyncStatus] = useState("");
  const [cloudSyncState, setCloudSyncState] = useState("saved-local");
  const [subject, setSubject] = useState("");
  const [difficulty, setDifficulty] = useState(safeString(persisted?.difficulty, "All"));
  const [topicFilter, setTopicFilter] = useState(safeString(persisted?.topicFilter));
  const [topicInput, setTopicInput] = useState(safeString(persisted?.topicFilter));
  const [focusAction, setFocusAction] = useState("flashcard");
  const [mode, setMode] = useState(safeMode(persisted?.mode));
  const [studyMode, setStudyMode] = useState(
    safeMode(persisted?.mode) === "quiz" ? "quiz" : "flashcard"
  );
  const [viewMode, setViewMode] = useState("setup");
  const [flashcardViewMode, setFlashcardViewMode] = useState("setup");
  const [quizViewMode, setQuizViewMode] = useState("setup");
  const [flashcards, setFlashcards] = useState([]);
  const [cardIdx, setCardIdx] = useState(0);
  const [cardSchedule, setCardSchedule] = useState(safeObject(persisted?.cardSchedule));
  const [flashcardSessionRatings, setFlashcardSessionRatings] = useState({});
  const [flashcardResponseTimes, setFlashcardResponseTimes] = useState(safeObject(persisted?.flashcardResponseTimes));
  const [flashcardSessionSubmitted, setFlashcardSessionSubmitted] = useState(false);
  const [quiz, setQuiz] = useState([]);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizResponseTimes, setQuizResponseTimes] = useState(safeObject(persisted?.quizResponseTimes));
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizAnswerSheetOpen, setQuizAnswerSheetOpen] = useState(false);
  const [simulationQuestions, setSimulationQuestions] = useState([]);
  const [simulationIdx, setSimulationIdx] = useState(0);
  const [simulationResponseTimes, setSimulationResponseTimes] = useState(safeObject(persisted?.simulationResponseTimes));
  const [simulationSubmitted, setSimulationSubmitted] = useState(false);
  const [simulationSize, setSimulationSize] = useState(50);
  const [simulationUsedAi, setSimulationUsedAi] = useState(false);
  const [simulationAnswerSheetOpen, setSimulationAnswerSheetOpen] = useState(false);
  const [simulationLaunchOpen, setSimulationLaunchOpen] = useState(
    !(safeMode(persisted?.mode) === "simulation" && safeArray(persisted?.simulationQuestions).length)
  );
  const [remediationContext, setRemediationContext] = useState(
    persisted?.remediationContext && typeof persisted.remediationContext === "object" ? persisted.remediationContext : null
  );
  const [ratings, setRatings] = useState(safeObject(persisted?.ratings));
  const [sessions, setSessions] = useState(Number(persisted?.sessions || 0));
  const [reviewSessions, setReviewSessions] = useState(safeArray(persisted?.reviewSessions).length ? safeArray(persisted?.reviewSessions) : legacySavedSessions);
  const [usedFlashcardIds, setUsedFlashcardIds] = useState(safeArray(persisted?.usedFlashcardIds));
  const [usedFlashcardQuestions, setUsedFlashcardQuestions] = useState(safeArray(persisted?.usedFlashcardQuestions));
  const [usedQuizPrompts, setUsedQuizPrompts] = useState(safeArray(persisted?.usedQuizPrompts));
  const [recentFlashcardIds, setRecentFlashcardIds] = useState(safeArray(persisted?.recentFlashcardIds));
  const [recentQuizPrompts, setRecentQuizPrompts] = useState(safeArray(persisted?.recentQuizPrompts));
  const [apiLoading, setApiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState("");
  const [apiError, setApiError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusFading, setStatusFading] = useState(false);
  const [question, setQuestion] = useState("");
  const [gentlePush, setGentlePush] = useState(ENCOURAGEMENTS[0]);
  const [noteText, setNoteText] = useState(safeString(persisted?.noteText));
  const [uploadedText, setUploadedText] = useState(safeString(persisted?.uploadedText));
  const [uploadedFileName, setUploadedFileName] = useState(safeString(persisted?.uploadedFileName));
  const [uploadState, setUploadState] = useState("idle");
  const [uploadError, setUploadError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [summaryText, setSummaryText] = useState(
    safeString(persisted?.summaryText, "Paste notes or upload a document to generate a reviewer summary.")
  );
  const [filterWeakOnly, setFilterWeakOnly] = useState(persisted?.filterWeakOnly || false);
  const [metricHover, setMetricHover] = useState("");
  const [subjectGridExpanded, setSubjectGridExpanded] = useState(false);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestType, setRequestType] = useState("Bug Report");
  const [requestName, setRequestName] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [requestStatus, setRequestStatus] = useState("");
  const [requestHistory, setRequestHistory] = useState(persistedRequests);
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestConfigured, setRequestConfigured] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(
    coerceDate(persisted?.calendarMonth)
  );
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(
    persisted?.calendarSelectedDate || getDateInputValue()
  );
  const [calendarEvents, setCalendarEvents] = useState(safeArray(persisted?.calendarEvents));
  const [calendarDraftTitle, setCalendarDraftTitle] = useState("");
  const [calendarDraftType, setCalendarDraftType] = useState("Study");
  const [calendarDraftSubject, setCalendarDraftSubject] = useState("");
  const [calendarDraftNote, setCalendarDraftNote] = useState("");
  const [plannerItems, setPlannerItems] = useState(safeArray(persisted?.plannerItems));
  const [plannerTitle, setPlannerTitle] = useState("");
  const [plannerSubject, setPlannerSubject] = useState("");
  const [plannerMode, setPlannerMode] = useState("mixed");
  const [plannerDueDate, setPlannerDueDate] = useState(getDateInputValue());
  const [plannerNotes, setPlannerNotes] = useState("");
  const [adminView, setAdminView] = useState(["overview", "feedback", "planning", "activity", "users"].includes(persisted?.adminView) ? persisted.adminView : "overview");
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminUsersConfigured, setAdminUsersConfigured] = useState(false);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState("");
  const [headerVisible, setHeaderVisible] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [themeMode, setThemeMode] = useState(() => {
    const initialThemeMode = getPreferredThemeMode();
    applyThemeMode(initialThemeMode);
    return initialThemeMode;
  });
  const isAdminUser = isAdminEmail(currentUser?.email);
  const toggleThemeMode = () => {
    setThemeMode((current) => {
      const next = current === "dark" ? "light" : "dark";
      applyThemeMode(next);
      persistThemeMode(next);
      return next;
    });
  };

  const usedFlashcardIdsRef = useRef(usedFlashcardIds);
  const usedFlashcardQuestionsRef = useRef(usedFlashcardQuestions);
  const usedQuizPromptsRef = useRef(usedQuizPrompts);
  const recentFlashcardIdsRef = useRef(recentFlashcardIds);
  const recentQuizPromptsRef = useRef(recentQuizPrompts);
  const remoteProgressLoadedRef = useRef(false);
  const lastScrollYRef = useRef(0);
  const flashcardShownAtRef = useRef(Date.now());
  const quizShownAtRef = useRef(Date.now());
  const simulationShownAtRef = useRef(Date.now());

  useEffect(() => {
    applyThemeMode(themeMode);
    persistThemeMode(themeMode);
  }, [themeMode]);

  const progressSnapshot = useMemo(
    () =>
      buildProgressSnapshot({
        subject,
        difficulty,
        topicFilter,
        mode,
        ratings,
        sessions,
        reviewSessions,
        flashcards,
        cardIdx,
        cardSchedule,
        flashcardSessionRatings,
        flashcardResponseTimes,
        flashcardSessionSubmitted,
        quiz,
        quizIdx,
        quizResponseTimes,
        quizSubmitted,
        simulationQuestions,
        simulationIdx,
        simulationResponseTimes,
        simulationSubmitted,
        simulationSize,
        simulationUsedAi,
        remediationContext,
        usedFlashcardIds,
        usedFlashcardQuestions,
        usedQuizPrompts,
        recentFlashcardIds,
        recentQuizPrompts,
        noteText,
        uploadedText,
        uploadedFileName,
        summaryText,
        filterWeakOnly,
        calendarMonth,
        calendarSelectedDate,
        calendarEvents,
        plannerItems,
        adminView,
      }),
    [
      subject,
      difficulty,
      topicFilter,
      mode,
      ratings,
      sessions,
      reviewSessions,
      flashcards,
      cardIdx,
      cardSchedule,
      flashcardSessionRatings,
      flashcardResponseTimes,
      flashcardSessionSubmitted,
      quiz,
      quizIdx,
      quizResponseTimes,
      quizSubmitted,
      simulationQuestions,
      simulationIdx,
      simulationResponseTimes,
      simulationSubmitted,
      simulationSize,
      simulationUsedAi,
      remediationContext,
      usedFlashcardIds,
      usedFlashcardQuestions,
      usedQuizPrompts,
      recentFlashcardIds,
      recentQuizPrompts,
      noteText,
      uploadedText,
      uploadedFileName,
      summaryText,
      filterWeakOnly,
      calendarMonth,
      calendarSelectedDate,
      calendarEvents,
      plannerItems,
      adminView,
    ]
  );

  function applyPersistedSnapshot(snapshot, options = {}) {
    const { restoreSubject = false } = options;

    if (!snapshot) {
      return;
    }

    setSubject(restoreSubject ? safeString(snapshot.subject) : "");
    setDifficulty(safeString(snapshot.difficulty, "All"));
    setTopicFilter(safeString(snapshot.topicFilter));
    setTopicInput(safeString(snapshot.topicFilter));
    setMode(safeMode(snapshot.mode));
    setRatings(safeObject(snapshot.ratings));
    setSessions(Number(snapshot.sessions || 0));
    setReviewSessions(safeArray(snapshot.reviewSessions).length ? safeArray(snapshot.reviewSessions) : safeArray(snapshot.savedQuizSessions));
    setUsedFlashcardIds(safeArray(snapshot.usedFlashcardIds));
    setUsedFlashcardQuestions(safeArray(snapshot.usedFlashcardQuestions));
    setUsedQuizPrompts(safeArray(snapshot.usedQuizPrompts));
    setRecentFlashcardIds(safeArray(snapshot.recentFlashcardIds));
    setRecentQuizPrompts(safeArray(snapshot.recentQuizPrompts));
    setNoteText(safeString(snapshot.noteText));
    setUploadedText(safeString(snapshot.uploadedText));
    setUploadedFileName(safeString(snapshot.uploadedFileName));
    setSummaryText(safeString(snapshot.summaryText, "Paste notes or upload a document to generate a reviewer summary."));
    setFilterWeakOnly(Boolean(snapshot.filterWeakOnly));
    setCalendarMonth(coerceDate(snapshot.calendarMonth));
    setCalendarSelectedDate(snapshot.calendarSelectedDate || getDateInputValue());
    setCalendarEvents(Array.isArray(snapshot.calendarEvents) ? snapshot.calendarEvents : []);
    setPlannerItems(Array.isArray(snapshot.plannerItems) ? snapshot.plannerItems : []);
    setAdminView(["overview", "feedback", "planning", "activity", "users"].includes(snapshot.adminView) ? snapshot.adminView : "overview");
    setFlashcards(safeArray(snapshot.flashcards));
    setCardIdx(clamp(Number(snapshot.cardIdx || 0), 0, Math.max(safeArray(snapshot.flashcards).length - 1, 0)));
    setCardSchedule(safeObject(snapshot.cardSchedule));
    setFlashcardSessionRatings(safeObject(snapshot.flashcardSessionRatings));
    setFlashcardResponseTimes(safeObject(snapshot.flashcardResponseTimes));
    setFlashcardSessionSubmitted(Boolean(snapshot.flashcardSessionSubmitted));
    setQuiz(safeArray(snapshot.quiz));
    setQuizIdx(clamp(Number(snapshot.quizIdx || 0), 0, Math.max(safeArray(snapshot.quiz).length - 1, 0)));
    setQuizResponseTimes(safeObject(snapshot.quizResponseTimes));
    setQuizSubmitted(Boolean(snapshot.quizSubmitted));
    setQuizAnswerSheetOpen(false);
    setSimulationQuestions(safeArray(snapshot.simulationQuestions));
    setSimulationIdx(clamp(Number(snapshot.simulationIdx || 0), 0, Math.max(safeArray(snapshot.simulationQuestions).length - 1, 0)));
    setSimulationResponseTimes(safeObject(snapshot.simulationResponseTimes));
    setSimulationSubmitted(Boolean(snapshot.simulationSubmitted));
    setSimulationSize(SIMULATION_SIZE_OPTIONS.includes(Number(snapshot.simulationSize)) ? Number(snapshot.simulationSize) : 50);
    setSimulationUsedAi(Boolean(snapshot.simulationUsedAi));
    setSimulationAnswerSheetOpen(false);
    setSimulationLaunchOpen(!(safeMode(snapshot.mode) === "simulation" && safeArray(snapshot.simulationQuestions).length));
    setRemediationContext(snapshot.remediationContext && typeof snapshot.remediationContext === "object" ? snapshot.remediationContext : null);
  }

  function queueModeChange(nextMode) {
    window.requestAnimationFrame(() => {
      if (nextMode === "flashcard" || nextMode === "quiz") {
        setStudyMode(nextMode);
      }
      setMode(nextMode);
    });
  }

  function navigateToMode(nextMode) {
    setMobileDrawerOpen(false);
    if (nextMode === "flashcard") {
      setFlashcardViewMode("setup");
    }
    if (nextMode === "quiz") {
      setQuizViewMode("setup");
    }
    queueModeChange(nextMode);
  }

  function returnToReviewFilters() {
    setViewMode("setup");
    if (mode === "flashcard") {
      setFlashcardViewMode("setup");
    }
    if (mode === "quiz") {
      setQuizViewMode("setup");
    }
    setMobileDrawerOpen(false);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function queueAdminViewChange(nextView) {
    window.requestAnimationFrame(() => {
      setAdminView(nextView);
    });
  }

  function openSimulationLauncher() {
    setMobileDrawerOpen(false);
    setSimulationLaunchOpen(true);
    queueModeChange("simulation");
  }

  useEffect(() => {
    usedFlashcardIdsRef.current = usedFlashcardIds;
  }, [usedFlashcardIds]);

  useEffect(() => {
    usedFlashcardQuestionsRef.current = usedFlashcardQuestions;
  }, [usedFlashcardQuestions]);

  useEffect(() => {
    usedQuizPromptsRef.current = usedQuizPrompts;
  }, [usedQuizPrompts]);

  useEffect(() => {
    recentFlashcardIdsRef.current = recentFlashcardIds;
  }, [recentFlashcardIds]);

  useEffect(() => {
    recentQuizPromptsRef.current = recentQuizPrompts;
  }, [recentQuizPrompts]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setGentlePush(ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)]);
    }, 8000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const markOnline = () => setIsOnline(true);
    const markOffline = () => setIsOnline(false);

    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);

    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  useEffect(() => {
    setTermsAccepted(false);
    setAuthError("");
    setAuthNotice(null);
  }, [authMode]);

  useEffect(() => {
    if (!statusMessage) {
      setStatusFading(false);
      return undefined;
    }

    setStatusFading(false);
    const fadeTimer = window.setTimeout(() => setStatusFading(true), 3200);
    const clearTimer = window.setTimeout(() => {
      setStatusMessage("");
      setStatusFading(false);
    }, 4300);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(clearTimer);
    };
  }, [statusMessage]);

  useEffect(() => {
    if (typeof window === "undefined" || !currentUser?.id) {
      return;
    }

    persistLocalSnapshot(currentUser.id, progressSnapshot, window.localStorage);
    setCloudSyncState(
      supabaseConfigured && currentUser?.provider === "supabase"
        ? (isOnline ? "queued-sync" : "saved-local")
        : "saved-local"
    );
  }, [currentUser?.id, progressSnapshot]);

  useEffect(() => {
    if (!supabaseConfigured || !supabase || !currentUser?.id || currentUser.provider !== "supabase" || !remoteProgressLoadedRef.current) {
      return undefined;
    }

    setCloudSyncState(isOnline ? "queued-sync" : "saved-local");
    const timeoutId = window.setTimeout(async () => {
      if (!isOnline) {
        setCloudSyncStatus("Saved locally. Cloud sync will resume when your connection returns.");
        setCloudSyncState("saved-local");
        return;
      }

      setCloudSyncState("syncing");
      const { ok } = await saveRemoteSnapshot(supabase, currentUser.id, progressSnapshot);
      if (!ok) {
        setCloudSyncStatus("Cloud sync needs the Supabase table setup.");
        setCloudSyncState("sync-failed");
        return;
      }

      setCloudSyncStatus("Cloud sync active.");
      setCloudSyncState("synced");
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [currentUser?.id, currentUser?.provider, isOnline, progressSnapshot]);

  useEffect(() => {
    if (persisted) {
      applyPersistedSnapshot(persisted);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(REQUEST_STORAGE_KEY, JSON.stringify(requestHistory));
  }, [requestHistory]);

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setAuthReady(true);
      return undefined;
    }

    let active = true;

    async function bootstrapAuth() {
      const { data } = await supabase.auth.getSession();
      if (!active) {
        return;
      }

      if (data.session?.user) {
        const nextUser = mapSupabaseUser(data.session.user);
        setCurrentUser(nextUser);
        saveAuthSession(nextUser);
      } else if (loadAuthSession()?.provider === "supabase") {
        clearAuthSession();
        setCurrentUser(null);
      }

      setCloudSyncReady(true);
      setAuthReady(true);
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) {
        return;
      }

      if (session?.user) {
        const nextUser = mapSupabaseUser(session.user);
        setCurrentUser(nextUser);
        saveAuthSession(nextUser);
      } else if (loadAuthSession()?.provider === "supabase") {
        clearAuthSession();
        setCurrentUser(null);
      }
    });

    bootstrapAuth();

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabaseConfigured || !supabase || !currentUser?.id || currentUser.provider !== "supabase") {
      remoteProgressLoadedRef.current = false;
      return;
    }

    let active = true;

    async function loadRemoteProgress() {
      setCloudSyncState(isOnline ? "syncing" : "saved-local");
      const { payload, error } = await loadRemoteSnapshot(supabase, currentUser.id);

      if (!active) {
        return;
      }

      if (error) {
        setCloudSyncStatus("Cloud progress table is not ready yet.");
        setCloudSyncState("sync-failed");
        remoteProgressLoadedRef.current = true;
        return;
      }

      if (payload) {
        applyPersistedSnapshot(payload);
        setStatusMessage("Cloud progress restored successfully.");
      }

      setCloudSyncStatus("Cloud sync active.");
      setCloudSyncState("synced");
      remoteProgressLoadedRef.current = true;
    }

    loadRemoteProgress();

    return () => {
      active = false;
    };
  }, [currentUser?.id, currentUser?.provider]);

  useEffect(() => {
    async function loadCentralRequests() {
      try {
        const data = await getJson("/api/feedback");
        setRequestHistory(Array.isArray(data.requests) ? data.requests : []);
        setRequestConfigured(Boolean(data.configured));
      } catch {
        setRequestConfigured(false);
      }
    }

    loadCentralRequests();
  }, []);

  useEffect(() => {
    if (!isAdminUser || !currentUser) {
      setAdminUsers([]);
      setAdminUsersConfigured(false);
      setAdminUsersError("");
      return;
    }

    let active = true;

    async function loadAdminUsers() {
      setAdminUsersLoading(true);
      setAdminUsersError("");

      try {
        const data = await getJson("/api/admin/users");
        if (!active) {
          return;
        }

        setAdminUsers(Array.isArray(data.users) ? data.users : []);
        setAdminUsersConfigured(Boolean(data.configured));
        if (!data.configured && data.error) {
          setAdminUsersError(data.error);
        }
      } catch (error) {
        if (!active) {
          return;
        }

        setAdminUsers([]);
        setAdminUsersConfigured(false);
        setAdminUsersError(error.message || "Admin user analytics could not load right now.");
      } finally {
        if (active) {
          setAdminUsersLoading(false);
        }
      }
    }

    loadAdminUsers();

    return () => {
      active = false;
    };
  }, [currentUser?.id, isAdminUser, reviewSessions.length]);

  const studyText = buildStudyText(noteText, uploadedText);
  const hasCustomSource = Boolean(studyText);
  const activeTopicFocus = String(topicInput || "").trim() || String(topicFilter || "").trim();
  const subjectDisplay =
    activeTopicFocus && !hasCustomSource ? "Topic Focus" : subject || (activeTopicFocus ? "Topic Focus" : "Select a subject");
  const bankEntries = useMemo(() => getAllEntries(), []);
  const customEntries = useMemo(
    () => (hasCustomSource ? buildCustomEntries(studyText, subject) : []),
    [hasCustomSource, studyText, subject]
  );
  const activeEntries = useMemo(() => {
    if (!hasCustomSource) {
      return bankEntries;
    }

    if (!customEntries.length) {
      return bankEntries;
    }

    if (activeTopicFocus) {
      return uniqueBy(
        [...customEntries, ...bankEntries],
        (entry) => `${entry.subject}-${normalize(entry.q || entry.prompt)}-${normalize(entry.a || entry.answer)}`
      );
    }

    return customEntries;
  }, [hasCustomSource, customEntries, bankEntries, activeTopicFocus]);

  const weakCardIds = useMemo(
    () =>
      Object.entries(ratings)
        .filter(([, value]) => value === "again" || value === "hard")
        .map(([key]) => key),
    [ratings]
  );

  const accuracy = useMemo(() => {
    const values = Object.values(ratings);
    const answered = values.filter(Boolean).length;
    const correct = values.filter((value) => value === "easy").length;
    return answered ? Math.round((correct / answered) * 100) : 0;
  }, [ratings]);

  const totalCards = getAllEntries().length;
  const currentCard = flashcards[clamp(cardIdx, 0, Math.max(flashcards.length - 1, 0))];
  const quizItem = quiz[quizIdx];
  const answeredCount = quiz.filter((item) => isQuestionAnswered(item)).length;
  const unansweredQuizNumbers = quiz
    .map((item, index) => (!isQuestionAnswered(item) ? index + 1 : null))
    .filter(Boolean);
  const correctCount = quiz.filter(
    (item) => scoreQuestion(item) === 1
  ).length;
  const simulationItem = simulationQuestions[simulationIdx];
  const simulationAnsweredCount = simulationQuestions.filter((item) => isQuestionAnswered(item)).length;
  const unansweredSimulationNumbers = simulationQuestions
    .map((item, index) => (!isQuestionAnswered(item) ? index + 1 : null))
    .filter(Boolean);
  const simulationCorrectCount = simulationQuestions.filter((item) => scoreQuestion(item) === 1).length;
  const simulationCurrentCorrect =
    !!simulationItem &&
    isQuestionAnswered(simulationItem) &&
    scoreQuestion(simulationItem) === 1;
  const simulationProgressPercent = simulationQuestions.length
    ? Math.round((simulationAnsweredCount / simulationQuestions.length) * 100)
    : 0;
  const simulationScore = simulationQuestions.length
    ? Math.round((simulationCorrectCount / simulationQuestions.length) * 100)
    : 0;
  const simulationIncorrectCount = Math.max(simulationQuestions.length - simulationCorrectCount, 0);
  const simulationSubjectBreakdown = useMemo(
    () =>
      Object.values(
        simulationQuestions.reduce((accumulator, item) => {
          const key = item.subject || "Mixed Review";
          if (!accumulator[key]) {
            accumulator[key] = { subject: key, total: 0, correct: 0 };
          }

          accumulator[key].total += 1;
          if (scoreQuestion(item) === 1) {
            accumulator[key].correct += 1;
          }

          return accumulator;
        }, {})
      )
        .map((item) => ({
          ...item,
          percent: item.total ? Math.round((item.correct / item.total) * 100) : 0,
        }))
        .sort((left, right) => right.percent - left.percent),
    [simulationQuestions]
  );
  const simulationStrongSubjects = simulationSubjectBreakdown.filter((item) => item.percent >= 75).slice(0, 3);
  const simulationWeakSubjects = [...simulationSubjectBreakdown]
    .sort((left, right) => left.percent - right.percent)
    .filter((item) => item.percent < 65)
    .slice(0, 3);
  const currentCorrect =
    !!quizItem &&
    isQuestionAnswered(quizItem) &&
    scoreQuestion(quizItem) === 1;
  const progressPercent = quiz.length ? Math.round((answeredCount / quiz.length) * 100) : 0;
  const flashcardCompletedCount = flashcards.filter((card) => flashcardSessionRatings[card.id]).length;
  const flashcardStrongCount = flashcards.filter((card) => flashcardSessionRatings[card.id] === "easy").length;
  const flashcardNeedsReviewCount = flashcards.filter((card) => {
    const value = flashcardSessionRatings[card.id];
    return value === "again" || value === "hard";
  }).length;
  const flashcardProgressPercent = flashcards.length
    ? Math.round((flashcardCompletedCount / flashcards.length) * 100)
    : 0;
  const reviewSessionAverage = reviewSessions.length
    ? Math.round(reviewSessions.reduce((total, session) => total + Number(session.score || 0), 0) / reviewSessions.length)
    : 0;
  const hasRequestDraft = Boolean(requestName.trim() || requestMessage.trim() || requestStatus);
  const overallAnsweredCount = reviewSessions.reduce((total, session) => total + Number(session.answeredCount || 0), 0);
  const incorrectReviewItems = useMemo(() => collectIncorrectQuestions(reviewSessions), [reviewSessions]);
  const quizSessionCount = reviewSessions.filter((session) => session.mode === "quiz").length;
  const quizAverage = quizSessionCount
    ? Math.round(
        reviewSessions
          .filter((session) => session.mode === "quiz")
          .reduce((total, session) => total + Number(session.score || 0), 0) / quizSessionCount
      )
    : 0;
  const subjectNames = Object.keys(QUESTION_BANK);
  const weakSubjectCounts = weakCardIds.reduce((accumulator, cardId) => {
    const matchedSubject = subjectNames.find((name) => String(cardId || "").startsWith(`${name}-`));
    if (!matchedSubject) {
      return accumulator;
    }

    accumulator[matchedSubject] = (accumulator[matchedSubject] || 0) + 1;
    return accumulator;
  }, {});
  const weakestSubject =
    Object.entries(weakSubjectCounts).sort((left, right) => Number(right[1]) - Number(left[1]))[0]?.[0] || "";
  const subjectPerformanceSummary = useMemo(
    () =>
      Object.values(
        reviewSessions.reduce((accumulator, session) => {
          const key = session.subject || "Mixed Review";
          if (!accumulator[key]) {
            accumulator[key] = { subject: key, attempts: 0, scoreTotal: 0, answered: 0 };
          }

          accumulator[key].attempts += 1;
          accumulator[key].scoreTotal += Number(session.score || 0);
          accumulator[key].answered += Number(session.answeredCount || 0);
          return accumulator;
        }, {})
      )
        .map((item) => ({
          ...item,
          average: item.attempts ? Math.round(item.scoreTotal / item.attempts) : 0,
        }))
        .sort((left, right) => right.average - left.average),
    [reviewSessions]
  );
  const requestTypeSummary = useMemo(
    () =>
      Object.entries(
        requestHistory.reduce((accumulator, item) => {
          const key = item.type || "General Feedback";
          accumulator[key] = (accumulator[key] || 0) + 1;
          return accumulator;
        }, {})
      ).sort((left, right) => Number(right[1]) - Number(left[1])),
    [requestHistory]
  );
  const mostRecentSession = reviewSessions[0] || null;
  const savedSessionWaiting =
    reviewSessions.find((session) => session.saved && session.mode === "quiz") ||
    reviewSessions.find((session) => session.saved);
  const studyStreak = getStudyStreak(reviewSessions);
  const savedSessionCount = reviewSessions.filter((session) => session.saved).length;
  const todayKey = getDateKey();
  const todayAnsweredCount = reviewSessions
    .filter((session) => getDateKey(session.createdAt) === todayKey)
    .reduce((total, session) => total + Number(session.answeredCount || 0), 0);
  const dailyGoalTarget = 10;
  const dailyGoalProgress = clamp(Math.round((todayAnsweredCount / dailyGoalTarget) * 100), 0, 100);
  const readinessScore = clamp(
    Math.round((accuracy * 0.4) + (reviewSessionAverage * 0.25) + Math.min(sessions * 3, 20) + Math.min(studyStreak * 4, 15)),
    0,
    100
  );
  const simulationFlaggedCount = simulationQuestions.filter((item) => item.flagged).length;
  const remediationFocusSubject =
    remediationContext?.weakestSubject ||
    simulationWeakSubjects[0]?.subject ||
    weakestSubject ||
    mostRecentSession?.subject ||
    "";
  const isFirstVisit = !reviewSessions.length && !Object.keys(ratings).length;
  const calendarDays = useMemo(
    () => buildCalendarDays(calendarMonth, calendarEvents),
    [calendarMonth, calendarEvents]
  );
  const selectedDateEvents = useMemo(
    () =>
      sortByDateAsc(
        calendarEvents.filter(
          (event) => formatDateKey(event.date || event.dateKey || event.createdAt || new Date()) === calendarSelectedDate
        ),
        "date"
      ),
    [calendarEvents, calendarSelectedDate]
  );
  const upcomingEvents = useMemo(() => getUpcomingEvents(calendarEvents, 5), [calendarEvents]);
  const overduePlannerItems = useMemo(() => getOverduePlannerItems(plannerItems), [plannerItems]);
  const plannerCompletionRate = useMemo(() => getPlannerCompletionRate(plannerItems), [plannerItems]);
  const plannerOpenItems = plannerItems.filter((item) => !item.completed);
  const plannerModeSummary = useMemo(
    () =>
      Object.entries(
        plannerItems.reduce((accumulator, item) => {
          const key = item.mode || "mixed";
          accumulator[key] = (accumulator[key] || 0) + 1;
          return accumulator;
        }, {})
      ).sort((left, right) => Number(right[1]) - Number(left[1])),
    [plannerItems]
  );
  const scheduledSubjectSummary = useMemo(
    () =>
      Object.entries(
        calendarEvents.reduce((accumulator, item) => {
          if (!item.subject) {
            return accumulator;
          }
          accumulator[item.subject] = (accumulator[item.subject] || 0) + 1;
          return accumulator;
        }, {})
      ).sort((left, right) => Number(right[1]) - Number(left[1])),
    [calendarEvents]
  );
  const plannerRecommendedItem =
    sortByDateAsc(
      plannerOpenItems.filter((item) => item.dueDate),
      "dueDate"
    )[0] || plannerOpenItems[0] || null;
  const plannerSummaryLine = plannerRecommendedItem
    ? `${plannerRecommendedItem.title}${plannerRecommendedItem.subject ? ` | ${plannerRecommendedItem.subject}` : ""}`
    : "No active planner items yet";
  const adaptiveInsights = useAdaptiveInsights(reviewSessions);
  const recommendedFocus = adaptiveInsights.primaryFocus;
  const dueTodayCount = useMemo(() => getDueTodayCount(cardSchedule), [cardSchedule]);
  const recommendedFocusReason = (() => {
    if (!recommendedFocus) {
      return "Complete a flashcard, quiz, or simulation session and CareDrop will start surfacing the areas that may benefit from extra practice.";
    }

    if (adaptiveInsights.pattern === "exam-practice") {
      return `Recent exam-style results suggest ${recommendedFocus.subject}${recommendedFocus.topic ? ` | ${formatTopicHeading(recommendedFocus.topic)}` : ""} needs broader application practice before the next full run.`;
    }

    if (adaptiveInsights.pattern === "remediation") {
      return `Repeated misses are clustering around ${recommendedFocus.topic ? formatTopicHeading(recommendedFocus.topic) : recommendedFocus.subject}, so you may benefit from extra application-based review next.`;
    }

    return `Accuracy and confidence are softer in ${recommendedFocus.topic ? formatTopicHeading(recommendedFocus.topic) : recommendedFocus.subject}, which looks more recall-based right now.`;
  })();
  const recommendedFocusActionLabel =
    adaptiveInsights.pattern === "exam-practice"
      ? "Retry Weak Topics"
      : adaptiveInsights.pattern === "remediation"
        ? "Start Remediation Quiz"
        : "Start Focus Set";
  const recommendedFocusSecondaryLabel =
    adaptiveInsights.pattern === "focus-set" ? "Review Missed Items" : "Start Focus Set";
  const recommendationExplanationItems = adaptiveInsights.recommendationReasons?.length
    ? adaptiveInsights.recommendationReasons
    : ["CareDrop will explain its next recommendation more clearly after a little more review data is available."];
  const remediationEffectivenessLine = adaptiveInsights.remediationSummary?.improvedTopic
    ? `${formatTopicHeading(adaptiveInsights.remediationSummary.improvedTopic.topic || adaptiveInsights.remediationSummary.improvedTopic.subject)} is responding better after remediation.`
    : adaptiveInsights.remediationSummary?.strugglingTopic
      ? `${formatTopicHeading(adaptiveInsights.remediationSummary.strugglingTopic.topic || adaptiveInsights.remediationSummary.strugglingTopic.subject)} still needs another pass even after remediation.`
      : "Remediation recovery trends will appear after at least one before-and-after recovery attempt.";
  const adminUserAverageScore = adminUsers.length
    ? Math.round(adminUsers.reduce((total, user) => total + Number(user.averageScore || 0), 0) / adminUsers.length)
    : 0;
  const adminMostActiveUser = adminUsers[0] || null;
  const adminWeakestUser = [...adminUsers]
    .filter((user) => user.weakSubject || Number(user.averageScore || 0) > 0)
    .sort((left, right) => Number(left.averageScore || 0) - Number(right.averageScore || 0))[0] || null;

  useEffect(() => {
    flashcardShownAtRef.current = Date.now();
  }, [currentCard?.id]);

  useEffect(() => {
    quizShownAtRef.current = Date.now();
  }, [quizItem?.id, quizIdx]);

  useEffect(() => {
    simulationShownAtRef.current = Date.now();
  }, [simulationItem?.id, simulationIdx]);

  const featureUsageSummary = [
    { label: "Flashcard sets", value: reviewSessions.filter((session) => session.mode === "flashcard").length },
    { label: "Quiz sessions", value: reviewSessions.filter((session) => session.mode === "quiz").length },
    { label: "Simulation runs", value: reviewSessions.filter((session) => session.mode === "simulation").length },
    { label: "Planner items", value: plannerItems.length },
    { label: "Calendar events", value: calendarEvents.length },
  ];
  const darkMode = C.mode === "dark";
  const softSurface = C.surfaceMuted;
  const adminModeActive = mode === "admin" && isAdminUser;
  const successSurface = darkMode ? C.accentLight : "#F3FBF6";
  const successBorder = darkMode ? C.accentMid : "#B9E3CA";
  const errorSurface = darkMode ? C.redLight : "#FFF1F2";
  const errorBorder = darkMode ? C.red : "#F4A8B4";
  const warningSurface = darkMode ? C.amberLight : "#FFF7E8";
  const warningBorder = C.amber;
  const infoSurface = darkMode ? C.blueLight : "#EEF4FB";
  const infoBorder = darkMode ? C.border : "#C7D6E5";
  const syncStatusTone = cloudSyncState === "sync-failed"
    ? { bg: errorSurface, border: errorBorder, label: "Sync failed" }
    : cloudSyncState === "queued-sync"
      ? { bg: warningSurface, border: warningBorder, label: "Queued for sync" }
      : cloudSyncState === "syncing"
    ? { bg: infoSurface, border: infoBorder, label: "Syncing" }
        : cloudSyncState === "synced"
          ? { bg: successSurface, border: successBorder, label: "Synced to cloud" }
    : { bg: darkMode ? softSurface : "#F8F5EE", border: C.border, label: "Saved locally" };
  const adminFeedbackItems = useMemo(
    () => sortByDateDesc(requestHistory, "createdAt"),
    [requestHistory]
  );
  const adminRecentSessions = reviewSessions.slice(0, 8);
  const recommendedAction = (() => {
    if (overduePlannerItems.length) {
      const nextOverdue = overduePlannerItems[0];
      return {
        title: "Clear an overdue study target",
        body: `${nextOverdue.title}${nextOverdue.subject ? ` in ${nextOverdue.subject}` : ""} is already past due. Reopen it now so the planner stays useful instead of becoming a guilt list.`,
        cta: "Open planner",
        onClick: () => queueModeChange("planner"),
      };
    }

    if (plannerRecommendedItem) {
      return {
        title: "Follow your next planned review",
        body: `${plannerRecommendedItem.title}${plannerRecommendedItem.subject ? ` in ${plannerRecommendedItem.subject}` : ""}${plannerRecommendedItem.dueDate ? ` is due on ${plannerRecommendedItem.dueDate}` : " is ready now"}. Keeping one promise to yourself today is enough to keep momentum alive.`,
        cta: "Open planner",
        onClick: () => queueModeChange("planner"),
      };
    }

    if (savedSessionWaiting) {
      return {
        title: "Resume a saved review session",
        body: `You already have ${buildSessionLabel(savedSessionWaiting)} waiting. Reopen it and keep your momentum instead of starting from zero.`,
        cta: "Resume saved session",
        onClick: () => openSavedQuiz(savedSessionWaiting),
      };
    }

    if (incorrectReviewItems.length) {
      return {
        title: "Turn recent misses into a recovery set",
        body: remediationFocusSubject
          ? `Your recent wrong answers are clustering around ${remediationFocusSubject}. A short remediation quiz will tighten those weak spots faster than starting broad again.`
          : "You have enough recent misses for a targeted recovery quiz. Use it to revisit what went wrong while the details are still fresh.",
        cta: "Open remediation quiz",
        onClick: () => startRemediationMode(),
      };
    }

    if (weakCardIds.length) {
      return {
        title: "Revisit your weak areas next",
        body: weakestSubject
          ? `${weakSubjectCounts[weakestSubject]} recent misses are clustering in ${weakestSubject}. A short remediation set there will tighten recall faster than restarting broad review.`
          : "Your missed and unsure cards are ready to turn into a focused remediation set while the weak spots are still fresh.",
        cta: "Open remediation",
        onClick: () => startRemediationMode(),
      };
    }

    if (mostRecentSession) {
      return {
        title: `Continue ${mostRecentSession.subject}`,
        body: `Your latest session was ${buildSessionLabel(mostRecentSession)}. Keep the thread going while the topic is still fresh.`,
        cta:
          mostRecentSession.mode === "simulation"
            ? "Resume simulation"
            : mostRecentSession.mode === "quiz"
              ? "Start another quiz"
              : "Open flashcards",
        onClick: () => {
          setSubject(mostRecentSession.subject || subject);
          setDifficulty(mostRecentSession.difficulty || difficulty);
          setTopicFilter(mostRecentSession.topic || "");
          setTopicInput(mostRecentSession.topic || "");
          if (mostRecentSession.mode === "simulation") {
            openSavedQuiz(mostRecentSession);
          } else if (mostRecentSession.mode === "quiz") {
            queueModeChange("quiz");
            if (!quiz.length) {
              generateQuiz();
            }
          } else {
            queueModeChange("flashcard");
            if (!flashcards.length) {
              loadLocalFlashcardSet();
            }
          }
        },
      };
    }

    return {
      title: subject ? "Start your first focused session" : "Choose a subject to begin",
      body: subject
        ? "Open a 10-card flashcard set or a short quiz, then let the dashboard begin tracking your accuracy, streak, and weak areas."
        : "Open Flashcards or Quiz, choose a subject or topic inside the module, and CareDrop will prepare your first focused set.",
      cta: subject ? "Open flashcards" : "Go to filters",
      onClick: () => {
        if (!subject) {
          setFlashcardViewMode("setup");
          setViewMode("setup");
          queueModeChange("flashcard");
          setStatusMessage("Choose a subject or topic, then generate your first focused flashcard set.");
          return;
        }

        queueModeChange("flashcard");
        if (!flashcards.length) {
          loadLocalFlashcardSet();
        }
      },
    };
  })();

  const dashboardStatCards = [
    {
      key: "answered",
      icon: "📈",
      value: overallAnsweredCount || 0,
      label: "Questions",
      helper: `${reviewSessions.length || 0} sessions tracked`,
      accent: C.accentMid,
    },
    {
      key: "accuracy",
      icon: "🏅",
      value: `${accuracy}%`,
      label: "Accuracy",
      helper: quizSessionCount ? `${quizSessionCount} quiz runs measured` : "Build your first quiz trend",
      accent: "#FACC15",
    },
    {
      key: "cards",
      icon: "⭐",
      value: `${(totalCards / 1000).toFixed(1)}k`,
      label: "Cards",
      helper: `${dueTodayCount} due today`,
      accent: "#C084FC",
    },
  ];

  const dashboardSubjectCards = useMemo(() => {
    return SUBJECT_OPTIONS.filter((name) => name !== "Mixed Review").map((name) => {
      const summary = subjectPerformanceSummary.find((item) => item.subject === name);
      const score = summary ? Math.round(summary.accuracy * 100) : 0;
      const tone = score >= 80 ? "Strong" : score >= 65 ? "Good" : score >= 1 ? "Needs focus" : "Build";
      const toneIcon = score >= 80 ? "🔥" : score >= 65 ? "📈" : score >= 1 ? "🩺" : "✨";
      return {
        subject: name,
        score,
        tone,
        toneIcon,
        icon: SUBJECT_VISUALS[name]?.icon || "📘",
        color: SUBJECT_VISUALS[name]?.color || "linear-gradient(90deg, #34D399 0%, #60A5FA 100%)",
      };
    });
  }, [subjectPerformanceSummary]);

  const weeklyActivityData = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("en-US", { weekday: "short" });
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);

    const buckets = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      const key = getDateKey(day.toISOString());
      const count = reviewSessions
        .filter((session) => getDateKey(session.createdAt) === key)
        .reduce((total, session) => total + Number(session.answeredCount || 0), 0);
      return {
        label: formatter.format(day),
        count,
      };
    });

    return buckets;
  }, [reviewSessions]);

  const weeklyActivityTotal = weeklyActivityData.reduce((total, item) => total + item.count, 0);
  const weeklyActivityMax = Math.max(...weeklyActivityData.map((item) => item.count), 1);
  const previousWeeklyTotal = reviewSessions
    .filter((session) => {
      const sessionDate = new Date(session.createdAt || Date.now());
      const diffDays = Math.floor((Date.now() - sessionDate.getTime()) / 86400000);
      return diffDays >= 7 && diffDays <= 13;
    })
    .reduce((total, session) => total + Number(session.answeredCount || 0), 0);
  const weeklyGrowth = previousWeeklyTotal
    ? Math.round(((weeklyActivityTotal - previousWeeklyTotal) / Math.max(previousWeeklyTotal, 1)) * 100)
    : 0;

  useEffect(() => {
    setAiResponse("");
    setQuestion("");
  }, [quizIdx, quiz.length]);

  function clearMessages() {
    setApiError("");
    setStatusMessage("");
    setUploadError("");
  }

  function ensureReviewTargetSelected(actionLabel, activeTopic = "") {
    if (subject || String(activeTopic || "").trim()) {
      return true;
    }

    setApiError(`Select a subject or enter a topic focus first before you ${actionLabel}.`);
    return false;
  }

  function clearRequestDraft() {
    setRequestType("Bug Report");
    setRequestName("");
    setRequestMessage("");
    setRequestStatus("");
  }

  function applyRecommendedFocusTarget() {
    if (!recommendedFocus) {
      return;
    }

    setSubject(recommendedFocus.subject && recommendedFocus.subject !== "Mixed Review" ? recommendedFocus.subject : "");
    setTopicFilter(recommendedFocus.topic || "");
    setTopicInput(recommendedFocus.topic || "");
  }

  async function startRecommendedFocusSet() {
    clearMessages();
    applyRecommendedFocusTarget();
    const nextTopic = recommendedFocus?.topic || "";

    queueModeChange("flashcard");
    if (nextTopic) {
      await generateClaudeFlashcards(nextTopic);
      return;
    }

    loadLocalFlashcardSet("Your recommended flashcard focus set is ready.", nextTopic);
  }

  async function startRecommendedReviewAction() {
    clearMessages();

    if (!recommendedFocus) {
      queueModeChange("flashcard");
      if (!flashcards.length) {
        loadLocalFlashcardSet("Your next flashcard set is ready.");
      }
      return;
    }

    applyRecommendedFocusTarget();

    if (adaptiveInsights.pattern === "exam-practice") {
      openSimulationLauncher();
      setStatusMessage(
        recommendedFocus.subject && recommendedFocus.subject !== "Mixed Review"
          ? `Choose a simulation length to retry broader exam-style practice, with extra attention on ${recommendedFocus.subject}.`
          : "Choose a simulation length to retry broader exam-style practice."
      );
      return;
    }

    if (adaptiveInsights.pattern === "remediation" && (incorrectReviewItems.length || weakCardIds.length)) {
      startRemediationMode();
      return;
    }

    queueModeChange("quiz");
    await generateQuiz(recommendedFocus.topic || "");
  }

  function resetCalendarDraft() {
    setCalendarDraftTitle("");
    setCalendarDraftType("Study");
    setCalendarDraftSubject("");
    setCalendarDraftNote("");
  }

  function addCalendarEvent() {
    if (!calendarDraftTitle.trim()) {
      setStatusMessage("Add a short title first so the calendar entry is clear.");
      return;
    }

    const nextEvent = {
      id: uid(),
      title: calendarDraftTitle.trim(),
      type: calendarDraftType,
      subject: calendarDraftSubject || "",
      note: calendarDraftNote.trim(),
      date: calendarSelectedDate,
      completed: false,
      createdAt: new Date().toISOString(),
    };

    setCalendarEvents((current) => sortByDateAsc([...current, nextEvent], "date"));
    resetCalendarDraft();
    setStatusMessage("Calendar event saved.");
  }

  function toggleCalendarEvent(eventId) {
    setCalendarEvents((current) =>
      current.map((item) =>
        item.id === eventId ? { ...item, completed: !item.completed } : item
      )
    );
  }

  function deleteCalendarEvent(eventId) {
    setCalendarEvents((current) => current.filter((item) => item.id !== eventId));
    setStatusMessage("Calendar event removed.");
  }

  function addPlannerItem() {
    if (!plannerTitle.trim()) {
      setStatusMessage("Add a planner title first.");
      return;
    }

    const nextItem = {
      id: uid(),
      title: plannerTitle.trim(),
      subject: plannerSubject || "",
      mode: plannerMode,
      dueDate: plannerDueDate || "",
      notes: plannerNotes.trim(),
      completed: false,
      createdAt: new Date().toISOString(),
    };

    setPlannerItems((current) => sortByDateAsc([...current, nextItem], "dueDate"));
    setPlannerTitle("");
    setPlannerSubject("");
    setPlannerMode("mixed");
    setPlannerDueDate(getDateInputValue());
    setPlannerNotes("");
    setStatusMessage("Planner item saved.");
  }

  function togglePlannerItem(itemId) {
    setPlannerItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              completed: !item.completed,
              completedAt: !item.completed ? new Date().toISOString() : null,
            }
          : item
      )
    );
  }

  function deletePlannerItem(itemId) {
    setPlannerItems((current) => current.filter((item) => item.id !== itemId));
    setStatusMessage("Planner item removed.");
  }

  function addPlannerItemToCalendar(item) {
    const nextEvent = {
      id: uid(),
      title: item.title,
      type: item.mode === "simulation" ? "Simulation" : item.mode === "quiz" ? "Quiz" : "Study",
      subject: item.subject || "",
      note: item.notes || "Planned from the CareDrop study planner.",
      date: item.dueDate || getDateInputValue(),
      completed: Boolean(item.completed),
      createdAt: new Date().toISOString(),
    };

    setCalendarEvents((current) => sortByDateAsc([...current, nextEvent], "date"));
    setStatusMessage("Planner item added to the calendar.");
  }

  async function handleForgotPassword() {
    setAuthError("");
    setAuthNotice(null);

    const email = authEmail.trim().toLowerCase();

    if (!supabaseConfigured || !supabase) {
      setAuthError("Password reset becomes available after Supabase is connected.");
      return;
    }

    if (!email) {
      setAuthError("Enter your email first so we know where to send the reset link.");
      return;
    }

    setForgotPasswordLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });

      if (error) {
        throw error;
      }

      setAuthNotice({
        title: "Check your email",
        body: "Password reset instructions were sent. Open the reset link, then return here and sign in with your updated password.",
        actionLabel: "Back to sign in",
      });
      setAuthMode("login");
    } catch (error) {
      setAuthError(normalizeAuthErrorMessage(error, "reset") || "We couldn't send the reset email right now.");
    } finally {
      setForgotPasswordLoading(false);
    }
  }

  async function handleAuthSubmit() {
    setAuthError("");
    setAuthNotice(null);

    const email = authEmail.trim().toLowerCase();
    const password = authPassword;
    const agreed = Boolean(termsAccepted);

    if (!email || !password) {
      setAuthError("Enter your email and password.");
      return;
    }

    if (!agreed) {
      setAuthError("Please accept the Terms and Conditions to continue.");
      return;
    }

    setAuthLoading(true);

    try {
      if (supabaseConfigured && supabase) {
        if (authMode === "register") {
          const name = authName.trim();

          if (!name) {
            throw new Error("Enter your name to create an account.");
          }

          if (password.length < 8) {
            throw new Error("Use at least 8 characters for the password.");
          }

          if (password !== authConfirmPassword) {
            throw new Error("Passwords do not match.");
          }

          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: getAuthRedirectUrl(),
              data: {
                full_name: name,
              },
            },
          });

          if (error) {
            throw error;
          }

          if (data.user) {
            const nextUser = mapSupabaseUser(data.user);
            saveAuthSession(nextUser);
            setCurrentUser(nextUser);
          }

          setAuthName("");
          setAuthEmail("");
          setAuthPassword("");
          setAuthConfirmPassword("");
          setTermsAccepted(false);
          if (data.session && data.user) {
            setStatusMessage("Account created and signed in successfully.");
            applyPersistedSnapshot(loadPersisted(data.user.id));
          } else {
            setAuthMode("login");
            setAuthEmail("");
            setAuthNotice({
              title: "Verify your email",
              body: "Your account was created. If Supabase email confirmation is enabled, open the verification email first, then come back to sign in and continue your review sessions.",
              actionLabel: "Sign in when ready",
            });
            return;
          }
        } else {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (error) {
            throw error;
          }

          const nextUser = mapSupabaseUser(data.user);
          saveAuthSession(nextUser);
          setCurrentUser(nextUser);
          applyPersistedSnapshot(loadPersisted(nextUser.id));
          setStatusMessage("Signed in successfully.");
        }
      } else {
        if (!window.crypto?.subtle) {
          throw new Error("Secure login is not available in this browser.");
        }

        const accounts = loadAccounts();
        const passwordHash = await hashSecret(password);

        if (authMode === "register") {
          const name = authName.trim();

          if (!name) {
            throw new Error("Enter your name to create an account.");
          }

          if (password.length < 8) {
            throw new Error("Use at least 8 characters for the password.");
          }

          if (password !== authConfirmPassword) {
            throw new Error("Passwords do not match.");
          }

          if (accounts.some((account) => String(account.email || "").trim().toLowerCase() === email)) {
            throw new Error("An account with that email already exists.");
          }

          const nextUser = {
            id: uid(),
            name,
            email,
            passwordHash,
            createdAt: new Date().toISOString(),
            provider: "local",
          };

          saveAccounts([...accounts, nextUser]);
          saveAuthSession({ id: nextUser.id, name: nextUser.name, email: nextUser.email, provider: "local" });
          setCurrentUser({ id: nextUser.id, name: nextUser.name, email: nextUser.email, provider: "local" });
          applyPersistedSnapshot(loadPersisted(nextUser.id));
          setAuthName("");
          setAuthEmail("");
          setAuthPassword("");
          setAuthConfirmPassword("");
          setTermsAccepted(false);
          setStatusMessage("Account created and saved on this device.");
        } else {
          const matched = accounts.find((account) => String(account.email || "").trim().toLowerCase() === email);

          if (!matched) {
            throw new Error("Incorrect email or password.");
          }

          if (String(matched.passwordHash || "") !== passwordHash) {
            throw new Error("Incorrect email or password.");
          }

          saveAuthSession({ id: matched.id, name: matched.name, email: matched.email, provider: "local" });
          setCurrentUser({ id: matched.id, name: matched.name, email: matched.email, provider: "local" });
          applyPersistedSnapshot(loadPersisted(matched.id));
          setStatusMessage("Signed in successfully.");
        }
      }

      if (authMode !== "register") {
        setAuthName("");
        setAuthEmail("");
        setAuthPassword("");
        setAuthConfirmPassword("");
        setTermsAccepted(false);
      }
    } catch (error) {
      setAuthError(normalizeAuthErrorMessage(error, authMode) || "Unable to complete sign in right now.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    if (supabaseConfigured && supabase && currentUser?.provider === "supabase") {
      await supabase.auth.signOut();
    }

    clearAuthSession();
    window.location.reload();
  }
  useInactivityTimeout({
    currentUser,
    clearAuthSession,
    saveAuthSession,
    signOutProvider:
      supabaseConfigured && supabase && currentUser?.provider === "supabase"
        ? async () => {
            await supabase.auth.signOut();
          }
        : undefined,
    onExpire: () => {
      setCurrentUser(null);
      setAuthMode("login");
      setAuthPassword("");
      setAuthConfirmPassword("");
      setTermsAccepted(false);
      setAuthNotice({
        title: "Session expired",
        body: "You were signed out after 10 minutes of inactivity. Sign in again to continue where you left off.",
        actionLabel: "Sign in again",
      });
    },
  });

  function markFlashcardsAsUsed(deck) {
    setUsedFlashcardIds((prev) => uniqueBy([...prev, ...deck.map((card) => card.id)], (value) => value));
    setUsedFlashcardQuestions((prev) =>
      uniqueBy([...prev, ...deck.map((card) => normalize(card.question))], (value) => value)
    );
    setRecentFlashcardIds((prev) => [...prev, ...deck.map((card) => card.id)].slice(-RECENT_MEMORY_LIMIT));
  }

  function resolveReviewSubject(activeTopic = topicFilter) {
    return String(activeTopic || "").trim() && !hasCustomSource ? "" : subject;
  }

  function getActiveTopicFocus(nextTopic = "") {
    const explicitTopic = String(nextTopic || "").trim();
    if (explicitTopic) {
      return explicitTopic;
    }

    if (String(topicInput || "").trim()) {
      return String(topicInput || "").trim();
    }

    return String(topicFilter || "").trim();
  }

  function buildLocalFlashcardSet(activeTopic = topicFilter) {
    const resolvedTopic = getActiveTopicFocus(activeTopic);
    const reviewSubject = resolveReviewSubject(resolvedTopic);
    const topicFallbackEntries = buildTopicFallbackEntries(
      resolvedTopic,
      reviewSubject,
      difficulty,
      FLASHCARD_SET_SIZE
    );
    const candidates = uniqueBy(
      [
        ...getTopicAlignedEntries(activeEntries, reviewSubject, difficulty, resolvedTopic),
        ...topicFallbackEntries,
      ].flatMap((entry) => buildFlashcardVariants(entry)),
      (card) => card.id
    );
    const filteredCandidates = filterWeakOnly
      ? candidates.filter((card) => weakCardIds.includes(card.id))
      : candidates;
    const dueCandidates = buildDueFlashcardPool(filteredCandidates, cardSchedule);

    if (dueCandidates.length >= FLASHCARD_SET_SIZE) {
      return selectSessionItems(
        dueCandidates,
        FLASHCARD_SET_SIZE,
        hasCustomSource ? [] : usedFlashcardIdsRef.current,
        recentFlashcardIdsRef.current,
        (card) => card.id
      );
    }

    const remainingCandidates = filteredCandidates.filter((card) => !dueCandidates.some((dueCard) => dueCard.id === card.id));
    const dueSelection = selectSessionItems(
      dueCandidates,
      Math.min(dueCandidates.length, FLASHCARD_SET_SIZE),
      [],
      [],
      (card) => card.id
    );
    const fillSelection = selectSessionItems(
      remainingCandidates,
      FLASHCARD_SET_SIZE - dueSelection.length,
      hasCustomSource ? [] : usedFlashcardIdsRef.current,
      recentFlashcardIdsRef.current,
      (card) => card.id
    );

    return [...dueSelection, ...fillSelection].slice(0, FLASHCARD_SET_SIZE);
  }

  function buildFlashcardCandidatePool(activeTopic = topicFilter) {
    const resolvedTopic = getActiveTopicFocus(activeTopic);
    const reviewSubject = resolveReviewSubject(resolvedTopic);
    const candidates = uniqueBy(
      getTopicAlignedEntries(activeEntries, reviewSubject, difficulty, resolvedTopic).flatMap((entry) => buildFlashcardVariants(entry)),
      (card) => card.id
    );
    const filteredCandidates = filterWeakOnly
      ? candidates.filter((card) => weakCardIds.includes(card.id))
      : candidates;
    const freshCandidates = hasCustomSource
      ? filteredCandidates
      : filteredCandidates.filter((card) => !usedFlashcardIdsRef.current.includes(card.id));
    const nonRecentFreshCandidates = freshCandidates.filter(
      (card) => !recentFlashcardIdsRef.current.includes(card.id)
    );

    return {
      candidates: filteredCandidates,
      freshCandidates,
      nonRecentFreshCandidates,
    };
  }

  function buildSyntheticFlashcardDeck(activeTopic, count, existingCards = []) {
    const resolvedTopic = getActiveTopicFocus(activeTopic);
    const reviewSubject = resolveReviewSubject(resolvedTopic);
    return selectSessionItems(
      buildTopicFallbackEntries(resolvedTopic, reviewSubject, difficulty, count * 2)
        .flatMap((entry) => buildFlashcardVariants(entry))
        .filter((card) => !existingCards.some((existing) => existing.id === card.id)),
      count,
      [],
      [],
      (card) => card.id
    );
  }

  function loadLocalFlashcardSet(message, activeTopic = topicFilter) {
    const resolvedTopic = getActiveTopicFocus(activeTopic);

    if (!subject && !resolvedTopic) {
      setFlashcards([]);
      setFlashcardViewMode("setup");
      setCardIdx(0);
      setFlashcardSessionRatings({});
      setFlashcardResponseTimes({});
      setFlashcardSessionSubmitted(false);

      if (message) {
        setStatusMessage("Select a subject or enter a topic focus first to prepare your flashcard set.");
      }

      return;
    }

    const deck = buildLocalFlashcardSet(resolvedTopic);
    setFlashcards(deck);
    if (deck.length && message) {
      setFlashcardViewMode("study");
      setViewMode("study");
    }
    setRemediationContext(null);
    setCardIdx(0);
    setFlashcardSessionRatings({});
    setFlashcardResponseTimes({});
    setFlashcardSessionSubmitted(false);
    markFlashcardsAsUsed(deck);

    if (message) {
      if (deck.length) {
        setStatusMessage(message);
      } else {
        setApiError("No flashcards are ready yet for this exact focus. Try generating again and CareDrop will use the bank plus Gemini to expand the set.");
      }
    }
  }

  useEffect(() => {
    loadLocalFlashcardSet("");
  }, [subject, difficulty, filterWeakOnly, topicFilter]);

  async function generateClaudeFlashcards(activeTopic = topicFilter) {
    const resolvedTopic = getActiveTopicFocus(activeTopic);
    if (!ensureReviewTargetSelected("generate flashcards", resolvedTopic)) {
      return;
    }

    clearMessages();
    const reviewSubject = resolveReviewSubject(resolvedTopic);
    const topicSeedNotes =
      resolvedTopic
        ? buildTopicGenerationNotes(activeEntries, resolvedTopic, difficulty, studyText)
        : studyText;

    const { candidates: bankCandidates, freshCandidates, nonRecentFreshCandidates } =
      buildFlashcardCandidatePool(resolvedTopic);
    const preferredBankPool = nonRecentFreshCandidates.length ? nonRecentFreshCandidates : freshCandidates;
    const bankFirstDeck = selectSessionItems(
      preferredBankPool.length ? preferredBankPool : bankCandidates,
      Math.min(FLASHCARD_SET_SIZE, preferredBankPool.length || bankCandidates.length),
      [],
      recentFlashcardIdsRef.current,
      (card) => card.id
    );
    const hasFreshBankSet = preferredBankPool.length >= FLASHCARD_SET_SIZE;

    if (!isOnline || hasFreshBankSet) {
      const deck = bankFirstDeck.length >= FLASHCARD_SET_SIZE
        ? bankFirstDeck.slice(0, FLASHCARD_SET_SIZE)
        : resolvedTopic
          ? [
              ...bankFirstDeck,
              ...buildSyntheticFlashcardDeck(
                resolvedTopic,
                FLASHCARD_SET_SIZE - bankFirstDeck.length,
                bankFirstDeck
              ),
            ].slice(0, FLASHCARD_SET_SIZE)
          : selectSessionItems(bankCandidates, FLASHCARD_SET_SIZE, [], recentFlashcardIdsRef.current, (card) => card.id);

      setFlashcards(deck);
      if (deck.length) {
        setFlashcardViewMode("study");
        setViewMode("study");
      }
      setRemediationContext(null);
      setCardIdx(0);
      setMode("flashcard");
      setFlashcardSessionRatings({});
      setFlashcardResponseTimes({});
      setFlashcardSessionSubmitted(false);
      markFlashcardsAsUsed(deck);
      setStatusMessage(
        !isOnline
          ? "Offline mode: CareDrop loaded a local flashcard set so you can keep studying."
          : resolvedTopic
            ? `CareDrop loaded a bank-supported ${FLASHCARD_SET_SIZE}-card focus set for ${resolvedTopic}.`
            : "CareDrop loaded a fresh bank-supported 10-card flashcard set."
      );
      return;
    }

    setApiLoading(true);

    try {
      const needed = Math.max(0, FLASHCARD_SET_SIZE - bankFirstDeck.length);
      const data = await postJson("/api/claude/cards", {
        notes: topicSeedNotes,
        subject: reviewSubject,
        topic: resolvedTopic,
        difficulty: difficulty === "All" ? "mixed" : difficulty,
        count: needed || FLASHCARD_SET_SIZE,
        excludeQuestions: [
          ...(hasCustomSource ? [] : usedFlashcardQuestionsRef.current),
          ...bankFirstDeck.map((card) => card.question),
        ],
      });

      const aiCards = sanitizeFlashcards(
        data.cards,
        reviewSubject,
        difficulty,
        resolvedTopic,
        usedFlashcardIdsRef.current,
        hasCustomSource
      );
      const combinedDeck = uniqueBy([...bankFirstDeck, ...aiCards], (card) => card.id).slice(0, FLASHCARD_SET_SIZE);
      const deck = combinedDeck.length >= FLASHCARD_SET_SIZE
        ? combinedDeck
        : resolvedTopic
          ? [
              ...combinedDeck,
              ...buildSyntheticFlashcardDeck(
                resolvedTopic,
                FLASHCARD_SET_SIZE - combinedDeck.length,
                combinedDeck
              ),
            ].slice(0, FLASHCARD_SET_SIZE)
          : [
              ...combinedDeck,
              ...selectSessionItems(
                bankCandidates,
                FLASHCARD_SET_SIZE - combinedDeck.length,
                combinedDeck.map((card) => card.id),
                recentFlashcardIdsRef.current,
                (card) => card.id
              ),
            ].slice(0, FLASHCARD_SET_SIZE);

      setFlashcards(deck);
      if (deck.length) {
        setFlashcardViewMode("study");
        setViewMode("study");
      }
      setRemediationContext(null);
      setCardIdx(0);
      setMode("flashcard");
      setFlashcardSessionRatings({});
      setFlashcardResponseTimes({});
      setFlashcardSessionSubmitted(false);
      markFlashcardsAsUsed(deck);
      setStatusMessage(
        aiCards.length
          ? `CareDrop used the bank first, then Gemini filled ${Math.min(aiCards.length, needed)} more card${Math.min(aiCards.length, needed) === 1 ? "" : "s"} for this focus.`
          : "CareDrop loaded the best available bank cards for this focus."
      );
    } catch (error) {
      const backupDeck = bankFirstDeck.length >= FLASHCARD_SET_SIZE
        ? bankFirstDeck
        : resolvedTopic
          ? [
              ...bankFirstDeck,
              ...buildSyntheticFlashcardDeck(
                resolvedTopic,
                FLASHCARD_SET_SIZE - bankFirstDeck.length,
                bankFirstDeck
              ),
            ].slice(0, FLASHCARD_SET_SIZE)
          : selectSessionItems(bankCandidates, FLASHCARD_SET_SIZE, [], recentFlashcardIdsRef.current, (card) => card.id);

      if (backupDeck.length) {
        setFlashcards(backupDeck);
        setFlashcardViewMode("study");
        setViewMode("study");
        setRemediationContext(null);
        setCardIdx(0);
        setMode("flashcard");
        setFlashcardSessionRatings({});
        setFlashcardResponseTimes({});
        setFlashcardSessionSubmitted(false);
        markFlashcardsAsUsed(backupDeck);
      }
      setApiError(error.message || "Gemini was busy, so CareDrop loaded the strongest available bank cards for now.");
    } finally {
      setApiLoading(false);
    }
  }

  async function requestNextFlashcardSet(activeTopic = topicFilter) {
    const resolvedTopic = getActiveTopicFocus(activeTopic);
    if (resolvedTopic || hasCustomSource) {
      await generateClaudeFlashcards(resolvedTopic);
      return;
    }

    loadLocalFlashcardSet("A new 10-card flashcard set is ready.", resolvedTopic);
  }

  async function requestNextQuizSet(activeTopic = topicFilter) {
    await generateQuiz(getActiveTopicFocus(activeTopic));
  }

  async function requestQuizBatch(activeTopic, count, excludePrompts = [], options = {}) {
    const {
      subjectOverride = subject,
      difficultyOverride = difficulty === "All" ? "mixed" : difficulty,
      examMode = false,
      examLength = count,
      topicOverride = activeTopic,
      notesOverride = studyText,
    } = options;

    const data = await postJson("/api/claude/quiz", {
      notes: notesOverride,
      subject: subjectOverride,
      topic: topicOverride,
      difficulty: difficultyOverride,
      count,
      excludeQuestions: excludePrompts,
      examMode,
      examLength,
    });

    return sanitizeQuizQuestions(
      data.questions,
      subjectOverride,
      difficultyOverride === "mixed" ? "All" : difficultyOverride,
      topicOverride,
      [],
      true,
      examMode
    );
  }

  async function generateQuiz(activeTopic = topicFilter) {
    const resolvedTopic = getActiveTopicFocus(activeTopic);
    if (!ensureReviewTargetSelected("generate a quiz", resolvedTopic)) {
      return;
    }

    clearMessages();
    const reviewSubject = resolveReviewSubject(resolvedTopic);
    const topicSeedNotes =
      resolvedTopic
        ? buildTopicGenerationNotes(activeEntries, resolvedTopic, difficulty, studyText)
        : studyText;
    const localPool = buildLocalQuizFallback(
      activeEntries,
      reviewSubject,
      difficulty,
      resolvedTopic,
      QUIZ_SET_SIZE * 4,
      [],
      { includeSyntheticTopicFill: false }
    );
    const topicFallbackPool = buildLocalQuizFallback(
      activeEntries,
      reviewSubject,
      difficulty,
      resolvedTopic,
      QUIZ_SET_SIZE * 4,
      [],
      { includeSyntheticTopicFill: true }
    );
    const freshLocalPool = hasCustomSource
      ? localPool
      : localPool.filter((item) => !usedQuizPromptsRef.current.includes(normalize(item.prompt)));
    const nonRecentFreshLocalPool = freshLocalPool.filter(
      (item) => !recentQuizPromptsRef.current.includes(normalize(item.prompt))
    );
    const preferredLocalPool = nonRecentFreshLocalPool.length ? nonRecentFreshLocalPool : freshLocalPool;
    const localQuestions = selectSessionItems(
      preferredLocalPool.length ? preferredLocalPool : localPool,
      Math.min(QUIZ_SET_SIZE, preferredLocalPool.length || localPool.length),
      [],
      recentQuizPromptsRef.current,
      (item) => normalize(item.prompt)
    );
    const hasFreshLocalQuiz = preferredLocalPool.length >= QUIZ_SET_SIZE;

    function commitQuizSet(questions, message, options = {}) {
      const { asError = false } = options;
      setQuiz(questions);
      setQuizViewMode("study");
      setViewMode("study");
      setRemediationContext(null);
      setQuizIdx(0);
      setQuizResponseTimes({});
      setMode("quiz");
      setQuizSubmitted(false);
      setQuizAnswerSheetOpen(false);

      if (asError) {
        setApiError(message);
      } else {
        setStatusMessage(message);
      }

      if (!hasCustomSource) {
        setUsedQuizPrompts((prev) =>
          uniqueBy(
            [...prev, ...questions.map((item) => normalize(item.prompt))],
            (value) => value
          )
        );
        setRecentQuizPrompts((prev) =>
          [...prev, ...questions.map((item) => normalize(item.prompt))].slice(-RECENT_MEMORY_LIMIT)
        );
      }
    }

    if (!isOnline) {
      const fallback = selectSessionItems(
        topicFallbackPool,
        QUIZ_SET_SIZE,
        hasCustomSource ? [] : usedQuizPromptsRef.current,
        recentQuizPromptsRef.current,
        (item) => normalize(item.prompt)
      );
      if (!fallback.length) {
        setQuiz([]);
        setQuizIdx(0);
        setQuizResponseTimes({});
        setApiError("No quiz questions are ready yet for this exact focus. Try generating again and CareDrop will use the bank plus Gemini to expand the set.");
        return;
      }
      commitQuizSet(fallback, "Offline mode: CareDrop prepared a local 10-question quiz from the stored review bank.");
      return;
    }

    if (hasFreshLocalQuiz) {
      commitQuizSet(
        localQuestions.slice(0, QUIZ_SET_SIZE),
        resolvedTopic
          ? `CareDrop loaded a bank-supported ${QUIZ_SET_SIZE}-question focus quiz for ${resolvedTopic}.`
          : "CareDrop loaded a fresh bank-supported 10-question quiz."
      );
      return;
    }

    setApiLoading(true);
    setQuizSubmitted(false);
    setQuizAnswerSheetOpen(false);
    setQuizResponseTimes({});

    try {
      const needed = Math.max(0, QUIZ_SET_SIZE - localQuestions.length);
      const aiQuestions = await requestQuizBatch(
        resolvedTopic,
        needed || QUIZ_SET_SIZE,
        uniqueBy(
          [
            ...(hasCustomSource ? [] : usedQuizPromptsRef.current),
            ...localQuestions.map((item) => item.prompt),
          ],
          (value) => normalize(value)
        ),
        {
          subjectOverride: reviewSubject,
          notesOverride: topicSeedNotes,
        }
      );
      const combinedQuestions = uniqueBy([...localQuestions, ...aiQuestions], (item) => normalize(item.prompt));
      const recycledFill = combinedQuestions.length >= QUIZ_SET_SIZE
        ? []
        : selectSessionItems(
            topicFallbackPool,
            QUIZ_SET_SIZE - combinedQuestions.length,
            combinedQuestions.map((item) => normalize(item.prompt)),
            recentQuizPromptsRef.current,
            (item) => normalize(item.prompt)
          );
      const questions = selectSessionItems(
        [...combinedQuestions, ...recycledFill],
        QUIZ_SET_SIZE,
        [],
        recentQuizPromptsRef.current,
        (item) => normalize(item.prompt)
      );
      if (!questions.length) {
        setQuiz([]);
        setQuizIdx(0);
        setQuizResponseTimes({});
        setApiError("No quiz questions are ready yet for this exact focus. Try generating again and CareDrop will use the bank plus Gemini to expand the set.");
        return;
      }

      commitQuizSet(
        questions,
        aiQuestions.length
          ? `CareDrop used the bank first, then Gemini filled ${Math.min(aiQuestions.length, needed)} more question${Math.min(aiQuestions.length, needed) === 1 ? "" : "s"} for this focus.`
          : "CareDrop loaded the best available bank questions for this focus."
      );
    } catch (error) {
      const fallback = selectSessionItems(
        topicFallbackPool,
        QUIZ_SET_SIZE,
        hasCustomSource ? [] : usedQuizPromptsRef.current,
        recentQuizPromptsRef.current,
        (item) => normalize(item.prompt)
      );
      if (!fallback.length) {
        setQuiz([]);
        setQuizIdx(0);
        setQuizResponseTimes({});
        setApiError("No quiz questions are ready yet for this exact focus. Try generating again and CareDrop will use the bank plus Gemini to expand the set.");
        return;
      }
      commitQuizSet(
        fallback,
        error.message || "Gemini was busy, so CareDrop loaded a bank-supported 10-question backup quiz.",
        { asError: true }
      );
    } finally {
      setApiLoading(false);
    }
  }

  async function generateSimulationExam(targetSize = simulationSize, activeTopic = topicFilter) {
    const finalTarget = SIMULATION_SIZE_OPTIONS.includes(Number(targetSize)) ? Number(targetSize) : 50;
    const simulationSubject = "Mixed Review";
    const simulationDifficulty = "mixed";
    const simulationTopic = "";
    const maxAiQuestions = finalTarget >= 500 ? 120 : finalTarget >= 100 ? 60 : 40;
    const aiBatchCap = Math.ceil(maxAiQuestions / SIMULATION_BATCH_SIZE);
    clearMessages();
    setApiLoading(true);
    setSimulationSubmitted(false);
    setSimulationUsedAi(false);
    setSimulationResponseTimes({});

    try {
      const localPool = selectSessionItems(
        buildLocalQuizFallback(
          activeEntries,
          "",
          "All",
          "",
          Math.max(finalTarget, 60),
          []
        ),
        finalTarget,
        hasCustomSource ? [] : usedQuizPromptsRef.current,
        recentQuizPromptsRef.current,
        (item) => normalize(item.prompt)
      );

      let combined = [...localPool];
      const shouldAskAi = isOnline && Boolean(activeTopic || hasCustomSource || combined.length < finalTarget);

      if (shouldAskAi) {
        const maxBatches = Math.min(Math.ceil(finalTarget / SIMULATION_BATCH_SIZE), aiBatchCap);

        for (let batchIndex = 0; batchIndex < maxBatches && combined.length < finalTarget; batchIndex += 1) {
          const requestedCount = Math.min(SIMULATION_BATCH_SIZE, finalTarget - combined.length);
          const aiBatch = await requestQuizBatch(
            simulationTopic,
            requestedCount,
            uniqueBy(
              [...combined.map((item) => item.prompt), ...(hasCustomSource ? [] : usedQuizPromptsRef.current)],
              (value) => normalize(value)
            ),
            {
              subjectOverride: simulationSubject,
              difficultyOverride: simulationDifficulty,
              examMode: true,
              examLength: finalTarget,
              topicOverride: simulationTopic,
            }
          );

          if (!aiBatch.length) {
            break;
          }

          combined = uniqueBy([...combined, ...aiBatch], (item) => normalize(item.prompt));
        }
      }

      const questions = selectSessionItems(
        combined,
        finalTarget,
        hasCustomSource ? [] : usedQuizPromptsRef.current,
        recentQuizPromptsRef.current,
        (item) => normalize(item.prompt)
      );

      setSimulationQuestions(questions);
      setRemediationContext(null);
      setSimulationIdx(0);
      setSimulationSize(finalTarget);
      setSimulationResponseTimes({});
      setSimulationSubmitted(false);
      setSimulationLaunchOpen(false);
      setMode("simulation");
      setSimulationUsedAi(combined.length > localPool.length);
      setSimulationAnswerSheetOpen(false);
      setStatusMessage(
        combined.length > localPool.length
          ? `Simulation exam ready. Gemini helped shape this mixed ${finalTarget}-question exam.`
          : `Simulation exam ready. Your mixed ${finalTarget}-question exam is prepared.`
      );

      if (!hasCustomSource) {
        setUsedQuizPrompts((prev) =>
          uniqueBy(
            [...prev, ...questions.map((item) => normalize(item.prompt))],
            (value) => value
          )
        );
        setRecentQuizPrompts((prev) =>
          [...prev, ...questions.map((item) => normalize(item.prompt))].slice(-RECENT_MEMORY_LIMIT)
        );
      }
    } catch (error) {
      const fallback = selectSessionItems(
        buildLocalQuizFallback(
          activeEntries,
          "",
          "All",
          "",
          Math.max(finalTarget, 60),
          []
        ),
        finalTarget,
        hasCustomSource ? [] : usedQuizPromptsRef.current,
        recentQuizPromptsRef.current,
        (item) => normalize(item.prompt)
      );

      setSimulationQuestions(fallback);
      setRemediationContext(null);
      setSimulationIdx(0);
      setSimulationSize(finalTarget);
      setSimulationResponseTimes({});
      setSimulationSubmitted(false);
      setSimulationLaunchOpen(false);
      setMode("simulation");
      setSimulationUsedAi(false);
      setSimulationAnswerSheetOpen(false);
      setApiError(normalizeAiErrorMessage(error) || `Gemini simulation generation failed. A local ${finalTarget}-question simulation was loaded instead.`);
      setStatusMessage(`Loaded a mixed ${finalTarget}-question simulation from the CareDrop bank.`);
    } finally {
      setApiLoading(false);
    }
  }

  async function generateSummaryFromText(notesInput, options = {}) {
    const {
      successMessage = "Gemini generated a reviewer summary from your notes.",
      offlineMessage = "Offline mode: CareDrop built a local reviewer summary from your notes.",
      fallbackErrorMessage = "Gemini summary failed. A local reviewer summary was generated instead.",
    } = options;
    const notes = String(notesInput || "").trim();

    if (!notes) {
      setApiError("Add notes or upload a file before asking Gemini for a summary.");
      return false;
    }

    clearMessages();

    if (!isOnline) {
      setSummaryText(buildLocalSummary(notes));
      setStatusMessage(offlineMessage);
      return true;
    }

    setApiLoading(true);

    try {
      const data = await postJson("/api/claude/summary", { notes });
      setSummaryText(data.summary || buildLocalSummary(notes));
      setStatusMessage(successMessage);
      return true;
    } catch (error) {
      setSummaryText(buildLocalSummary(notes));
      setApiError(error.message || fallbackErrorMessage);
      return false;
    } finally {
      setApiLoading(false);
    }
  }

  async function generateSummary() {
    const notes = studyText.trim();
    if (!notes) {
      setApiError("Add notes or upload a file before asking Gemini for a summary.");
      return;
    }

    await generateSummaryFromText(notes);
  }

  async function askClaude() {
    if (!question.trim() || !quizItem || currentCorrect || quizItem.userAnswer === null) {
      return;
    }

    clearMessages();
    if (!isOnline) {
      setApiError("AI review help needs an internet connection. You can still use the rationale and memory tip for this item.");
      setAiResponse("");
      return;
    }

    setApiLoading(true);
    setAiResponse("");

    try {
      const data = await postJson("/api/claude/review-help", {
        userPrompt: question,
        question: quizItem?.prompt,
        selectedAnswer: quizItem?.userAnswer,
        correctAnswer: quizItem?.correctAnswer,
        rationale: quizItem?.rationale,
        notes: quizItem?.notes,
        subject: quizItem?.subject || subject,
        topic: quizItem?.topic || topicFilter,
        difficulty: quizItem?.difficulty || difficulty,
      });

      setAiResponse(
        data.response ||
          "The AI did not return a full explanation, but the correct answer and rationale above are still the best review guide for this item."
      );
      setQuestion("");
    } catch (error) {
      setApiError(
        error.message || "AI assistant is unavailable right now. You can still review the flashcards."
      );
      setAiResponse("");
    } finally {
      setApiLoading(false);
    }
  }

  function recordReviewSession(session) {
    setReviewSessions((prev) => [session, ...prev.filter((item) => item.id !== session.id)].slice(0, 18));
  }

  function submitFlashcardSession() {
    if (!flashcards.length || flashcardCompletedCount < flashcards.length || flashcardSessionSubmitted) {
      return;
    }

    const session = {
      id: uid(),
      createdAt: new Date().toISOString(),
      mode: "flashcard",
      subject,
      difficulty,
      topic: topicFilter,
      sourceLabel: remediationContext
        ? `Remediation set${remediationContext.weakestSubject ? ` for ${remediationContext.weakestSubject}` : ""}`
        : hasCustomSource
          ? uploadedFileName || "Focused notes session"
          : "Generated from CareDrop subject bank",
      cards: flashcards,
      currentIndex: cardIdx,
      cardRatings: flashcardSessionRatings,
      responseTimes: flashcardResponseTimes,
      score: flashcards.length ? Math.round((flashcardStrongCount / flashcards.length) * 100) : 0,
      answeredCount: flashcardCompletedCount,
      correctCount: flashcardStrongCount,
      weakCount: flashcardNeedsReviewCount,
      isRemediation: Boolean(remediationContext),
    };

    recordReviewSession(session);
    setFlashcardSessionSubmitted(true);
    setFlashcardViewMode("result");
    setSessions((value) => value + 1);
    setStatusMessage("Flashcard session submitted and added to your review history.");
  }

  function submitQuizSession() {
    if (!quiz.length || answeredCount < quiz.length || quizSubmitted) {
      return;
    }

    const session = {
      id: uid(),
      createdAt: new Date().toISOString(),
      mode: remediationContext ? "remediation" : "quiz",
      subject,
      difficulty,
      topic: topicFilter,
      sourceLabel: remediationContext
        ? `Remediation set${remediationContext.weakestSubject ? ` for ${remediationContext.weakestSubject}` : ""}`
        : hasCustomSource
          ? uploadedFileName || "Focused notes session"
          : "Generated from CareDrop subject bank",
      questions: quiz,
      currentIndex: quizIdx,
      responseTimes: quizResponseTimes,
      score: quiz.length ? Math.round((correctCount / quiz.length) * 100) : 0,
      answeredCount,
      correctCount,
      submitted: true,
      isRemediation: Boolean(remediationContext),
      previousScore: remediationContext?.previousScore ?? null,
    };

    recordReviewSession(session);
    setQuizSubmitted(true);
    setQuizViewMode("result");
    setSessions((value) => value + 1);
    setStatusMessage("Quiz session submitted and added to your review history.");
  }

  function handleRate(key) {
    if (!currentCard) {
      return;
    }

    const elapsed = Math.max(Date.now() - flashcardShownAtRef.current, 0);

    setFlashcardSessionRatings((prev) => ({
      ...prev,
      [currentCard.id]: key,
    }));
    setFlashcardResponseTimes((prev) => ({
      ...prev,
      [currentCard.id]: prev[currentCard.id] ?? elapsed,
    }));
    setRatings((prev) => ({
      ...prev,
      [currentCard.id]: key,
    }));
    setCardSchedule((prev) =>
      updateCardSchedule(prev, {
        cardId: currentCard.id,
        rating: key,
        reviewedAt: new Date(),
      })
    );

    if (cardIdx < flashcards.length - 1) {
      setCardIdx((value) => value + 1);
      return;
    }
  }

  function handleQuizAnswer(option) {
    if (!quizItem || quizSubmitted) {
      return;
    }

    const elapsed = Math.max(Date.now() - quizShownAtRef.current, 0);

    setQuiz((prev) =>
      prev.map((item, index) =>
        index === quizIdx
          ? {
              ...item,
              userAnswer: option,
            }
          : item
      )
    );
    setQuizResponseTimes((prev) => ({
      ...prev,
      [quizItem.id || quizItem.prompt || String(quizIdx)]: prev[quizItem.id || quizItem.prompt || String(quizIdx)] ?? elapsed,
    }));
  }

  function handleSimulationAnswer(option) {
    if (!simulationItem || simulationSubmitted) {
      return;
    }

    const elapsed = Math.max(Date.now() - simulationShownAtRef.current, 0);
    const optionId = String(option);

    setSimulationQuestions((prev) =>
      prev.map((item, index) =>
        index === simulationIdx
          ? {
              ...item,
              userAnswer:
                getQuestionType(item) === QUESTION_TYPES.MULTIPLE_RESPONSE
                  ? (() => {
                      const selections = Array.isArray(item.userAnswer) ? [...item.userAnswer] : [];
                      return selections.includes(optionId)
                        ? selections.filter((value) => value !== optionId)
                        : [...selections, optionId];
                    })()
                  : optionId,
            }
          : item
      )
    );
    setSimulationResponseTimes((prev) => ({
      ...prev,
      [simulationItem.id || simulationItem.prompt || String(simulationIdx)]:
        prev[simulationItem.id || simulationItem.prompt || String(simulationIdx)] ?? elapsed,
    }));
  }

  function toggleSimulationFlag() {
    if (!simulationItem || simulationSubmitted) {
      return;
    }

    setSimulationQuestions((prev) =>
      prev.map((item, index) =>
        index === simulationIdx
          ? {
              ...item,
              flagged: !item.flagged,
            }
          : item
      )
    );
  }

  function saveCurrentQuiz() {
    if (!quiz.length) {
      return;
    }

    const score = quiz.length ? Math.round((correctCount / quiz.length) * 100) : 0;

    const session = {
      id: uid(),
      createdAt: new Date().toISOString(),
      mode: "quiz",
      subject,
      difficulty,
      topic: topicFilter,
      sourceLabel: hasCustomSource
        ? uploadedFileName || "Focused notes session"
        : "Generated from CareDrop subject bank",
      questions: quiz,
      currentIndex: quizIdx,
      responseTimes: quizResponseTimes,
      score,
      answeredCount,
      submitted: quizSubmitted,
      isRemediation: Boolean(remediationContext),
      saved: true,
    };

    setReviewSessions((prev) => [session, ...prev].slice(0, 18));
    setStatusMessage("Quiz session saved. You can reopen it from Review History.");
  }

  function openSavedQuiz(session) {
    setRemediationContext(null);

    if (session.mode === "flashcard") {
      setFlashcards(session.cards || []);
      setCardIdx(clamp(session.currentIndex || 0, 0, Math.max((session.cards || []).length - 1, 0)));
      setFlashcardSessionRatings(session.cardRatings || {});
      setFlashcardResponseTimes(session.responseTimes || {});
      setFlashcardSessionSubmitted(true);
      setFlashcardViewMode("result");
      setMode("flashcard");
      setStatusMessage(`Loaded review session: ${buildSessionLabel(session)}.`);
      return;
    }

    if (session.mode === "simulation") {
      setSimulationQuestions(session.questions || []);
      setSimulationIdx(clamp(session.currentIndex || 0, 0, Math.max((session.questions || []).length - 1, 0)));
      setSimulationResponseTimes(session.responseTimes || {});
      setSimulationSubmitted(true);
      setSimulationSize(SIMULATION_SIZE_OPTIONS.includes(Number(session.simulationSize)) ? Number(session.simulationSize) : 50);
      setSimulationUsedAi(Boolean(session.usedAi));
      setSimulationAnswerSheetOpen(false);
      setSimulationLaunchOpen(false);
      setMode("simulation");
      setStatusMessage(`Loaded saved session: ${buildSessionLabel(session)}.`);
      return;
    }

    setQuiz(session.questions || []);
    setQuizIdx(clamp(session.currentIndex || 0, 0, Math.max((session.questions || []).length - 1, 0)));
    setQuizResponseTimes(session.responseTimes || {});
    setQuizSubmitted(Boolean(session.submitted));
    setQuizViewMode(session.submitted ? "result" : "study");
    setQuizAnswerSheetOpen(false);
    setMode("quiz");
    setStatusMessage(`Loaded saved session: ${buildSessionLabel(session)}.`);
  }

  function submitSimulationExam() {
    if (!simulationQuestions.length || simulationAnsweredCount < simulationQuestions.length || simulationSubmitted) {
      return;
    }

    const session = {
      id: uid(),
      createdAt: new Date().toISOString(),
      mode: "simulation",
      subject: "Mixed Review",
      difficulty: "mixed",
      topic: "",
      sourceLabel: simulationUsedAi
        ? "Simulation built from the CareDrop bank with Gemini support"
        : "Simulation built from the CareDrop review bank",
      questions: simulationQuestions,
      currentIndex: simulationIdx,
      responseTimes: simulationResponseTimes,
      score: simulationQuestions.length ? Math.round((simulationCorrectCount / simulationQuestions.length) * 100) : 0,
      answeredCount: simulationAnsweredCount,
      correctCount: simulationCorrectCount,
      simulationSize,
      usedAi: simulationUsedAi,
    };

    recordReviewSession(session);
    setSimulationSubmitted(true);
    setSimulationAnswerSheetOpen(false);
    setStatusMessage("Simulation submitted. Your full result is now saved in Review History.");
  }

  function deleteSavedQuiz(sessionId) {
    setReviewSessions((prev) => prev.filter((session) => session.id !== sessionId));
  }

  function startRemediationMode(sourceSession = null) {
    clearMessages();

    const baseSession =
      sourceSession ||
      reviewSessions.find((session) =>
        ["simulation", "quiz"].includes(session.mode) &&
        Number(session.correctCount || 0) < Number(session.answeredCount || 0)
      ) ||
      mostRecentSession;

    const incorrectItems = baseSession?.questions
      ? baseSession.questions
          .filter((item) => scoreQuestion(item) === 0)
          .map((item) => ({
            subject: item.subject || baseSession.subject || "",
            topic: item.topic || baseSession.topic || "",
            prompt: item.prompt || "",
          }))
      : incorrectReviewItems;

    const fallbackIncorrectItems = incorrectItems.length
      ? incorrectItems
      : [
          {
            subject:
              (baseSession?.subject && baseSession.subject !== "Mixed Review" ? baseSession.subject : "") ||
              weakestSubject ||
              subject ||
              "",
            topic: topicFilter || "",
            prompt: topicFilter || weakestSubject || subject || "recent weak areas",
          },
        ];

    const remediationEntries = buildRemediationEntries(activeEntries, fallbackIncorrectItems, weakestSubject);
    const targetedSubject =
      (baseSession?.subject && baseSession.subject !== "Mixed Review" ? baseSession.subject : "") ||
      weakestSubject ||
      "";
    const targetedTopic =
      fallbackIncorrectItems.find((item) => item.topic)?.topic ||
      topicFilter ||
      "";

    const primaryPool = buildLocalQuizFallback(
      remediationEntries,
      targetedSubject,
      "All",
      targetedTopic,
      QUIZ_SET_SIZE * 2,
      []
    );
    const fallbackPool =
      primaryPool.length >= QUIZ_SET_SIZE
        ? []
        : buildLocalQuizFallback(
            activeEntries,
            targetedSubject,
            "All",
            targetedTopic,
            QUIZ_SET_SIZE * 2,
            []
          );

    const questions = selectSessionItems(
      [...primaryPool, ...fallbackPool],
      QUIZ_SET_SIZE,
      [],
      [],
      (item) => normalize(item.prompt)
    );

    if (!questions.length) {
      setApiError("CareDrop could not build a remediation set from the current weak areas yet. Try answering one more quiz or flashcard set first so there is more recovery data to work with.");
      return;
    }

    setQuiz(
      questions.map((item) => ({
        ...item,
        notes: `${item.notes} Remediation focus: revisit why the safest answer wins for this topic.`,
      }))
    );
    setQuizIdx(0);
    setQuizResponseTimes({});
    setQuizSubmitted(false);
    setQuizViewMode("study");
    setViewMode("study");
    setQuizAnswerSheetOpen(false);
    setMode("quiz");
    setRemediationContext({
      sourceSessionId: baseSession?.id || "",
      weakestSubject: targetedSubject || remediationEntries[0]?.subject || "",
      topic: targetedTopic,
      previousScore: Number(baseSession?.score || 0),
      createdAt: new Date().toISOString(),
    });
    setStatusMessage(
      targetedSubject
        ? `Remediation mode is ready. This quiz focuses on the areas you missed most in ${targetedSubject}.`
        : "Remediation mode is ready. This quiz focuses on the questions and topics you missed most recently."
    );
  }

  function resetRotation() {
    setUsedFlashcardIds([]);
    setUsedFlashcardQuestions([]);
    setUsedQuizPrompts([]);
    setRecentFlashcardIds([]);
    setRecentQuizPrompts([]);
    setStatusMessage("Flashcard and quiz rotation history was cleared.");
    loadLocalFlashcardSet("Fresh local flashcards loaded after reset.");
  }

  function resetStudyProgressToZero() {
    if (!currentUser?.id) {
      return;
    }

    clearMessages();

    setSubject("");
    setDifficulty("All");
    setTopicFilter("");
    setTopicInput("");
    setMode("dashboard");
    setFlashcards([]);
    setCardIdx(0);
    setCardSchedule({});
    setFlashcardSessionRatings({});
    setFlashcardResponseTimes({});
    setFlashcardSessionSubmitted(false);
    setFlashcardViewMode("setup");
    setQuiz([]);
    setQuizIdx(0);
    setQuizResponseTimes({});
    setQuizSubmitted(false);
    setQuizViewMode("setup");
    setQuizAnswerSheetOpen(false);
    setSimulationQuestions([]);
    setSimulationIdx(0);
    setSimulationResponseTimes({});
    setSimulationSubmitted(false);
    setSimulationSize(50);
    setSimulationUsedAi(false);
    setSimulationAnswerSheetOpen(false);
    setSimulationLaunchOpen(true);
    setRatings({});
    setSessions(0);
    setReviewSessions([]);
    setUsedFlashcardIds([]);
    setUsedFlashcardQuestions([]);
    setUsedQuizPrompts([]);
    setRecentFlashcardIds([]);
    setRecentQuizPrompts([]);
    setRemediationContext(null);
    setFilterWeakOnly(false);

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(getProgressStorageKey(currentUser.id));
    }

    setCloudSyncStatus(
      currentUser.provider === "supabase"
        ? "Cloud reset queued for this account."
        : "Local study progress reset for this account."
    );
    setStatusMessage("Study progress was reset to zero for this account.");
  }

  function removeUploadedSource() {
    setUploadedFileName("");
    setUploadedText("");
    setUploadState("idle");
    setUploadError("");
    setSummaryText(noteText.trim() ? buildLocalSummary(noteText) : "Paste notes or upload a document to generate a reviewer summary.");
    setStatusMessage("Attached file was removed. You can upload a new one anytime.");
  }

  async function handleIncomingFile(file) {
    if (!file) {
      return;
    }

    const extension = `.${file.name.split(".").pop()?.toLowerCase() || ""}`;
    if (!SUPPORTED_UPLOAD_EXTENSIONS.includes(extension)) {
      setUploadState("failed");
      setUploadError("Unsupported file type. Upload DOC, DOCX, PDF, JPG, JPEG, PNG, WEBP, or TXT.");
      return;
    }

    clearMessages();

    if (!isOnline && extension !== ".txt") {
      setUploadState("failed");
      setUploadError("You are offline right now. DOC, PDF, and image extraction need a connection. TXT files can still be loaded locally.");
      return;
    }

    setUploadState("uploading");

    try {
      const data = await uploadFileForExtraction(file);
      const extractedText = data.text || "";
      setUploadedFileName(data.fileName || file.name);
      setUploadedText(extractedText);
      setUploadState("success");
      await generateSummaryFromText(extractedText, {
        successMessage: `${file.name} uploaded, extracted, and summarized successfully.`,
        offlineMessage: `${file.name} uploaded successfully. CareDrop built a local reviewer summary while offline.`,
        fallbackErrorMessage: "The file was uploaded and a local reviewer summary was generated because Gemini summary was unavailable.",
      });
    } catch (error) {
      if (extension === ".txt") {
        try {
          const localText = await readTextFileLocally(file);
          setUploadedFileName(file.name);
          setUploadedText(localText);
          setUploadState("success");
          await generateSummaryFromText(localText, {
            successMessage: `${file.name} loaded locally and summarized successfully.`,
            offlineMessage: `${file.name} loaded locally and CareDrop prepared a reviewer summary.`,
            fallbackErrorMessage: "The file was loaded locally and a reviewer summary was still prepared.",
          });
          setUploadError("");
          return;
        } catch (localError) {
          setUploadState("failed");
          setUploadError(localError.message || error.message || "Upload failed.");
          return;
        }
      }

      setUploadState("failed");
      setUploadError(error.message || "Upload failed.");
    }
  }

  function handleFileUpload(event) {
    handleIncomingFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragActive(false);
    handleIncomingFile(event.dataTransfer?.files?.[0]);
  }

  function handleDragOver(event) {
    event.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    setDragActive(false);
  }

  async function submitRequest() {
    if (!requestMessage.trim()) {
      return;
    }

    const fallbackEntry = {
      id: uid(),
      type: requestType,
      submittedBy: requestName.trim() || currentUser?.name || currentUser?.email || "Anonymous",
      message: requestMessage.trim(),
      createdAt: new Date().toISOString(),
      state: "local",
      url: "",
    };

    setRequestLoading(true);
    setRequestStatus("");

    try {
      const data = await postJson("/api/feedback", {
        type: requestType,
        name: requestName.trim() || currentUser?.name || currentUser?.email || "",
        message: requestMessage.trim(),
        appContext: `Submitted from CareDrop | subject=${subject || "none-selected"} | difficulty=${difficulty} | topic=${topicFilter || "none"}`,
      });

      setRequestHistory((prev) => [data.request, ...prev].slice(0, 20));
      setRequestConfigured(true);
      setRequestStatus(
        data.request?.url
          ? `Request submitted to the central inbox. Issue #${data.request.number} was created.`
          : "Request submitted to the central inbox."
      );
    } catch (error) {
      setRequestHistory((prev) => [fallbackEntry, ...prev].slice(0, 20));
      setRequestConfigured(false);
      setRequestStatus(
        `${error.message || "Central request inbox is not configured yet."} The request was saved locally on this device for now.`
      );
    } finally {
      setRequestLoading(false);
      clearRequestDraft();
      setRequestModalOpen(false);
    }
  }

  async function submitReviewFocus() {
    clearMessages();

    const nextTopic = getActiveTopicFocus(topicInput);
    const activeStudyMode =
      mode === "flashcard" || mode === "quiz" ? mode : focusAction;

    if (!ensureReviewTargetSelected(`open ${activeStudyMode === "quiz" ? "a quiz" : "flashcards"}`, nextTopic)) {
      return;
    }

    setTopicFilter(nextTopic);
    setViewMode("study");
    if (activeStudyMode === "flashcard") {
      setFlashcardViewMode("study");
    }
    if (activeStudyMode === "quiz") {
      setQuizViewMode("study");
    }
    setMobileDrawerOpen(false);

    if (activeStudyMode === "quiz") {
      await generateQuiz(nextTopic);
      return;
    }

    if (nextTopic || hasCustomSource) {
      await generateClaudeFlashcards(nextTopic);
      return;
    }

    loadLocalFlashcardSet("Your next flashcard set is prepared.", nextTopic);
  }

  const selectStyle = {
    padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${C.border}`,
    background: C.surfaceMuted,
    fontSize: 13,
    color: C.text,
    outline: "none",
    cursor: "pointer",
    width: "100%",
    boxSizing: "border-box",
  };

  const panelStyle = {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 22,
    padding: width < 640 ? 18 : 24,
    boxShadow: C.shellShadow,
    contentVisibility: "auto",
    containIntrinsicSize: "520px",
  };

  const dashboardGreeting = getGreeting(currentUser?.name);
  const dashboardDateLabel = new Date().toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const isMobile = width < 640;
  const isNarrowTablet = width < 820;
  const usesDrawerNav = width < 960;
  const showFlashcardSetup = mode === "flashcard" && flashcardViewMode === "setup";
  const showQuizSetup = mode === "quiz" && quizViewMode === "setup";
  const isStudyMode = mode === "flashcard" || mode === "quiz" || mode === "simulation";
  const studySectionPadding = isMobile ? 16 : 22;
  const studyMetaSize = 12;
  const studyQuestionSize = isMobile ? 18 : 20;
  const studyBodySize = isMobile ? 14 : 15;
  const studyActionPadding = isMobile ? "10px 14px" : "10px 16px";
  const headerHeight = usesDrawerNav ? (isMobile ? 72 : 68) : isMobile ? 88 : 68;
  const cardSurface = C.surface;
  const elevatedSurface = C.surfaceRaised;
  const heroSurface = darkMode
    ? `linear-gradient(180deg, ${C.bgElevated} 0%, ${C.surface} 100%)`
    : "linear-gradient(180deg, #FFFFFF 0%, #F6FBF8 100%)";
  const accentPanelSurface = darkMode
    ? "linear-gradient(180deg, #0d4e38 0%, #0f172a 100%)"
    : "linear-gradient(180deg, #0C6C42 0%, #0B5936 100%)";
  const infoPanelSurface = darkMode ? C.blueLight : "#EEF4FB";
  const infoPanelBorder = darkMode ? C.border : "#C7D6E5";
  const primaryNavItems = [
    {
      key: "dashboard",
      active: mode === "dashboard",
      label: "Dashboard",
      hint: "Overview and next steps",
      onClick: () => navigateToMode("dashboard"),
    },
    {
      key: "flashcard",
      active: mode === "flashcard",
      label: "Flashcards",
      hint: "Focused card review",
      badge: flashcards.length || "",
      onClick: () => navigateToMode("flashcard"),
    },
    {
      key: "quiz",
      active: mode === "quiz",
      label: "Quiz",
      hint: "Board-style drills",
      badge: quiz.length || "",
      onClick: () => navigateToMode("quiz"),
    },
    {
      key: "simulation",
      active: mode === "simulation",
      label: "Simulation Exam",
      hint: "Mixed 50-500 item exam mode",
      badge: simulationQuestions.length || "",
      onClick: openSimulationLauncher,
    },
    {
      key: "planner",
      active: mode === "planner",
      label: "Planner",
      hint: "Goals, due dates, and next study targets",
      badge: plannerOpenItems.length || "",
      onClick: () => navigateToMode("planner"),
    },
    {
      key: "notes",
      active: mode === "notes",
      label: "Notes & Upload",
      hint: "Files, summaries, and AI",
      onClick: () => navigateToMode("notes"),
    },
  ];

  if (isAdminUser) {
    primaryNavItems.push({
      key: "admin",
      active: mode === "admin",
      label: "Admin",
      hint: "Feedback, trends, and product signals",
      badge: requestHistory.length || "",
      onClick: () => navigateToMode("admin"),
    });
  }

  const renderModuleSetupControls = (lockedMode) => {
    const label = lockedMode === "quiz" ? "Quiz" : "Flashcards";
    const gridColumns = width < 900 ? "1fr" : "160px minmax(180px, 220px) minmax(240px, 1fr) max-content";
    const fieldLabelStyle = {
      display: "block",
      fontSize: 11,
      color: C.muted,
      fontWeight: 800,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      marginBottom: 7,
    };

    return (
      <div
        style={{
          border: `1px solid ${C.border}`,
          borderRadius: 20,
          padding: isMobile ? "16px" : "18px",
          background: darkMode ? elevatedSurface : "#FBFAF7",
          animation: "caredropFadeSlide 0.22s ease",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 900, color: C.text, marginBottom: 14 }}>
          Choose your {label.toLowerCase()} focus
        </div>
        <div style={{ display: "grid", gridTemplateColumns: gridColumns, gap: 12, alignItems: "end" }}>
          <label>
            <span style={fieldLabelStyle}>Difficulty</span>
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} style={selectStyle}>
              {DIFFICULTIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span style={fieldLabelStyle}>Subject</span>
            <select value={subject} onChange={(event) => setSubject(event.target.value)} style={selectStyle}>
              <option value="">Select a subject</option>
              {SUBJECT_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span style={fieldLabelStyle}>Topic Focus</span>
            <input
              value={topicInput}
              onChange={(event) => setTopicInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  submitReviewFocus();
                }
              }}
              placeholder="cardiac drugs, dengue, delegation..."
              style={{ ...selectStyle, cursor: "text" }}
            />
          </label>
          <button
            type="button"
            onClick={submitReviewFocus}
            disabled={apiLoading}
            style={{
              minHeight: 48,
              padding: "12px 18px",
              borderRadius: 13,
              border: "none",
              background: apiLoading ? C.border : C.accent,
              color: apiLoading ? C.muted : "#fff",
              fontWeight: 900,
              whiteSpace: "nowrap",
              cursor: apiLoading ? "not-allowed" : "pointer",
            }}
          >
            {apiLoading ? "Preparing..." : `Generate ${label}`}
          </button>
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    let ticking = false;
    const threshold = 18;

    function onScroll() {
      if (ticking) {
        return;
      }

      ticking = true;
      window.requestAnimationFrame(() => {
        const currentY = window.scrollY || 0;
        const delta = currentY - lastScrollYRef.current;

        if (currentY <= 32) {
          setHeaderVisible(true);
        } else if (Math.abs(delta) >= threshold) {
          setHeaderVisible(delta < 0);
        }

        lastScrollYRef.current = currentY;
        ticking = false;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [usesDrawerNav]);

  useEffect(() => {
    if (!usesDrawerNav) {
      return undefined;
    }

    if (!mobileDrawerOpen) {
      document.body.style.overflow = "";
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileDrawerOpen, usesDrawerNav]);

  useEffect(() => {
    if (!currentUser || !usesDrawerNav) {
      return;
    }

    setMode("dashboard");
    setMobileDrawerOpen(false);
  }, [currentUser?.id, usesDrawerNav]);

  useEffect(() => {
    if (mode === "history") {
      setMode("dashboard");
    }
  }, [mode]);

  useEffect(() => {
    if (flashcardSessionSubmitted) {
      setFlashcardViewMode("result");
    }
  }, [flashcardSessionSubmitted]);

  useEffect(() => {
    if (quizSubmitted) {
      setQuizViewMode("result");
    }
  }, [quizSubmitted]);

  if (!authReady) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: C.bg,
          fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
          color: C.text,
        }}
      >
        Restoring your study space...
      </div>
    );
  }

  if (!currentUser) {
    return (
      <>
        <AuthScreen
          width={width}
          authMode={authMode}
          setAuthMode={setAuthMode}
          authName={authName}
          setAuthName={setAuthName}
          authEmail={authEmail}
          setAuthEmail={setAuthEmail}
          authPassword={authPassword}
          setAuthPassword={setAuthPassword}
          authConfirmPassword={authConfirmPassword}
          setAuthConfirmPassword={setAuthConfirmPassword}
          termsAccepted={termsAccepted}
          setTermsAccepted={setTermsAccepted}
          onOpenTerms={() => setTermsModalOpen(true)}
          cloudSyncReady={cloudSyncReady}
          authNotice={authNotice}
          onDismissNotice={() => setAuthNotice(null)}
          authError={authError}
          authLoading={authLoading}
          forgotPasswordLoading={forgotPasswordLoading}
          onSubmit={handleAuthSubmit}
          onForgotPassword={handleForgotPassword}
          themeMode={themeMode}
          onToggleTheme={toggleThemeMode}
        />
        <TermsModal open={termsModalOpen} onClose={() => setTermsModalOpen(false)} />
      </>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.appGradient,
        fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
        color: C.text,
      }}
    >
      <nav
        style={{
          background: C.navGradient,
          borderBottom: C.navPillBorder,
          padding: isMobile ? "12px 14px" : "12px 22px",
          minHeight: isMobile ? 84 : 66,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexDirection: usesDrawerNav ? "row" : isMobile ? "column" : "row",
          gap: usesDrawerNav ? 12 : isMobile ? 10 : 0,
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          transform: headerVisible ? "translateY(0)" : "translateY(-100%)",
          transition: "transform 0.28s ease",
          boxShadow: headerVisible ? C.shellShadow : "none",
          backdropFilter: "blur(14px)",
        }}
      >
        {usesDrawerNav ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen((open) => !open)}
                aria-label={mobileDrawerOpen ? "Close navigation menu" : "Open navigation menu"}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  border: C.navPillBorder,
                  background: C.navActionBg,
                  color: C.navText,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                {mobileDrawerOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.12)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: C.navText,
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.1)",
                    flexShrink: 0,
                  }}
                >
                  <img src={LOGO_SRC} alt="CareDrop logo" style={{ width: "100%", height: "100%", display: "block" }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 17, color: C.navText, whiteSpace: "nowrap" }}>
                    Care<span style={{ color: "#8FF2B6" }}>Drop</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.navSubtle, whiteSpace: "nowrap" }}>
                    {isStudyMode ? "Focused review" : "Review dashboard"}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {!isMobile ? (
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: 999,
                    background: C.navPillBg,
                    border: C.navPillBorder,
                    fontSize: 12,
                    fontWeight: 700,
                    color: C.navText,
                    maxWidth: 150,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {currentUser.name}
                </div>
              ) : null}
              <ThemeToggle mode={themeMode} onToggle={toggleThemeMode} />
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: C.navText,
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <img
                  src={LOGO_SRC}
                  alt="CareDrop logo"
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "block",
                  }}
                />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18, color: C.navText }}>
                  Care<span style={{ color: "#8FF2B6" }}>Drop</span>
                </div>
                <div style={{ fontSize: 11, color: C.navSubtle }}>
                  Review command center
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: isMobile ? "flex-start" : "flex-end", width: isMobile ? "100%" : "auto" }}>
              <div
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  background: C.navPillBg,
                  border: C.navPillBorder,
                  fontSize: 12,
                  fontWeight: 700,
                  color: C.navPillText,
                }}
              >
                {isOnline ? "Connected" : "Offline review"}
              </div>
              <div
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  background: C.navPillBg,
                  border: C.navPillBorder,
                  fontSize: 12,
                  fontWeight: 700,
                  color: C.navPillText,
                }}
              >
                {dashboardDateLabel}
              </div>
              <div
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  background: C.navPillBg,
                  border: C.navPillBorder,
                  fontSize: 12,
                  fontWeight: 700,
                  color: C.navText,
                }}
              >
                {currentUser.name}
              </div>
              <ThemeToggle mode={themeMode} onToggle={toggleThemeMode} />
              <button
                type="button"
                onClick={handleSignOut}
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  border: C.navPillBorder,
                  background: C.navActionBg,
                  color: C.navText,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Sign Out
              </button>
            </div>
          </>
        )}
      </nav>

      {usesDrawerNav ? (
        <>
          <div
            role="presentation"
            onClick={() => setMobileDrawerOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: darkMode ? "rgba(2, 6, 23, 0.62)" : "rgba(5, 10, 8, 0.28)",
              opacity: mobileDrawerOpen ? 1 : 0,
              pointerEvents: mobileDrawerOpen ? "auto" : "none",
              transition: "opacity 0.24s ease",
              zIndex: 18,
            }}
          />
          <aside
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              bottom: 0,
              width: "min(248px, 62vw)",
              background: accentPanelSurface,
              borderRight: "1px solid rgba(8,59,40,0.5)",
              boxShadow: darkMode ? "0 18px 34px rgba(2, 6, 23, 0.35)" : "0 18px 34px rgba(7, 38, 24, 0.2)",
              padding: `${headerHeight + 12}px 16px 20px`,
              transform: mobileDrawerOpen ? "translateX(0)" : "translateX(-104%)",
              transition: "transform 0.26s ease",
              zIndex: 19,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(216,237,227,0.56)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Navigation
                </div>
                <div style={{ marginTop: 4, fontSize: 13, color: "rgba(231,244,237,0.78)", lineHeight: 1.6 }}>
                  Move through CareDrop with one hand.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="Close navigation menu"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#F8FFF9",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              {primaryNavItems.map((item) => (
                <SidebarNavButton
                  key={item.key}
                  active={item.active}
                  label={item.label}
                  hint={item.hint}
                  badge={item.badge}
                  onClick={item.onClick}
                />
              ))}
            </div>

            <div style={{ marginTop: "auto", display: "grid", gap: 10, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: darkMode ? "rgba(15, 23, 42, 0.26)" : "rgba(255,255,255,0.05)",
                  border: darkMode ? `1px solid ${C.border}` : "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(232,244,238,0.88)",
                  fontSize: 12,
                  lineHeight: 1.6,
                }}
              >
                Signed in as <strong style={{ color: C.text }}>{currentUser.name}</strong>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                style={{
                  padding: "11px 14px",
                  borderRadius: 12,
                  border: darkMode ? `1px solid ${C.border}` : "1px solid rgba(255,255,255,0.14)",
                  background: darkMode ? "rgba(15, 23, 42, 0.22)" : "rgba(255,255,255,0.04)",
                  color: "#F0F8F3",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Sign Out
              </button>
            </div>
          </aside>
        </>
      ) : null}

      <div
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          padding: isMobile ? `${headerHeight + 12}px 12px 28px` : `${headerHeight + 18}px 22px 38px`,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {apiError ? (
          <div
            style={{
              ...panelStyle,
              padding: 16,
              borderColor: C.red,
              background: C.redLight,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, color: C.red }}>
              Action Needed
            </div>
            <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.7, color: C.text }}>
              {apiError}
            </div>
            {apiError && apiError.includes("Render") ? (
              <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>
                Your frontend can load on Vercel, but the Express API needs Render or another Node host unless you convert it to serverless functions.
              </div>
            ) : null}
          </div>
        ) : null}

        {!isOnline ? (
          <div
            style={{
              ...panelStyle,
              padding: 16,
              borderColor: infoPanelBorder,
              background: infoPanelSurface,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, color: darkMode ? C.blue : "#17355E" }}>
              Offline Review Mode
            </div>
            <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.7, color: C.text }}>
              CareDrop can still load local flashcards, quizzes, saved sessions, and your review history while offline. AI generation, upload extraction, and cloud sync will resume automatically when your connection returns.
            </div>
          </div>
        ) : null}

        <style>
          {`
            html {
              scroll-behavior: smooth;
            }

            body {
              background: ${C.bg};
              color: ${C.text};
            }

            * {
              scrollbar-color: ${C.borderStrong} ${C.surface};
            }

            *::-webkit-scrollbar {
              width: 10px;
              height: 10px;
            }

            *::-webkit-scrollbar-thumb {
              background: ${C.borderStrong};
              border-radius: 999px;
            }

            *::-webkit-scrollbar-track {
              background: ${C.surface};
            }

            @keyframes caredropFadeSlide {
              from {
                opacity: 0;
                transform: translateY(10px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
          `}
        </style>

        {mode === "dashboard" ? (
          <div
            style={{
              ...panelStyle,
              padding: width < 900 ? 20 : 24,
              background: heroSurface,
              color: C.text,
              overflow: "hidden",
              position: "relative",
              border: `1px solid ${C.border}`,
              boxShadow: darkMode ? "none" : "0 18px 34px rgba(15, 23, 42, 0.05)",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: "-80px -40px auto auto",
                width: 260,
                height: 260,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(30,169,104,0.12) 0%, rgba(30,169,104,0) 70%)",
              }}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: width < 980 ? "1fr" : "minmax(0, 1.2fr) minmax(280px, 360px)",
                gap: 20,
                marginBottom: 20,
                position: "relative",
                zIndex: 1,
              }}
            >
              <div style={{ maxWidth: 560 }}>
                <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: darkMode ? C.accentMid : "#5D8D77", fontWeight: 800 }}>
                  {dashboardGreeting}
                </div>
                <div style={{ marginTop: 10, fontSize: width < 880 ? 34 : 42, lineHeight: 1.08, fontWeight: 900, letterSpacing: "-0.06em", color: C.text }}>
                  Dashboard Overview
                </div>
                <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.8, color: darkMode ? C.muted : "#61736B" }}>
                  Keep your review flow organized across flashcards, quizzes, simulations, uploads, planning, and saved sessions without losing your place.
                </div>
                <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ padding: "10px 14px", borderRadius: 999, background: darkMode ? C.accentLight : "#F0F8F3", border: `1px solid ${darkMode ? C.border : "#D7EBDD"}`, fontSize: 12, color: darkMode ? C.accentMid : "#235B42", fontWeight: 700 }}>
                    {studyStreak ? `${studyStreak}-day study streak` : "Start a streak with one session today"}
                  </div>
                  <div style={{ padding: "10px 14px", borderRadius: 999, background: darkMode ? C.blueLight : "#F7FAFD", border: `1px solid ${darkMode ? C.border : "#DCE8F1"}`, fontSize: 12, color: darkMode ? C.blue : "#355E8A", fontWeight: 700 }}>
                    {mostRecentSession ? `Last studied ${mostRecentSession.subject}` : "Your first session will start the tracker"}
                  </div>
                </div>
              </div>
              <div
                style={{
                  borderRadius: 24,
                  padding: "18px 18px 16px",
                  background: "linear-gradient(180deg, #0D5A3B 0%, #0E6B47 100%)",
                  border: darkMode ? `1px solid ${C.border}` : "1px solid rgba(14, 107, 71, 0.12)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  minHeight: 170,
                  boxShadow: darkMode ? "none" : "0 16px 30px rgba(14, 107, 71, 0.18)",
                }}
              >
                <div>
                  <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(227,244,236,0.68)", fontWeight: 800 }}>
                    Encouragement
                  </div>
                  <div style={{ marginTop: 14, fontSize: 22, lineHeight: 1.45, fontWeight: 700, color: "#FFFFFF" }}>
                    {gentlePush}
                  </div>
                </div>
                <div style={{ marginTop: 18, fontSize: 13, lineHeight: 1.7, color: "rgba(236,248,241,0.82)" }}>
                  {isFirstVisit
                    ? "Start one short set today and CareDrop will begin building your study trail."
                    : recommendedAction.body}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: width < 1180 ? "1fr" : "220px minmax(0, 1fr)",
                gap: 18,
                alignItems: "stretch",
                position: "relative",
                zIndex: 1,
              }}
            >
              <div
                style={{
                  borderRadius: 22,
                  border: `1px solid ${darkMode ? C.border : "#DCE8E1"}`,
                  background: cardSurface,
                  padding: 18,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ProgressRing
                  value={clamp(Math.round(((Object.keys(ratings).length + reviewSessions.reduce((total, session) => total + Number(session.answeredCount || 0), 0)) / Math.max(totalCards * 0.55, 1)) * 100), 0, 100)}
                  label="overall completion"
                  caption={isFirstVisit ? "Ready when you are." : "Your next set is prepared."}
                  size={isMobile ? 156 : 190}
                />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : width < 780 ? "1fr 1fr" : "repeat(4, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                <HeroMetric label="Readiness Score" value={`${readinessScore}%`} helper={weakCardIds.length ? `${weakCardIds.length} weak cards worth revisiting` : isFirstVisit ? "Complete one short session to begin scoring" : "Building confidence steadily"} accent="#F8D56C" />
                <HeroMetric label="Study Streak" value={studyStreak || 0} helper={studyStreak ? "Keep the rhythm going today" : "One session starts the streak"} accent="#8BE5AF" />
                <HeroMetric label="Average Quiz Score" value={`${quizAverage}%`} helper={quizSessionCount ? `${quizSessionCount} quiz sessions tracked` : "Your quiz trend will appear here"} accent="#6BC0FF" />
                <HeroMetric label="Answered Overall" value={overallAnsweredCount} helper={mostRecentSession ? `Last reviewed ${mostRecentSession.subject}` : "Answer one set to start tracking"} accent="#D8B4FE" />
              </div>
            </div>
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: usesDrawerNav ? "1fr" : "minmax(280px, 300px) minmax(0, 1fr)",
            gap: 20,
          }}
        >
          {!usesDrawerNav ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ ...panelStyle, padding: 18, background: accentPanelSurface, border: darkMode ? `1px solid ${C.border}` : "1px solid rgba(8,59,40,0.22)", boxShadow: darkMode ? "none" : "0 18px 30px rgba(7, 38, 24, 0.15)", position: "sticky", top: headerVisible ? (isMobile ? headerHeight + 12 : headerHeight + 18) : 18, transition: "top 0.28s ease" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(216,237,227,0.56)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Study Command Center
              </div>
              <div style={{ marginTop: 6, fontSize: 13, color: "rgba(231,244,237,0.78)", lineHeight: 1.65 }}>
                Choose your workspace and jump straight into the right review block without hunting around the page.
              </div>

              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(216,237,227,0.56)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
                  Workspace
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {primaryNavItems.map((item) => (
                    <SidebarNavButton
                      key={item.key}
                      active={item.active}
                      label={item.label}
                      hint={item.hint}
                      badge={item.badge}
                      onClick={item.onClick}
                    />
                  ))}
                </div>
              </div>

              {adminModeActive ? (
                <>
                  <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(216,237,227,0.56)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
                      Admin Sections
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {[
                        ["overview", "Overview"],
                        ["feedback", "Feedback"],
                        ["planning", "Planning"],
                        ["activity", "Activity"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => queueAdminViewChange(value)}
                          style={{
                            padding: "11px 12px",
                            borderRadius: 12,
                            border: adminView === value ? `1px solid ${C.accentMid}` : `1px solid ${C.border}`,
                            background: adminView === value ? C.accentLight : C.surface,
                            color: adminView === value ? C.accent : C.text,
                            fontWeight: 700,
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px solid ${C.border}`, display: "grid", gap: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(216,237,227,0.56)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      Admin Status
                    </div>
                    <div
                      style={{
                        padding: "12px 14px",
                        borderRadius: 12,
                        background: darkMode ? softSurface : "#F8F5EE",
                        border: `1px solid ${C.border}`,
                        fontSize: 13,
                        lineHeight: 1.7,
                        color: C.text,
                      }}
                    >
                      <strong>Admin mode active</strong>
                      {" · "}
                      Learner study filters are hidden here so the admin area feels separate from active review.
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px solid ${C.border}`, display: "grid", gap: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(216,237,227,0.56)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      System Status
                    </div>
                    <div
                      style={{
                        padding: "12px 14px",
                        borderRadius: 12,
                        background: syncStatusTone.bg,
                        border: `1px solid ${syncStatusTone.border}`,
                        fontSize: 13,
                        lineHeight: 1.7,
                        color: C.text,
                      }}
                    >
                      <strong>{isOnline ? "Online" : "Offline"}</strong>
                      {" · "}
                      <strong>{syncStatusTone.label}</strong>
                      {" · "}
                      {cloudSyncStatus || (cloudSyncReady ? "Cloud sync standing by." : "Cloud sync not connected yet.")}
                    </div>
                    {remediationContext ? (
                      <div
                        style={{
                          padding: "12px 14px",
                          borderRadius: 12,
                          background: C.surface,
                          border: `1px solid ${C.border}`,
                          fontSize: 12,
                          lineHeight: 1.7,
                          color: C.muted,
                        }}
                      >
                        Latest remediation focus: <strong style={{ color: C.text }}>{remediationContext.weakestSubject || remediationContext.topic || "mixed weak areas"}</strong>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>
          ) : null}

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {mode === "dashboard" ? (
              <ErrorBoundary label="Dashboard overview" onReset={() => queueModeChange("dashboard")}>
              <AnalyticsCard
                title=""
              >
                <div style={{ display: "grid", gap: 16 }}>
                  <div style={{ display: "grid", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: isMobile ? 22 : 24, fontWeight: 900, letterSpacing: "-0.05em", color: C.text }}>
                        Welcome back! 👋
                      </div>
                      <div style={{ marginTop: 6, fontSize: 14, color: C.muted }}>
                        {isFirstVisit ? "Let's start your first strong review session today." : "Let's crush your study goals today."}
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: 22,
                        padding: isMobile ? 18 : 22,
                        border: `1px solid ${darkMode ? "#155E52" : "#1CA370"}`,
                        background: darkMode
                          ? "linear-gradient(90deg, #123B45 0%, #102B42 100%)"
                          : "linear-gradient(90deg, #0F5C5F 0%, #173A55 100%)",
                      }}
                    >
                      <div style={{ fontSize: 13, color: "#A7F3D0", fontWeight: 700 }}>Study Streak</div>
                      <div style={{ marginTop: 12, fontSize: isMobile ? 34 : 44, fontWeight: 500, color: "#FFFFFF", letterSpacing: "-0.04em" }}>
                        {studyStreak || 0} Day{studyStreak === 1 ? "" : "s"} {studyStreak ? "🔥" : ""}
                      </div>
                      <div style={{ marginTop: 14, height: 10, borderRadius: 999, background: "rgba(15, 23, 42, 0.48)", overflow: "hidden" }}>
                        <div style={{ width: `${Math.max(12, Math.min(100, ((studyStreak || 0) / 14) * 100))}%`, height: "100%", background: "#14D39A" }} />
                      </div>
                      <div style={{ marginTop: 10, fontSize: 13, color: "#A7F3D0", textAlign: "right" }}>
                        {studyStreak >= 14 ? "2-week rhythm locked in" : `${Math.max(0, 14 - (studyStreak || 0))} days to goal!`}
                      </div>
                    </div>

                    {false ? (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: width < 980 ? "1fr" : "repeat(3, minmax(0, 1fr))",
                        gap: 14,
                      }}
                    >
                      {dashboardStatCards.map((item) => (
                        <div
                          key={item.key}
                          style={{
                            borderRadius: 18,
                            padding: 20,
                            border: `1px solid ${C.border}`,
                            background: darkMode ? elevatedSurface : "#243047",
                            color: darkMode ? C.text : "#F8FAFC",
                          }}
                        >
                          <div style={{ fontSize: 18, color: item.accent }}>{item.icon}</div>
                          <div style={{ marginTop: 18, fontSize: 20, fontWeight: 500 }}>{item.value}</div>
                          <div style={{ marginTop: 4, fontSize: 14, color: darkMode ? C.muted : "#C4D2E4" }}>{item.label}</div>
                          <div style={{ marginTop: 8, fontSize: 12, color: darkMode ? C.faint : "#95A7BF" }}>{item.helper}</div>
                        </div>
                      ))}
                    </div>
                    ) : null}

                    <div
                      style={{
                        borderRadius: 22,
                        padding: isMobile ? 18 : 22,
                        border: "1px solid rgba(168, 85, 247, 0.32)",
                        background: darkMode
                          ? "linear-gradient(90deg, #2A1F45 0%, #31203E 100%)"
                          : "linear-gradient(90deg, #2E2450 0%, #3E2240 100%)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 20 }}>⚡</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#FDE68A", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          AI Recommended
                        </span>
                      </div>
                      <div style={{ marginTop: 18, fontSize: isMobile ? 28 : 34, fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.05em" }}>
                        {recommendedFocus?.subject || recommendedAction.title}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 18, color: "#C4B5FD", fontWeight: 500 }}>
                        {recommendedFocus?.topic ? formatTopicHeading(recommendedFocus.topic) : "Recommended review area"}
                      </div>
                      <div style={{ marginTop: 18, fontSize: 15, lineHeight: 1.8, color: "rgba(237, 233, 254, 0.88)" }}>
                        {recommendedFocusReason}
                      </div>
                      <button
                        type="button"
                        onClick={recommendedAction.onClick}
                        style={{
                          marginTop: 18,
                          width: "100%",
                          padding: "14px 18px",
                          borderRadius: 18,
                          border: "none",
                          background: "#16D19B",
                          color: "#042B23",
                          fontWeight: 800,
                          fontSize: 15,
                          cursor: "pointer",
                        }}
                      >
                        {recommendedAction.cta}
                      </button>
                    </div>
                  </div>

                  {true ? (
                  <>
                  <div
                    style={{
                      borderRadius: 22,
                      padding: isMobile ? 18 : 22,
                      border: `1px solid ${C.border}`,
                      background: darkMode ? elevatedSurface : "#243047",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: darkMode ? C.text : "#FFFFFF" }}>Choose Your Subject</div>
                      <button
                        type="button"
                        onClick={() => setSubjectGridExpanded((current) => !current)}
                        style={{ border: "none", background: "transparent", color: C.accentMid, fontWeight: 700, cursor: "pointer" }}
                      >
                        {subjectGridExpanded ? "Show Less" : "View All"}
                      </button>
                    </div>
                    <div
                      style={{
                        marginTop: 16,
                        display: "grid",
                        gridTemplateColumns: width < 980 ? "1fr" : "repeat(2, minmax(0, 1fr))",
                        gap: 14,
                      }}
                    >
                      {(subjectGridExpanded ? dashboardSubjectCards : dashboardSubjectCards.slice(0, 6)).map((item) => (
                        <button
                          key={item.subject}
                          type="button"
                          onClick={() => {
                            setSubject(item.subject === "Mixed Review" ? "Mixed Review" : item.subject);
                            setTopicFilter("");
                            setTopicInput("");
                            setStatusMessage(`${item.subject} is selected and ready for your next session.`);
                          }}
                          style={{
                            borderRadius: 20,
                            padding: 20,
                            border: `1px solid ${darkMode ? C.border : "#34435C"}`,
                            background: darkMode ? softSurface : "#27334A",
                            textAlign: "left",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontSize: 26 }}>{item.icon}</div>
                          <div style={{ marginTop: 18, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                            <div>
                              <div style={{ fontSize: 16, fontWeight: 700, color: darkMode ? C.text : "#FFFFFF" }}>{item.subject}</div>
                              <div style={{ marginTop: 12, fontSize: 13, color: darkMode ? C.muted : "#B7C7DA" }}>
                                {item.toneIcon} {item.tone}
                              </div>
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: "#19D39B" }}>
                              {item.score ? `${item.score}%` : "--"}
                            </div>
                          </div>
                          <div style={{ marginTop: 16, height: 8, borderRadius: 999, background: darkMode ? C.border : "#1A2436", overflow: "hidden" }}>
                            <div style={{ width: `${Math.max(item.score, item.score ? 10 : 0)}%`, height: "100%", background: item.color }} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div
                    style={{
                      borderRadius: 22,
                      padding: isMobile ? 18 : 22,
                      border: `1px solid ${C.border}`,
                      background: darkMode ? elevatedSurface : "#243047",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: darkMode ? C.text : "#FFFFFF" }}>Review History</div>
                      <div style={{ fontSize: 13, color: darkMode ? C.muted : "#B7C7DA" }}>
                        {reviewSessions.length ? `${reviewSessions.length} tracked session${reviewSessions.length === 1 ? "" : "s"}` : "No completed sessions yet"}
                      </div>
                    </div>
                    <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
                      {reviewSessions.length ? (
                        reviewSessions.slice(0, 4).map((session) => (
                          <SavedSessionCard
                            key={session.id}
                            session={session}
                            onOpen={openSavedQuiz}
                            onDelete={deleteSavedQuiz}
                            buildSessionLabel={buildSessionLabel}
                          />
                        ))
                      ) : (
                        <div style={{ fontSize: 13, color: darkMode ? C.muted : "#C7D4E3", lineHeight: 1.7 }}>
                          Submit a flashcard, quiz, or simulation session and it will appear here for quick return later.
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      borderRadius: 22,
                      padding: isMobile ? 18 : 22,
                      border: `1px solid ${C.border}`,
                      background: darkMode ? elevatedSurface : "#243047",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: darkMode ? C.text : "#FFFFFF" }}>Weekly Activity</div>
                      <div
                        style={{
                          padding: "8px 14px",
                          borderRadius: 999,
                          background: darkMode ? C.accentLight : "rgba(20, 209, 155, 0.12)",
                          color: C.accentMid,
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        {weeklyGrowth > 0 ? `+${weeklyGrowth}% vs last week` : weeklyGrowth < 0 ? `${weeklyGrowth}% vs last week` : "Building your weekly baseline"}
                      </div>
                    </div>
                    <div
                      style={{
                        marginTop: 18,
                        display: "grid",
                        gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                        gap: 10,
                        alignItems: "end",
                        minHeight: 170,
                      }}
                    >
                      {weeklyActivityData.map((item) => (
                        <div key={item.label} style={{ display: "grid", gap: 10, alignItems: "end" }}>
                          <div
                            style={{
                              height: 124,
                              borderRadius: 18,
                              background: darkMode ? C.bgElevated : "#172133",
                              padding: 10,
                              display: "flex",
                              alignItems: "flex-end",
                            }}
                          >
                            <div
                              style={{
                                width: "100%",
                                height: `${Math.max(20, (item.count / weeklyActivityMax) * 100)}%`,
                                borderRadius: 14,
                                background: "#14D39A",
                              }}
                            />
                          </div>
                          <div style={{ textAlign: "center", fontSize: 13, color: darkMode ? C.muted : "#B6C8DD" }}>{item.label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 16, textAlign: "center", fontSize: 15, color: darkMode ? C.text : "#E2E8F0" }}>
                      <strong>{weeklyActivityTotal}</strong> questions answered this week
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: width < 980 ? "1fr" : "minmax(0, 1.15fr) minmax(280px, 0.85fr)",
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        border: `1px solid ${C.border}`,
                        background: darkMode ? softSurface : "#FCFBF8",
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Recommended Focus
                      </div>
                      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.04em", color: C.text }}>
                          {recommendedFocus?.subject || "Start with one short set"}
                        </div>
                        {recommendedFocus?.topic ? <Badge label={formatTopicHeading(recommendedFocus.topic)} color="blue" /> : null}
                        {recommendedFocus ? <Badge label="Needs more focus" color="amber" /> : <Badge label="Ready when you are" color="green" />}
                      </div>
                      <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.75, color: C.text }}>
                        {recommendedFocusReason}
                      </div>
                      <div
                        style={{
                          marginTop: 12,
                          padding: "12px 14px",
                          borderRadius: 14,
                          background: darkMode ? elevatedSurface : "#F5F9F6",
                          border: `1px solid ${C.border}`,
                        }}
                      >
                        <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Why this is recommended
                        </div>
                        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                          {recommendationExplanationItems.map((reason) => (
                            <div key={reason} style={{ fontSize: 13, lineHeight: 1.7, color: C.text }}>
                              • {reason}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{ marginTop: 12, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
                        Suggested next action: <strong style={{ color: C.text }}>{recommendedFocusActionLabel}</strong>
                      </div>
                      {dueTodayCount ? (
                        <div style={{ marginTop: 8, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
                          {dueTodayCount} flashcard{dueTodayCount === 1 ? "" : "s"} due today can be used as your next lighter review queue.
                        </div>
                      ) : null}
                      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => {
                            void startRecommendedReviewAction();
                          }}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: "none",
                            background: C.accent,
                            color: "#fff",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          {recommendedFocusActionLabel}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (incorrectReviewItems.length || weakCardIds.length) {
                              startRemediationMode();
                              return;
                            }
                            void startRecommendedFocusSet();
                          }}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: `1px solid ${C.border}`,
                            background: C.surface,
                            color: C.text,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {recommendedFocusSecondaryLabel}
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        border: `1px solid ${C.border}`,
                        background: darkMode ? softSurface : "#FCFBF8",
                        display: "grid",
                        gap: 12,
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Performance Signals
                      </div>
                      <div style={{ display: "grid", gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>Strongest subject</div>
                          <div style={{ marginTop: 4, fontSize: 15, fontWeight: 800, color: C.text }}>
                            {adaptiveInsights.strongestSubject
                              ? `${adaptiveInsights.strongestSubject.subject} · ${Math.round(adaptiveInsights.strongestSubject.accuracy * 100)}% steady`
                              : "Build a few sessions first"}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>Most improved subject</div>
                          <div style={{ marginTop: 4, fontSize: 15, fontWeight: 800, color: C.text }}>
                            {adaptiveInsights.mostImprovedSubject
                              ? `${adaptiveInsights.mostImprovedSubject.subject} · +${adaptiveInsights.mostImprovedSubject.improvement}%`
                              : "Improvement trends will appear after repeated review"}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>Recent weak trend</div>
                          <div style={{ marginTop: 4, fontSize: 15, fontWeight: 800, color: C.text }}>
                            {recommendedFocus
                              ? `${recommendedFocus.subject}${recommendedFocus.topic ? ` · ${formatTopicHeading(recommendedFocus.topic)}` : ""}`
                              : "No repeating weak area yet"}
                          </div>
                          <div style={{ marginTop: 6, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
                            {recommendedFocus
                              ? `Focus priority ${recommendedFocus.focusScore}/100 based on misses, confidence, speed, and cross-module performance.`
                              : "Once CareDrop has a little more review history, it will rank subjects and topics by priority for you."}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: width < 980 ? "1fr" : "repeat(3, minmax(0, 1fr))",
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        border: `1px solid ${C.border}`,
                        background: darkMode ? softSurface : "#FCFBF8",
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Retention
                      </div>
                      <div style={{ marginTop: 10, fontSize: 24, fontWeight: 900, letterSpacing: "-0.04em" }}>
                        {savedSessionWaiting ? "Resume is ready" : "Stay in rhythm"}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7, color: C.text }}>
                        {savedSessionWaiting
                          ? `You still have ${buildSessionLabel(savedSessionWaiting)} waiting. Reopening saved work is one of the easiest ways to keep your review streak healthy.`
                          : dueTodayCount
                            ? `${dueTodayCount} card${dueTodayCount === 1 ? "" : "s"} are due today for spaced review, so you already have a gentle retention queue ready.`
                            : studyStreak
                            ? `You are on a ${studyStreak}-day streak. One more short set today protects that rhythm.`
                            : "No streak yet. One completed session today is enough to start a steady review pattern."}
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        border: `1px solid ${C.border}`,
                        background: darkMode ? softSurface : "#FCFBF8",
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Remediation
                      </div>
                      <div style={{ marginTop: 10, fontSize: 24, fontWeight: 900, letterSpacing: "-0.04em" }}>
                        {incorrectReviewItems.length || weakCardIds.length ? "Weak-area recovery ready" : "Build it after your first misses"}
                      </div>
                      {adaptiveInsights.remediationSummary?.improved ? (
                        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Badge label="Recovery improving" color="green" />
                        </div>
                      ) : null}
                      <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7, color: C.text }}>
                        {incorrectReviewItems.length || weakCardIds.length
                          ? `${incorrectReviewItems.length || weakCardIds.length} review misses are available to turn into a fresh remediation quiz, with extra emphasis on ${remediationFocusSubject || "your weakest subjects"}.`
                          : "Once quiz or simulation misses begin to appear, CareDrop can turn them into a short recovery set instead of making you search manually."}
                      </div>
                      <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.7, color: C.muted }}>
                        {remediationEffectivenessLine}
                      </div>
                      {incorrectReviewItems.length || weakCardIds.length ? (
                        <button
                          type="button"
                          onClick={() => startRemediationMode()}
                          style={{
                            marginTop: 14,
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: "none",
                            background: C.accent,
                            color: "#fff",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          Open remediation quiz
                        </button>
                      ) : null}
                    </div>

                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        border: `1px solid ${C.border}`,
                        background: darkMode ? softSurface : "#FCFBF8",
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Planning
                      </div>
                      <div style={{ marginTop: 10, fontSize: 24, fontWeight: 900, letterSpacing: "-0.04em" }}>
                        {plannerOpenItems.length ? plannerOpenItems.length : 0} active
                      </div>
                      <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7, color: C.text }}>
                        {plannerRecommendedItem
                          ? `Next due: ${plannerSummaryLine}${plannerRecommendedItem.dueDate ? ` on ${plannerRecommendedItem.dueDate}` : ""}.`
                          : "No active planner items yet. Build a study plan so CareDrop can surface what to tackle next."}
                      </div>
                      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => queueModeChange("planner")}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: "none",
                            background: C.accent,
                            color: "#fff",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          Open planner
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCalendarMonth(new Date());
                            setCalendarSelectedDate(getDateInputValue());
                            setStatusMessage("Calendar moved into the dashboard below.");
                          }}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: `1px solid ${C.border}`,
                            background: C.surface,
                            color: C.text,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Open calendar
                        </button>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      borderRadius: 20,
                      padding: 18,
                      border: `1px solid ${C.border}`,
                      background: darkMode ? softSurface : "#FCFBF8",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Calendar
                        </div>
                        <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.7, color: C.muted }}>
                          Keep study dates, reminders, and subject notes inside the dashboard so planning stays visible while you review.
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => setCalendarMonth((value) => shiftMonth(value, -1))}
                          style={{
                            padding: "9px 12px",
                            borderRadius: 10,
                            border: `1px solid ${C.border}`,
                            background: cardSurface,
                            fontWeight: 700,
                            color: C.text,
                            cursor: "pointer",
                          }}
                        >
                          Prev
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCalendarMonth(new Date());
                            setCalendarSelectedDate(getDateInputValue());
                          }}
                          style={{
                            padding: "9px 12px",
                            borderRadius: 10,
                            border: `1px solid ${C.border}`,
                            background: cardSurface,
                            fontWeight: 700,
                            color: C.text,
                            cursor: "pointer",
                          }}
                        >
                          Today
                        </button>
                        <button
                          type="button"
                          onClick={() => setCalendarMonth((value) => shiftMonth(value, 1))}
                          style={{
                            padding: "9px 12px",
                            borderRadius: 10,
                            border: `1px solid ${C.border}`,
                            background: cardSurface,
                            fontWeight: 700,
                            color: C.text,
                            cursor: "pointer",
                          }}
                        >
                          Next
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 16,
                        display: "grid",
                        gridTemplateColumns: width < 1100 ? "1fr" : "minmax(0, 1.1fr) minmax(300px, 0.9fr)",
                        gap: 16,
                      }}
                    >
                      <div
                        style={{
                          borderRadius: 18,
                          border: `1px solid ${C.border}`,
                          background: cardSurface,
                          padding: 16,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
                          <div style={{ fontSize: 18, fontWeight: 800 }}>{getMonthLabel(calendarMonth)}</div>
                          <div style={{ fontSize: 12, color: C.muted }}>
                            {calendarEvents.length ? `${calendarEvents.length} saved` : "No entries yet"}
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 8, marginBottom: 10 }}>
                          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                            <div
                              key={label}
                              style={{
                                textAlign: "center",
                                fontSize: 11,
                                color: C.faint,
                                fontWeight: 800,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                              }}
                            >
                              {label}
                            </div>
                          ))}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 8 }}>
                          {calendarDays.map((day) => {
                            const active = day.key === calendarSelectedDate;
                            const today = day.key === formatDateKey(new Date());
                            return (
                              <button
                                key={day.key}
                                type="button"
                                onClick={() => setCalendarSelectedDate(day.key)}
                                style={{
                                  minHeight: width < 640 ? 64 : 78,
                                  borderRadius: 14,
                                  border: active ? `1px solid ${C.accent}` : today ? `1px solid ${darkMode ? C.borderStrong : "#BFD1E5"}` : `1px solid ${C.border}`,
                                  background: active ? C.accentLight : day.inMonth ? cardSurface : (darkMode ? softSurface : "#F4F1EB"),
                                  color: day.inMonth ? C.text : C.faint,
                                  padding: 10,
                                  textAlign: "left",
                                  cursor: "pointer",
                                  display: "flex",
                                  flexDirection: "column",
                                  justifyContent: "space-between",
                                  gap: 6,
                                }}
                              >
                                <div style={{ fontSize: 12, fontWeight: 800 }}>{day.date.getDate()}</div>
                                <div style={{ fontSize: 10, color: active ? C.accent : darkMode ? C.blue : "#355E8A", fontWeight: 700 }}>
                                  {day.events.length ? `${day.events.length} item${day.events.length === 1 ? "" : "s"}` : ""}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div style={{ display: "grid", gap: 12 }}>
                        <div
                          style={{
                            borderRadius: 18,
                            border: `1px solid ${C.border}`,
                            background: cardSurface,
                            padding: 16,
                          }}
                        >
                          <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                            Selected Date
                          </div>
                          <div style={{ marginTop: 8, fontSize: 22, fontWeight: 900 }}>
                            {new Date(calendarSelectedDate).toLocaleDateString([], {
                              weekday: "long",
                              month: "long",
                              day: "numeric",
                            })}
                          </div>
                          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                            <input
                              value={calendarDraftTitle}
                              onChange={(event) => setCalendarDraftTitle(event.target.value)}
                              placeholder="Title for this date"
                              style={{ ...selectStyle, cursor: "text" }}
                            />
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                              <select value={calendarDraftType} onChange={(event) => setCalendarDraftType(event.target.value)} style={selectStyle}>
                                {PLANNER_EVENT_TYPES.map((type) => (
                                  <option key={type} value={type}>
                                    {type}
                                  </option>
                                ))}
                              </select>
                              <select value={calendarDraftSubject} onChange={(event) => setCalendarDraftSubject(event.target.value)} style={selectStyle}>
                                <option value="">No subject tag</option>
                                {SUBJECT_OPTIONS.filter((value) => value !== "Mixed Review").map((value) => (
                                  <option key={value} value={value}>
                                    {value}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <textarea
                              value={calendarDraftNote}
                              onChange={(event) => setCalendarDraftNote(event.target.value)}
                              placeholder="Optional note for this date"
                              style={{ ...selectStyle, minHeight: 82, resize: "vertical", cursor: "text" }}
                            />
                            <button
                              type="button"
                              onClick={addCalendarEvent}
                              style={{
                                padding: "11px 14px",
                                borderRadius: 12,
                                border: "none",
                                background: C.accent,
                                color: "#fff",
                                fontWeight: 800,
                                cursor: "pointer",
                              }}
                            >
                              Save calendar entry
                            </button>
                          </div>
                        </div>

                        <div
                          style={{
                            borderRadius: 18,
                            border: `1px solid ${C.border}`,
                            background: cardSurface,
                            padding: 16,
                          }}
                        >
                          <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                            Date Entries
                          </div>
                          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                            {selectedDateEvents.length ? (
                              selectedDateEvents.map((event) => (
                                <div
                                  key={event.id}
                                  style={{
                                    padding: "12px 14px",
                                    borderRadius: 14,
                                    background: darkMode ? softSurface : "#FCFBF8",
                                    border: `1px solid ${C.border}`,
                                  }}
                                >
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                      <Badge label={event.type} color="blue" />
                                      {event.subject ? <Badge label={event.subject} color="gray" /> : null}
                                      {event.completed ? <Badge label="done" color="green" /> : null}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => toggleCalendarEvent(event.id)}
                                      style={{
                                        padding: "7px 10px",
                                        borderRadius: 10,
                                        border: `1px solid ${C.border}`,
                                        background: C.surface,
                                        fontWeight: 700,
                                        cursor: "pointer",
                                      }}
                                    >
                                      {event.completed ? "Reopen" : "Done"}
                                    </button>
                                  </div>
                                  <div style={{ marginTop: 8, fontSize: 14, fontWeight: 800 }}>{event.title}</div>
                                  {event.note ? (
                                    <div style={{ marginTop: 6, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
                                      {event.note}
                                    </div>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => deleteCalendarEvent(event.id)}
                                    style={{
                                      marginTop: 8,
                                      padding: 0,
                                      border: "none",
                                      background: "transparent",
                                      color: C.red,
                                      fontSize: 12,
                                      fontWeight: 800,
                                      cursor: "pointer",
                                    }}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))
                            ) : (
                              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                                Nothing is scheduled for this date yet.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      borderRadius: 20,
                      padding: 18,
                      border: `1px solid ${C.border}`,
                      background: darkMode ? softSurface : "#FCFBF8",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Recent Review Trail
                        </div>
                        <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.7, color: C.muted }}>
                          {reviewSessions.length
                            ? "Pick up a recent session or use it to decide what to revisit next."
                            : "Once you submit a quiz or flashcard set, your review trail will start here."}
                        </div>
                      </div>
                      {reviewSessions.length ? (
                        <div style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>
                          Latest sessions are shown below
                        </div>
                      ) : null}
                    </div>
                    {reviewSessions.length ? (
                      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                        {reviewSessions.slice(0, 3).map((session) => (
                          <button
                            key={session.id}
                            type="button"
                            onClick={() => openSavedQuiz(session)}
                            style={{
                              width: "100%",
                              borderRadius: 16,
                              padding: isMobile ? "12px 14px" : "13px 15px",
                              border: `1px solid ${C.border}`,
                            background: cardSurface,
                              display: "flex",
                              justifyContent: "space-between",
                              flexDirection: isMobile ? "column" : "row",
                              gap: 16,
                              alignItems: isMobile ? "flex-start" : "center",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{buildSessionLabel(session)}</div>
                              <div style={{ marginTop: 4, fontSize: 12, color: C.muted }}>{getLocalDateLabel(session.createdAt)}</div>
                            </div>
                            <div style={{ fontSize: 13, color: C.accent, fontWeight: 800 }}>{session.score || 0}%</div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  </>
                  ) : null}
                </div>
              </AnalyticsCard>
              </ErrorBoundary>
            ) : null}

            {mode === "admin" && isAdminUser ? (
              <ErrorBoundary label="Admin area" onReset={() => queueModeChange("admin")} onBack={() => queueModeChange("dashboard")}>
              <AnalyticsCard title="Admin Overview">
                <div style={{ display: "grid", gap: 16 }}>
                  <div
                    style={{
                      borderRadius: 18,
                      padding: 16,
                      border: `1px solid ${C.red}`,
                      background: C.redLight,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 14,
                      alignItems: isMobile ? "flex-start" : "center",
                      flexDirection: isMobile ? "column" : "row",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, color: C.red, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Test Reset
                      </div>
                      <div style={{ marginTop: 6, fontSize: 13, color: C.text, lineHeight: 1.7 }}>
                        Reset this account&apos;s flashcards, quizzes, simulation exam state, review history, and tracked study progress back to zero so you can test the product from a clean slate.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={resetStudyProgressToZero}
                      style={{
                        padding: "10px 16px",
                        borderRadius: 12,
                        border: `1px solid ${C.red}`,
                            background: cardSurface,
                        color: C.red,
                        fontWeight: 800,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Reset Study Data
                    </button>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    {[
                      ["overview", "Overview"],
                      ["feedback", "Feedback"],
                      ["planning", "Planning"],
                      ["activity", "Activity"],
                      ["users", "Users"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => queueAdminViewChange(value)}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 12,
                          border: adminView === value ? `1px solid ${C.accentMid}` : `1px solid ${C.border}`,
                          background: adminView === value ? C.accentLight : darkMode ? softSurface : "#FCFBF8",
                          color: adminView === value ? C.accent : C.text,
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: width < 980 ? "1fr" : "repeat(4, minmax(0, 1fr))",
                      gap: 14,
                    }}
                  >
                    {[
                      {
                        label: "Tracked Sessions",
                        value: reviewSessions.length,
                        helper: reviewSessions.length ? `${reviewSessionAverage}% average session score` : "No sessions tracked yet",
                      },
                      {
                        label: "Learners",
                        value: adminUsersConfigured ? adminUsers.length : "—",
                        helper: adminUsersConfigured
                          ? adminUsers.length
                            ? `${adminUserAverageScore}% average learner score`
                            : "No synced learners yet"
                          : "User analytics needs server-side Supabase admin access",
                      },
                      {
                        label: "Saved Sessions",
                        value: savedSessionCount,
                        helper: savedSessionCount ? "Learners can return to these later" : "Nothing saved yet",
                      },
                      {
                        label: "Feedback Inbox",
                        value: requestHistory.length,
                        helper: requestConfigured ? "Central inbox connected" : "Currently falling back to local saves",
                      },
                      {
                        label: "Cloud / Network",
                        value: isOnline ? "Online" : "Offline",
                        helper: cloudSyncStatus || (cloudSyncReady ? "Cloud sync available" : "Cloud sync not configured"),
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        style={{
                          borderRadius: 18,
                          padding: studySectionPadding,
                          border: `1px solid ${C.border}`,
                          background: darkMode ? softSurface : "#FCFBF8",
                        }}
                      >
                        <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          {item.label}
                        </div>
                        <div style={{ marginTop: 10, fontSize: typeof item.value === "number" ? 34 : 24, fontWeight: 900, letterSpacing: "-0.05em" }}>
                          {item.value}
                        </div>
                        <div style={{ marginTop: 8, fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                          {item.helper}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      display: adminView === "overview" ? "grid" : "none",
                      gridTemplateColumns: width < 980 ? "1fr" : "minmax(0, 1.15fr) minmax(300px, 0.85fr)",
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        border: `1px solid ${C.border}`,
                        background: darkMode ? softSurface : "#FCFBF8",
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Subject Performance Trend
                      </div>
                      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                        {subjectPerformanceSummary.length ? (
                          subjectPerformanceSummary.slice(0, 8).map((item) => (
                            <div
                              key={item.subject}
                              style={{
                                padding: "12px 14px",
                                borderRadius: 14,
                                background: C.surface,
                                border: `1px solid ${C.border}`,
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                                <div style={{ fontSize: 14, fontWeight: 800 }}>{item.subject}</div>
                                <Badge label={`${item.average}% avg`} color={item.average >= 75 ? "green" : item.average >= 60 ? "amber" : "red"} />
                              </div>
                              <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: darkMode ? C.border : "#E8E4DC", overflow: "hidden" }}>
                                <div
                                  style={{
                                    width: `${item.average}%`,
                                    height: "100%",
                                    background: item.average >= 75 ? "#2D6A4F" : item.average >= 60 ? "#E7A93B" : "#C1121F",
                                  }}
                                />
                              </div>
                              <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>
                                {item.attempts} session{item.attempts === 1 ? "" : "s"} | {item.answered} answered overall
                              </div>
                            </div>
                          ))
                        ) : (
                          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                            Once learners submit flashcards, quizzes, or simulations, subject performance trends will appear here.
                          </div>
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        border: `1px solid ${C.border}`,
                        background: darkMode ? softSurface : "#FCFBF8",
                        display: "grid",
                        gap: 14,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Feedback Types
                        </div>
                        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                          {requestTypeSummary.length ? (
                            requestTypeSummary.slice(0, 6).map(([type, count]) => (
                              <div
                                key={type}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 12,
                                  padding: "12px 14px",
                                  borderRadius: 14,
                                  background: C.surface,
                                  border: `1px solid ${C.border}`,
                                  fontSize: 13,
                                  color: C.text,
                                  fontWeight: 700,
                                }}
                              >
                                <span>{type}</span>
                                <span>{count}</span>
                              </div>
                            ))
                          ) : (
                            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                              No feedback items are stored yet. Request and report activity will show here once learners start sending notes.
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Product Signals
                        </div>
                        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                          <div style={{ padding: "12px 14px", borderRadius: 14, background: C.surface, border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.7 }}>
                            Weak-card backlog: <strong>{weakCardIds.length}</strong>{weakestSubject ? `, strongest pull in ${weakestSubject}` : ""}
                          </div>
                          <div style={{ padding: "12px 14px", borderRadius: 14, background: C.surface, border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.7 }}>
                            Recent misses ready for remediation: <strong>{incorrectReviewItems.length}</strong>
                          </div>
                          <div style={{ padding: "12px 14px", borderRadius: 14, background: C.surface, border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.7 }}>
                            Simulation flagged questions in current run: <strong>{simulationFlaggedCount}</strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: adminView === "feedback" ? "block" : "none",
                      borderRadius: 18,
                      padding: 18,
                      border: `1px solid ${C.border}`,
                      background: darkMode ? softSurface : "#FCFBF8",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Recent Requests
                        </div>
                        <div style={{ marginTop: 6, fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                          The latest request or report items collected through CareDrop.
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: requestConfigured ? C.accent : C.amber, fontWeight: 800 }}>
                        {requestConfigured ? "Central inbox connected" : "Local fallback mode"}
                      </div>
                    </div>
                    <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                      {adminFeedbackItems.length ? (
                        adminFeedbackItems.slice(0, 8).map((entry) => (
                          <div
                            key={entry.id || entry.number || entry.createdAt}
                            style={{
                              padding: "14px 16px",
                              borderRadius: 14,
                              background: C.surface,
                              border: `1px solid ${C.border}`,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                <Badge label={entry.type || "General Feedback"} color="gray" />
                                {entry.state === "local" ? <Badge label="local only" color="amber" /> : null}
                                {entry.number ? <Badge label={`#${entry.number}`} color="blue" /> : null}
                              </div>
                              <div style={{ fontSize: 12, color: C.muted }}>{getLocalDateLabel(entry.createdAt)}</div>
                            </div>
                            <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.7, color: C.text }}>
                              {entry.message}
                            </div>
                            <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>
                              Submitted by: <strong style={{ color: C.text }}>{entry.submittedBy || entry.name || "Anonymous"}</strong>
                            </div>
                            {entry.url ? (
                              <a
                                href={entry.url}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  marginTop: 10,
                                  display: "inline-block",
                                  fontSize: 12,
                                  fontWeight: 800,
                                  color: C.accent,
                                  textDecoration: "none",
                                }}
                              >
                                Open linked issue
                              </a>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                          No requests have been submitted yet. Once learners start sending fixes, topic requests, or bug reports, they will appear here.
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      display: adminView === "planning" ? "grid" : "none",
                      gridTemplateColumns: width < 980 ? "1fr" : "repeat(3, minmax(0, 1fr))",
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        border: `1px solid ${C.border}`,
                        background: darkMode ? softSurface : "#FCFBF8",
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Feature Adoption
                      </div>
                      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                        {featureUsageSummary.map((item) => (
                          <div
                            key={item.label}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 12,
                              padding: "12px 14px",
                              borderRadius: 14,
                            background: cardSurface,
                              border: `1px solid ${C.border}`,
                              fontSize: 13,
                              color: C.text,
                              fontWeight: 700,
                            }}
                          >
                            <span>{item.label}</span>
                            <span>{item.value}</span>
                          </div>
                        ))}
                        {plannerModeSummary.length ? (
                          <div style={{ marginTop: 4, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
                            Planner mix: {plannerModeSummary.slice(0, 3).map(([modeName, count]) => `${modeName} (${count})`).join(", ")}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        border: `1px solid ${C.border}`,
                        background: darkMode ? softSurface : "#FCFBF8",
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Planning Pressure Points
                      </div>
                      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                        <div style={{ padding: "12px 14px", borderRadius: 14, background: cardSurface, border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.7 }}>
                          Upcoming calendar events: <strong>{upcomingEvents.length}</strong>
                        </div>
                        <div style={{ padding: "12px 14px", borderRadius: 14, background: cardSurface, border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.7 }}>
                          Planner completion rate: <strong>{plannerCompletionRate}%</strong>
                        </div>
                        <div style={{ padding: "12px 14px", borderRadius: 14, background: cardSurface, border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.7 }}>
                          Overdue planner items: <strong>{overduePlannerItems.length}</strong>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        border: `1px solid ${C.border}`,
                        background: darkMode ? softSurface : "#FCFBF8",
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Scheduled Subjects
                      </div>
                      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                        {scheduledSubjectSummary.length ? (
                          scheduledSubjectSummary.slice(0, 6).map(([subjectName, count]) => (
                            <div
                              key={subjectName}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 12,
                                padding: "12px 14px",
                                borderRadius: 14,
                                background: cardSurface,
                                border: `1px solid ${C.border}`,
                                fontSize: 13,
                                color: C.text,
                                fontWeight: 700,
                              }}
                            >
                              <span>{subjectName}</span>
                              <span>{count}</span>
                            </div>
                          ))
                        ) : (
                          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                            No subject-tagged calendar entries yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: adminView === "activity" ? "grid" : "none",
                      gridTemplateColumns: width < 980 ? "1fr" : "minmax(0, 1.1fr) minmax(300px, 0.9fr)",
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        border: `1px solid ${C.border}`,
                        background: darkMode ? softSurface : "#FCFBF8",
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Recent Session Activity
                      </div>
                      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                        {adminRecentSessions.length ? (
                          adminRecentSessions.map((session) => (
                            <div
                              key={session.id}
                              style={{
                                padding: "14px 16px",
                                borderRadius: 14,
                                background: cardSurface,
                                border: `1px solid ${C.border}`,
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                  <Badge label={buildSessionLabel(session)} color="blue" />
                                  {session.subject ? <Badge label={session.subject} color="gray" /> : null}
                                  {typeof session.score === "number" ? (
                                    <Badge label={`${session.score}%`} color={session.score >= 75 ? "green" : session.score >= 60 ? "amber" : "red"} />
                                  ) : null}
                                </div>
                                <div style={{ fontSize: 12, color: C.muted }}>{getLocalDateLabel(session.createdAt)}</div>
                              </div>
                              <div style={{ marginTop: 8, fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                                {session.answeredCount || 0} answered | {session.saved ? "saved for return" : "completed in one pass"}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                            No study sessions yet. Once learners begin reviewing, their recent activity trail will appear here.
                          </div>
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        border: `1px solid ${C.border}`,
                        background: darkMode ? softSurface : "#FCFBF8",
                        display: "grid",
                        gap: 10,
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Retention Signals
                      </div>
                        <div style={{ padding: "12px 14px", borderRadius: 14, background: cardSurface, border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.7 }}>
                        Current study streak: <strong>{studyStreak}</strong> day{studyStreak === 1 ? "" : "s"}
                      </div>
                        <div style={{ padding: "12px 14px", borderRadius: 14, background: cardSurface, border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.7 }}>
                        Answered today: <strong>{todayAnsweredCount}</strong> / {dailyGoalTarget}
                      </div>
                        <div style={{ padding: "12px 14px", borderRadius: 14, background: cardSurface, border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.7 }}>
                        Saved sessions waiting: <strong>{savedSessionCount}</strong>
                      </div>
                        <div style={{ padding: "12px 14px", borderRadius: 14, background: cardSurface, border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.7 }}>
                        Readiness score snapshot: <strong>{readinessScore}%</strong>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: adminView === "users" ? "grid" : "none",
                      gridTemplateColumns: width < 980 ? "1fr" : "minmax(0, 1.1fr) minmax(300px, 0.9fr)",
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        border: `1px solid ${C.border}`,
                        background: darkMode ? softSurface : "#FCFBF8",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                            Learner Analytics
                          </div>
                          <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.7, color: C.muted }}>
                            Signed-in learner progress synced from Supabase for admin review.
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: adminUsersConfigured ? C.accent : C.amber, fontWeight: 800 }}>
                          {adminUsersConfigured ? "Supabase admin access connected" : "Needs SUPABASE_SERVICE_ROLE_KEY"}
                        </div>
                      </div>
                      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                        {adminUsersLoading ? (
                          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                            Loading learner analytics...
                          </div>
                        ) : adminUsers.length ? (
                          adminUsers.slice(0, 12).map((user) => (
                            <div
                              key={user.id}
                              style={{
                                padding: "14px 16px",
                                borderRadius: 14,
                                background: cardSurface,
                                border: `1px solid ${C.border}`,
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                                <div>
                                  <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>
                                    {user.name || user.email || "Unnamed learner"}
                                  </div>
                                  <div style={{ marginTop: 4, fontSize: 12, color: C.muted }}>
                                    {user.email || "No email available"}
                                  </div>
                                </div>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                  <Badge label={`${user.averageScore || 0}% avg`} color={Number(user.averageScore || 0) >= 75 ? "green" : Number(user.averageScore || 0) >= 60 ? "amber" : "red"} />
                                  <Badge label={`${user.totalSessions || 0} sessions`} color="gray" />
                                </div>
                              </div>
                              <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
                                <div>Last active: <strong style={{ color: C.text }}>{user.lastActiveAt ? getLocalDateLabel(user.lastActiveAt) : "No study sessions yet"}</strong></div>
                                <div>Weakest visible area: <strong style={{ color: C.text }}>{user.weakSubject || "Not enough data yet"}</strong></div>
                                <div>Modules used: <strong style={{ color: C.text }}>{user.flashcardSessions || 0}</strong> flashcards, <strong style={{ color: C.text }}>{user.quizSessions || 0}</strong> quizzes, <strong style={{ color: C.text }}>{user.simulationSessions || 0}</strong> simulations</div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                            {adminUsersError || "No synced learners are visible yet. Once learners sign in and sync progress, they will appear here."}
                          </div>
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        border: `1px solid ${C.border}`,
                        background: darkMode ? softSurface : "#FCFBF8",
                        display: "grid",
                        gap: 10,
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        User Signals
                      </div>
                        <div style={{ padding: "12px 14px", borderRadius: 14, background: cardSurface, border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.7 }}>
                        Most active learner: <strong>{adminMostActiveUser?.name || adminMostActiveUser?.email || "Not enough synced data yet"}</strong>
                      </div>
                        <div style={{ padding: "12px 14px", borderRadius: 14, background: cardSurface, border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.7 }}>
                        Average learner score: <strong>{adminUserAverageScore}%</strong>
                      </div>
                        <div style={{ padding: "12px 14px", borderRadius: 14, background: cardSurface, border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.7 }}>
                        Learner needing the most support: <strong>{adminWeakestUser?.name || adminWeakestUser?.email || "Not enough synced data yet"}</strong>{adminWeakestUser?.weakSubject ? ` in ${adminWeakestUser.weakSubject}` : ""}
                      </div>
                        <div style={{ padding: "12px 14px", borderRadius: 14, background: cardSurface, border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.7 }}>
                        Sync requirement: <strong>{adminUsersConfigured ? "Connected" : "Add SUPABASE_SERVICE_ROLE_KEY to the server environment"}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </AnalyticsCard>
              </ErrorBoundary>
            ) : null}

            {mode === "flashcard" ? (
              <ErrorBoundary label="Flashcards" onReset={() => queueModeChange("flashcard")} onBack={() => queueModeChange("dashboard")}>
              <div style={panelStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    marginBottom: 20,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>Flashcards</div>
                    <div style={{ fontSize: studyMetaSize, color: C.muted, lineHeight: 1.55 }}>
                      {subjectDisplay} | {difficulty === "All" ? "all difficulties" : difficulty} | {activeTopicFocus || "all topics"} | target {FLASHCARD_SET_SIZE} cards per set
                    </div>
                  </div>
                  {!showFlashcardSetup ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        onClick={() => setCardIdx((value) => Math.max(0, value - 1))}
                        disabled={!flashcards.length || cardIdx === 0}
                        style={{
                          padding: studyActionPadding,
                          borderRadius: 10,
                          border: `1px solid ${C.border}`,
                          background: C.surface,
                          cursor: !flashcards.length || cardIdx === 0 ? "not-allowed" : "pointer",
                        }}
                      >
                        Prev
                      </button>
                      <button
                        onClick={() => setCardIdx((value) => Math.min(flashcards.length - 1, value + 1))}
                        disabled={!flashcards.length || cardIdx >= flashcards.length - 1}
                        style={{
                          padding: studyActionPadding,
                          borderRadius: 10,
                          border: `1px solid ${C.border}`,
                          background: C.surface,
                          cursor:
                            !flashcards.length || cardIdx >= flashcards.length - 1
                              ? "not-allowed"
                              : "pointer",
                        }}
                      >
                        Next
                      </button>
                    </div>
                  ) : null}
                </div>

                {showFlashcardSetup ? (
                  renderModuleSetupControls("flashcard")
                ) : currentCard ? (
                  <>
                    <Flashcard
                      key={`${currentCard.id || "flashcard"}-${cardIdx}`}
                      card={currentCard}
                      idx={cardIdx}
                      total={flashcards.length}
                      onRate={handleRate}
                    />
                    <div
                      style={{
                        marginTop: 16,
                        borderRadius: 18,
                        padding: studySectionPadding,
                        background: darkMode ? softSurface : "#FBFAF7",
                        border: `1.5px solid ${C.border}`,
                      }}
                    >
                      <div style={{ fontSize: studyMetaSize, fontWeight: 800, color: C.muted, marginBottom: 10 }}>
                        Flashcard Session Progress
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: width < 640 ? "1fr 1fr" : "repeat(4, max-content)",
                          gap: width < 640 ? 10 : 18,
                          fontSize: studyBodySize,
                          lineHeight: 1.65,
                        }}
                      >
                        <div>Reviewed: <strong>{flashcardCompletedCount} / {flashcards.length}</strong></div>
                        <div>Strong: <strong>{flashcardStrongCount}</strong></div>
                        <div>Needs work: <strong>{flashcardNeedsReviewCount}</strong></div>
                        <div>Progress: <strong>{flashcardProgressPercent}%</strong></div>
                      </div>
                      <div
                        style={{
                          marginTop: 14,
                          display: "grid",
                          gridTemplateColumns: width < 640 ? "1fr" : "repeat(2, max-content)",
                          gap: 10,
                        }}
                      >
                        <button
                          onClick={submitFlashcardSession}
                          disabled={flashcardCompletedCount < flashcards.length || flashcardSessionSubmitted}
                          style={{
                            padding: "10px 16px",
                            borderRadius: 10,
                            border: "none",
                            background:
                              flashcardCompletedCount < flashcards.length || flashcardSessionSubmitted
                                ? C.border
                                : C.accent,
                            color:
                              flashcardCompletedCount < flashcards.length || flashcardSessionSubmitted
                                ? C.muted
                                : "#fff",
                            fontWeight: 700,
                            cursor:
                              flashcardCompletedCount < flashcards.length || flashcardSessionSubmitted
                                ? "not-allowed"
                                : "pointer",
                          }}
                        >
                          {flashcardSessionSubmitted ? "Flashcard Session Submitted" : "Submit Flashcard Session"}
                        </button>
                        {flashcardSessionSubmitted ? (
                          <button
                            type="button"
                            onClick={returnToReviewFilters}
                            style={{
                              padding: studyActionPadding,
                              borderRadius: 10,
                              border: `1px solid ${C.border}`,
                              background: C.surface,
                              color: C.text,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Choose Another Topic
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      border: `1px dashed ${C.border}`,
                      borderRadius: 20,
                      padding: isMobile ? "28px 18px" : "36px 22px",
                      textAlign: "center",
                      color: C.muted,
                      lineHeight: 1.7,
                    }}
                  >
                    {subject || activeTopicFocus
                      ? "No flashcards are ready yet for this exact focus. Try generating again and CareDrop will use the bank plus Gemini to expand the set."
                      : "Select a subject or enter a topic focus, then generate a flashcard set for that review target."}
                  </div>
                )}
              </div>
              </ErrorBoundary>
            ) : null}

            {mode === "quiz" ? (
              <ErrorBoundary label="Quiz workspace" onReset={() => queueModeChange("quiz")} onBack={() => queueModeChange("dashboard")}>
              <div style={panelStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "center",
                    marginBottom: 18,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>Quiz</div>
                    <div style={{ fontSize: studyMetaSize, color: C.muted, lineHeight: 1.55 }}>
                      {remediationContext
                        ? `Remediation set | ${remediationContext.weakestSubject || remediationContext.topic || "recent weak areas"} | ${QUIZ_SET_SIZE} questions`
                        : `Target ${QUIZ_SET_SIZE} questions | strict difficulty filter | saved sessions supported`}
                    </div>
                  </div>
                </div>

                {showQuizSetup ? (
                  renderModuleSetupControls("quiz")
                ) : !quizItem ? (
                  <div
                    style={{
                      border: `1px dashed ${C.border}`,
                      borderRadius: 20,
                      padding: isMobile ? "28px 18px" : "36px 22px",
                      textAlign: "center",
                      color: C.muted,
                      lineHeight: 1.7,
                    }}
                  >
                    {subject || activeTopicFocus
                      ? "Generate a quiz to load a 10-question session for this focus. CareDrop will use the bank first, then Gemini if it needs to extend the set."
                      : "Select a subject or enter a topic focus, then generate a focused quiz session."}
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                      <Badge label={`Q ${quizIdx + 1} / ${quiz.length}`} color="blue" />
                      <Badge label={quizItem.subject} color="gray" />
                      <Badge label={quizItem.topic} color="gray" />
                      <Badge
                        label={quizItem.difficulty}
                        color={
                          quizItem.difficulty === "hard"
                            ? "red"
                            : quizItem.difficulty === "medium"
                              ? "amber"
                              : "green"
                        }
                      />
                    </div>

                    <div
                      style={{
                        height: 6,
                        background: C.border,
                        borderRadius: 999,
                        overflow: "hidden",
                        marginBottom: 16,
                      }}
                    >
                      <div
                        style={{
                          width: `${progressPercent}%`,
                          height: "100%",
                          background: C.accentMid,
                        }}
                      />
                    </div>

                    <div
                      key={quizItem.id}
                      style={{
                        background: C.panelNeutralAlt,
                        borderRadius: 18,
                        padding: studySectionPadding,
                        border: `1.5px solid ${C.panelNeutralDark}`,
                        animation: "caredropFadeSlide 0.24s ease",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: C.faint,
                          fontWeight: 700,
                          letterSpacing: "0.07em",
                          textTransform: "uppercase",
                          marginBottom: 10,
                        }}
                      >
                        Question
                      </div>
                      <div style={{ fontSize: studyQuestionSize, fontWeight: 800, lineHeight: 1.45, letterSpacing: "-0.02em" }}>
                        {quizItem.prompt}
                      </div>
                    </div>

                    <div key={`${quizItem.id || "quiz"}-${quizIdx}-options`} style={{ marginTop: 14, display: "grid", gap: 8, animation: "caredropFadeSlide 0.24s ease" }}>
                      {getQuestionOptions(quizItem).map((option, optionIndex) => {
                        const selected = getSelectedOptionIds(quizItem).includes(option.id);
                        const correct = getCorrectOptionIds(quizItem).includes(option.id);
                        const background = quizSubmitted && correct
                          ? successSurface
                          : quizSubmitted && selected && !correct
                            ? errorSurface
                            : C.panelNeutralAlt;
                        const borderColor = quizSubmitted && correct
                          ? successBorder
                          : quizSubmitted && selected && !correct
                            ? errorBorder
                            : C.panelNeutralDark;

                        return (
                          <label
                            key={`${quizItem.id || "quiz"}-${quizIdx}-${option.id}-${optionIndex}`}
                            style={{
                              textAlign: "left",
                              padding: "14px 16px",
                              borderRadius: 14,
                              border: `1px solid ${borderColor}`,
                              background,
                              cursor: quizSubmitted ? "default" : "pointer",
                              fontSize: studyBodySize,
                              lineHeight: 1.55,
                              transition: "transform 0.18s ease, border-color 0.18s ease, background 0.18s ease",
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 12,
                            }}
                          >
                            <input
                              type="radio"
                              name={`quiz-${quizItem.id}`}
                              checked={selected}
                              disabled={quizSubmitted}
                              onChange={() => handleQuizAnswer(option.text)}
                              style={{ marginTop: 4 }}
                            />
                            <span>{option.text}</span>
                          </label>
                        );
                      })}
                    </div>

                    {!quizSubmitted ? (
                      <div
                        style={{
                          marginTop: 16,
                          borderRadius: 18,
                          padding: studySectionPadding,
                          background: C.panelNeutral,
                          border: `1px solid ${C.panelNeutralDark}`,
                        }}
                      >
                        <div style={{ fontSize: studyBodySize, lineHeight: 1.7 }}>
                          {quizItem.userAnswer
                            ? "Answer saved. You can still move back and change it before final submission."
                            : "Choose an answer, use Previous or Next to move around the set, and submit only when you are ready."}
                        </div>
                        {unansweredQuizNumbers.length && quizIdx === quiz.length - 1 ? (
                          <div
                            style={{
                              marginTop: 10,
                              padding: "10px 12px",
                              borderRadius: 12,
                              background: warningSurface,
                              border: `1px solid ${warningBorder}`,
                              fontSize: 13,
                              lineHeight: 1.7,
                              color: C.text,
                            }}
                          >
                            You still need to answer question{unansweredQuizNumbers.length === 1 ? "" : "s"} {unansweredQuizNumbers.join(", ")} before you can submit this quiz.
                          </div>
                        ) : null}
                        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => setQuizIdx((value) => Math.max(value - 1, 0))}
                            disabled={quizIdx === 0}
                            style={{
                              padding: studyActionPadding,
                              borderRadius: 10,
                              border: `1px solid ${C.border}`,
                              background: quizIdx === 0 ? C.border : C.surface,
                              color: quizIdx === 0 ? C.muted : C.text,
                              fontWeight: 700,
                              cursor: quizIdx === 0 ? "not-allowed" : "pointer",
                            }}
                          >
                            Previous
                          </button>
                          <button
                            onClick={() => {
                              setAiResponse("");
                              setQuestion("");
                              setQuizIdx((value) => Math.min(value + 1, quiz.length - 1));
                            }}
                            disabled={quizIdx >= quiz.length - 1}
                            style={{
                              padding: "10px 16px",
                              borderRadius: 10,
                              border: "none",
                              background: quizIdx >= quiz.length - 1 ? C.border : C.accent,
                              color: quizIdx >= quiz.length - 1 ? C.muted : "#fff",
                              fontWeight: 700,
                              cursor: quizIdx >= quiz.length - 1 ? "not-allowed" : "pointer",
                            }}
                          >
                            Next Question
                          </button>
                          {quizIdx === quiz.length - 1 ? (
                            <button
                              onClick={submitQuizSession}
                              disabled={answeredCount < quiz.length || quizSubmitted}
                              style={{
                                padding: studyActionPadding,
                                borderRadius: 10,
                                border: "none",
                                background: answeredCount < quiz.length || quizSubmitted ? C.border : C.accent,
                                color: answeredCount < quiz.length || quizSubmitted ? C.muted : "#fff",
                                fontWeight: 700,
                                cursor: answeredCount < quiz.length || quizSubmitted ? "not-allowed" : "pointer",
                              }}
                            >
                              Submit Quiz
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {quizSubmitted ? (
                      <div
                        style={{
                          marginTop: 16,
                          borderRadius: 18,
                          padding: 18,
                          background: C.panelNeutral,
                          border: `1px solid ${C.panelNeutralDark}`,
                        }}
                      >
                        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
                          Quiz Results
                        </div>
                        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: studyBodySize }}>
                          <div>Answered: <strong>{answeredCount}</strong></div>
                          <div>Correct: <strong>{correctCount}</strong></div>
                          <div>
                            Score: <strong>{quiz.length ? Math.round((correctCount / quiz.length) * 100) : 0}%</strong>
                          </div>
                        </div>
                        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => setQuizIdx((value) => Math.max(value - 1, 0))}
                            disabled={quizIdx === 0}
                            style={{
                              padding: studyActionPadding,
                              borderRadius: 10,
                              border: `1px solid ${C.border}`,
                              background: quizIdx === 0 ? C.border : C.surface,
                              color: quizIdx === 0 ? C.muted : C.text,
                              fontWeight: 700,
                              cursor: quizIdx === 0 ? "not-allowed" : "pointer",
                            }}
                          >
                            Previous
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuizIdx((value) => Math.min(value + 1, quiz.length - 1))}
                            disabled={quizIdx >= quiz.length - 1}
                            style={{
                              padding: studyActionPadding,
                              borderRadius: 10,
                              border: "none",
                              background: quizIdx >= quiz.length - 1 ? C.border : C.accent,
                              color: quizIdx >= quiz.length - 1 ? C.muted : "#fff",
                              fontWeight: 700,
                              cursor: quizIdx >= quiz.length - 1 ? "not-allowed" : "pointer",
                            }}
                          >
                            Next Question
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuizAnswerSheetOpen((value) => !value)}
                            style={{
                              padding: studyActionPadding,
                              borderRadius: 10,
                              border: `1px solid ${C.border}`,
                              background: C.surface,
                              color: C.text,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            {quizAnswerSheetOpen ? "Hide Answer Sheet" : "Review Answer Sheet"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              startRemediationMode({
                                id: uid(),
                                mode: "quiz",
                                subject: subject || quizItem?.subject || "",
                                topic: topicFilter || quizItem?.topic || "",
                                questions: quiz,
                                correctCount,
                                answeredCount,
                              })
                            }
                            disabled={answeredCount < quiz.length}
                            style={{
                              padding: studyActionPadding,
                              borderRadius: 10,
                              border: `1px solid ${C.border}`,
                              background: answeredCount < quiz.length ? C.border : C.surface,
                              color: answeredCount < quiz.length ? C.muted : C.text,
                              fontWeight: 700,
                              cursor: answeredCount < quiz.length ? "not-allowed" : "pointer",
                            }}
                          >
                            Build Remediation Set
                          </button>
                          <button
                            type="button"
                            onClick={returnToReviewFilters}
                            style={{
                              padding: studyActionPadding,
                              borderRadius: 10,
                              border: `1px solid ${C.border}`,
                              background: C.surface,
                              color: C.text,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Choose Another Topic
                          </button>
                        </div>
                        <div style={{ marginTop: 12, fontSize: studyBodySize, lineHeight: 1.7 }}>
                          <div><strong>Your answer:</strong> {getQuestionOptions(quizItem).find((option) => getSelectedOptionIds(quizItem).includes(option.id))?.text || "No answer saved"}</div>
                          <div><strong>Correct answer:</strong> {quizItem.correctAnswer}</div>
                          <div><strong>Rationale:</strong> {quizItem.rationale}</div>
                          <div><strong>Memory tip:</strong> {quizItem.notes}</div>
                        </div>
                        {quizAnswerSheetOpen ? (
                          <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
                            {quiz.map((item, index) => {
                              const isCorrect = scoreQuestion(item) === 1;
                              return (
                                <div
                                  key={`${item.id || "quiz-sheet"}-${index}`}
                                  style={{
                                    padding: isMobile ? "14px 16px" : "16px 18px",
                                    borderRadius: 16,
                                    background: C.surface,
                                    border: `1px solid ${isCorrect ? "#10B981" : "#F43F5E"}`,
                                  }}
                                >
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                                    <Badge label={`Q ${index + 1}`} color="blue" />
                                    <Badge label={item.subject} color="gray" />
                                    <Badge label={isCorrect ? "Correct" : "Review"} color={isCorrect ? "green" : "red"} />
                                  </div>
                                  <div style={{ fontSize: studyBodySize, fontWeight: 700, lineHeight: 1.55 }}>{item.prompt}</div>
                                  <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                                    <div style={{ fontSize: studyMetaSize, color: C.muted }}>
                                      Your answer: <strong style={{ color: C.text }}>{getQuestionOptions(item).find((option) => getSelectedOptionIds(item).includes(option.id))?.text || "No answer saved"}</strong>
                                    </div>
                                    <div style={{ fontSize: studyMetaSize, color: C.muted }}>
                                      Correct answer: <strong style={{ color: C.text }}>{item.correctAnswer}</strong>
                                    </div>
                                    <div style={{ fontSize: studyBodySize, color: C.text, lineHeight: 1.7 }}>
                                      <strong>Rationale:</strong> {item.rationale}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
              </ErrorBoundary>
            ) : null}

            {mode === "simulation" ? (
              <ErrorBoundary label="Simulation exam" onReset={() => queueModeChange("simulation")} onBack={() => queueModeChange("dashboard")}>
              <div style={panelStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>Simulation Exam</div>
                    <div style={{ fontSize: 12, color: C.muted, maxWidth: 720 }}>
                      Build a mixed board-style exam across the full CareDrop bank. Gemini helps expand parts of the set so the simulation feels broader and closer to a real long-form review exam.
                    </div>
                  </div>
                  {!simulationLaunchOpen && simulationQuestions.length ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setSimulationLaunchOpen(true);
                          setStatusMessage("Choose a new simulation length to start another exam.");
                        }}
                        style={{
                          padding: "10px 16px",
                          borderRadius: 10,
                          border: `1px solid ${C.border}`,
                          background: C.surface,
                          color: C.text,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        New Simulation Setup
                      </button>
                    </div>
                  ) : null}
                </div>

                {simulationLaunchOpen ? (
                  <div
                    style={{
                      marginTop: 18,
                      border: `1px solid ${C.border}`,
                      borderRadius: 20,
                      padding: width < 720 ? 20 : 24,
                      background: darkMode ? softSurface : "#FBFAF7",
                    }}
                  >
                    <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.04em", color: C.text }}>
                      Choose your simulation length first
                    </div>
                    <div style={{ marginTop: 10, fontSize: 14, color: C.muted, lineHeight: 1.8, maxWidth: 760 }}>
                      The exam stays hidden until you choose a format. Pick a mixed 50-, 100-, or 500-question simulation to launch a broader board-style exam experience across the full review bank.
                    </div>
                    <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {SIMULATION_SIZE_OPTIONS.map((value) => (
                        <button
                          key={`launch-${value}`}
                          type="button"
                          onClick={() => generateSimulationExam(value)}
                          disabled={apiLoading}
                          style={{
                            minWidth: 130,
                            padding: "12px 16px",
                            borderRadius: 12,
                            border: simulationSize === value ? "none" : `1px solid ${C.border}`,
                            background: simulationSize === value ? C.accent : C.surface,
                            color: simulationSize === value ? "#fff" : C.text,
                            fontWeight: 800,
                            cursor: apiLoading ? "not-allowed" : "pointer",
                          }}
                        >
                          {apiLoading && simulationSize === value ? "Preparing..." : `Start ${value}`}
                        </button>
                      ))}
                    </div>
                    <div style={{ marginTop: 16, fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                      Once the exam is generated, your answers will be saved as you move between questions. Results and explanations will only appear after the final submission.
                    </div>
                    {simulationQuestions.length ? (
                      <div
                        style={{
                          marginTop: 16,
                          padding: "14px 16px",
                          borderRadius: 14,
                          background: cardSurface,
                          border: `1px solid ${C.border}`,
                        }}
                      >
                        <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>
                          A simulation is already loaded
                        </div>
                        <div style={{ marginTop: 6, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
                          You currently have a {simulationSize}-question simulation in memory. You can resume it or replace it with a new one.
                        </div>
                        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => setSimulationLaunchOpen(false)}
                            style={{
                              padding: "10px 14px",
                              borderRadius: 10,
                              border: `1px solid ${C.border}`,
                              background: C.surface,
                              color: C.text,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Resume Current Simulation
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : !simulationItem ? (
                  <div
                    style={{
                      marginTop: 18,
                      border: `1px dashed ${C.border}`,
                      borderRadius: 18,
                      padding: 24,
                      background: darkMode ? softSurface : "#FBFAF7",
                      color: C.muted,
                      lineHeight: 1.7,
                    }}
                  >
                    Choose one of the simulation options above to start the exam.
                  </div>
                ) : (
                  <>
                    <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 999, background: darkMode ? C.border : "#E8E4DC", overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${simulationProgressPercent}%`,
                            height: "100%",
                            background: "linear-gradient(90deg, #2D6A4F 0%, #7BCB9A 100%)",
                          }}
                        />
                      </div>
                      <div style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>
                        {simulationAnsweredCount}/{simulationQuestions.length} answered
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 14,
                        display: "grid",
                        gap: 8,
                        gridTemplateColumns: width < 900 ? "repeat(6, minmax(0, 1fr))" : "repeat(10, minmax(0, 1fr))",
                      }}
                    >
                      {simulationQuestions
                        .slice(
                          simulationQuestions.length <= 100
                            ? 0
                            : clamp(simulationIdx - 49, 0, Math.max(simulationQuestions.length - 100, 0)),
                          simulationQuestions.length <= 100
                            ? simulationQuestions.length
                            : clamp(simulationIdx - 49, 0, Math.max(simulationQuestions.length - 100, 0)) + 100
                        )
                        .map((item, localIndex) => {
                        const startIndex =
                          simulationQuestions.length <= 100
                            ? 0
                            : clamp(simulationIdx - 49, 0, Math.max(simulationQuestions.length - 100, 0));
                        const index = startIndex + localIndex;
                        const answered = item.userAnswer !== null;
                        const active = index === simulationIdx;
                        return (
                          <button
                            key={`${item.id || "simulation"}-${index}-jump`}
                            type="button"
                            onClick={() => setSimulationIdx(index)}
                            style={{
                              padding: "8px 0",
                              borderRadius: 10,
                              border: active ? `1px solid ${C.accent}` : `1px solid ${item.flagged ? C.amber : C.border}`,
                              background: active ? C.accentLight : item.flagged ? C.amberLight : C.surface,
                              color: active ? C.accent : item.flagged ? C.amber : answered ? C.text : C.muted,
                              fontWeight: 800,
                              cursor: "pointer",
                              fontSize: 12,
                            }}
                            title={item.flagged ? "Flagged for review" : answered ? "Answered" : "Unanswered"}
                          >
                            {index + 1}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", fontSize: studyMetaSize, color: C.muted }}>
                      <div>{simulationFlaggedCount} flagged</div>
                      <div>{simulationQuestions.length - simulationAnsweredCount} unanswered</div>
                      <div>{simulationSize}-item target</div>
                      {simulationQuestions.length > 100 ? <div>Palette shows the questions around your current position</div> : null}
                    </div>

                    <div
                      key={`${simulationItem.id || "simulation"}-${simulationIdx}`}
                      style={{
                        marginTop: 18,
                        background: C.panelNeutralAlt,
                        borderRadius: 18,
                        border: `1px solid ${C.panelNeutralDark}`,
                        padding: studySectionPadding,
                      }}
                    >
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                        <Badge label={`Q ${simulationIdx + 1} / ${simulationQuestions.length}`} color="blue" />
                        <Badge label={simulationItem.subject} color="gray" />
                        <Badge label={simulationItem.topic} color="gray" />
                        <Badge
                          label={simulationItem.difficulty}
                          color={
                            simulationItem.difficulty === "hard"
                              ? "red"
                              : simulationItem.difficulty === "medium"
                                ? "amber"
                                : "green"
                          }
                        />
                        {simulationItem.flagged ? <Badge label="flagged" color="amber" /> : null}
                      </div>

                      <div style={{ fontSize: studyMetaSize, color: C.faint, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
                        Simulation Question
                      </div>
                      <div style={{ fontSize: studyQuestionSize, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.45 }}>
                        {simulationItem.prompt}
                      </div>
                      {getQuestionType(simulationItem) === QUESTION_TYPES.MULTIPLE_RESPONSE ? (
                        <div style={{ marginTop: 10, fontSize: studyMetaSize, color: C.amber, fontWeight: 700 }}>
                          Select all that apply
                        </div>
                      ) : null}

                      <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                        {getQuestionOptions(simulationItem).map((option, optionIndex) => {
                          const selected = getSelectedOptionIds(simulationItem).includes(option.id);
                          const correct = getCorrectOptionIds(simulationItem).includes(option.id);
                          const background = simulationSubmitted && correct
                            ? successSurface
                            : simulationSubmitted && selected && !correct
                              ? errorSurface
                              : C.panelNeutralAlt;
                          const borderColor = simulationSubmitted && correct
                            ? successBorder
                            : simulationSubmitted && selected && !correct
                              ? errorBorder
                              : C.panelNeutralDark;

                          return (
                            <label
                              key={`${simulationItem.id || "simulation"}-${simulationIdx}-${option.id}-${optionIndex}`}
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 12,
                                padding: isMobile ? "12px 14px" : "13px 15px",
                                borderRadius: 14,
                                background,
                                border: `1px solid ${borderColor}`,
                                cursor: simulationSubmitted ? "default" : "pointer",
                                fontSize: studyBodySize,
                                lineHeight: 1.55,
                              }}
                            >
                              <input
                                type={getQuestionType(simulationItem) === QUESTION_TYPES.MULTIPLE_RESPONSE ? "checkbox" : "radio"}
                                name={`simulation-${simulationItem.id}`}
                                checked={selected}
                                disabled={simulationSubmitted}
                                onChange={() => handleSimulationAnswer(option.id)}
                                style={{ marginTop: 4 }}
                              />
                              <span>{option.text}</span>
                            </label>
                          );
                        })}
                      </div>

                      {!simulationSubmitted ? (
                        <div
                          style={{
                            marginTop: 14,
                            padding: isMobile ? 12 : 14,
                            borderRadius: 14,
                            background: C.panelNeutral,
                            border: `1px solid ${C.panelNeutralDark}`,
                            fontSize: studyBodySize,
                            color: C.muted,
                            lineHeight: 1.7,
                          }}
                        >
                          {isQuestionAnswered(simulationItem)
                            ? "Answer saved. You can still move back and change it before the final submission."
                            : "Choose an answer, move to the next question, and review any item before the final submission."}
                        </div>
                      ) : null}

                      {!simulationSubmitted ? (
                        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            onClick={toggleSimulationFlag}
                            style={{
                              padding: studyActionPadding,
                              borderRadius: 10,
                              border: `1px solid ${simulationItem.flagged ? C.amber : C.border}`,
                              background: simulationItem.flagged ? C.amberLight : C.surface,
                              color: simulationItem.flagged ? C.amber : C.text,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            {simulationItem.flagged ? "Unflag Question" : "Flag for Review"}
                          </button>
                        </div>
                      ) : null}

                      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => setSimulationIdx((value) => Math.max(0, value - 1))}
                            disabled={simulationIdx === 0}
                            style={{
                              padding: studyActionPadding,
                              borderRadius: 10,
                              border: `1px solid ${C.border}`,
                              background: C.surface,
                              color: simulationIdx === 0 ? C.faint : C.text,
                              fontWeight: 700,
                              cursor: simulationIdx === 0 ? "not-allowed" : "pointer",
                            }}
                          >
                            Previous
                          </button>
                          <button
                            type="button"
                            onClick={() => setSimulationIdx((value) => Math.min(value + 1, simulationQuestions.length - 1))}
                            disabled={simulationIdx >= simulationQuestions.length - 1}
                            style={{
                              padding: studyActionPadding,
                              borderRadius: 10,
                              border: "none",
                              background: simulationIdx >= simulationQuestions.length - 1 ? C.border : C.accent,
                              color: simulationIdx >= simulationQuestions.length - 1 ? C.muted : "#fff",
                              fontWeight: 700,
                              cursor: simulationIdx >= simulationQuestions.length - 1 ? "not-allowed" : "pointer",
                            }}
                          >
                            Next Question
                          </button>
                        </div>
                        {!simulationSubmitted && simulationIdx === simulationQuestions.length - 1 ? (
                          <button
                            type="button"
                            onClick={submitSimulationExam}
                            disabled={simulationAnsweredCount < simulationQuestions.length}
                            style={{
                              padding: studyActionPadding,
                              borderRadius: 10,
                              border: "none",
                              background: simulationAnsweredCount < simulationQuestions.length ? C.border : "#1A2740",
                              color: simulationAnsweredCount < simulationQuestions.length ? C.muted : "#fff",
                              fontWeight: 700,
                              cursor: simulationAnsweredCount < simulationQuestions.length ? "not-allowed" : "pointer",
                            }}
                          >
                            Submit Simulation
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 16,
                        borderRadius: 18,
                        padding: studySectionPadding,
                        background: C.panelNeutral,
                        border: `1px solid ${C.panelNeutralDark}`,
                      }}
                    >
                      {!simulationSubmitted ? (
                        <>
                          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Simulation Overview</div>
                          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: studyBodySize }}>
                            <div>Answered: <strong>{simulationAnsweredCount}</strong></div>
                            <div>Remaining: <strong>{Math.max(simulationQuestions.length - simulationAnsweredCount, 0)}</strong></div>
                            <div>Current target: <strong>{simulationSize} questions</strong></div>
                          </div>
                          <div style={{ marginTop: 10, fontSize: studyBodySize, color: C.muted, lineHeight: 1.7 }}>
                            Answers stay hidden while the simulation is active so the flow feels closer to an actual long-form exam. Move back through earlier questions anytime if you want to review or change an answer before the final submit on the last item.
                          </div>
                          {unansweredSimulationNumbers.length && simulationIdx === simulationQuestions.length - 1 ? (
                            <div
                            style={{
                              marginTop: 10,
                              padding: "10px 12px",
                              borderRadius: 12,
                              background: warningSurface,
                              border: `1px solid ${warningBorder}`,
                              fontSize: 13,
                              lineHeight: 1.7,
                              color: C.text,
                              }}
                            >
                              You still need to answer question{unansweredSimulationNumbers.length === 1 ? "" : "s"} {unansweredSimulationNumbers.join(", ")} before you can submit this simulation.
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              gap: 16,
                              flexWrap: "wrap",
                            }}
                          >
                            <div>
                              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Simulation Results</div>
                              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, maxWidth: 760 }}>
                              {simulationUsedAi
                                ? "This mixed simulation combined the CareDrop bank with Gemini-generated expansion to make the exam feel broader and closer to a real board-style review."
                                : "This mixed simulation came from the CareDrop bank and is now saved in Review History for later review."}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSimulationAnswerSheetOpen((value) => !value)}
                              style={{
                                padding: "10px 14px",
                                borderRadius: 10,
                                border: `1px solid ${C.border}`,
                                background: C.surface,
                                color: C.text,
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              {simulationAnswerSheetOpen ? "Hide answer sheet" : "View answer sheet"}
                            </button>
                          </div>

                          <div
                            style={{
                              marginTop: 14,
                              display: "grid",
                              gap: 12,
                              gridTemplateColumns: width < 760 ? "1fr" : "repeat(4, minmax(0, 1fr))",
                            }}
                          >
                            {[
                              { label: "Overall score", value: `${simulationScore}%`, hint: `${simulationCorrectCount}/${simulationQuestions.length} correct` },
                              { label: "Answered", value: `${simulationAnsweredCount}`, hint: "Full exam submitted" },
                              { label: "Correct", value: `${simulationCorrectCount}`, hint: "Strong answers recorded" },
                              { label: "Incorrect", value: `${simulationIncorrectCount}`, hint: "Items to review again" },
                            ].map((item) => (
                              <div
                                key={item.label}
                                style={{
                                  padding: "14px 16px",
                                  borderRadius: 14,
                                  background: C.surface,
                                  border: `1px solid ${C.border}`,
                                }}
                              >
                                <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, marginBottom: 6 }}>{item.label}</div>
                                <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.04em" }}>{item.value}</div>
                                <div style={{ marginTop: 6, fontSize: 12, color: C.muted }}>{item.hint}</div>
                              </div>
                            ))}
                          </div>

                          <div
                            style={{
                              marginTop: 14,
                              display: "grid",
                              gap: 12,
                              gridTemplateColumns: width < 920 ? "1fr" : "1fr 1fr",
                            }}
                          >
                            <div
                              style={{
                                padding: "16px 18px",
                                borderRadius: 16,
                                background: C.surface,
                                border: `1px solid ${C.border}`,
                              }}
                            >
                              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>Subjects You Handled Well</div>
                              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                                {simulationStrongSubjects.length
                                  ? simulationStrongSubjects.map((item) => `${item.subject} (${item.percent}%)`).join(" • ")
                                  : "No single subject clearly pulled ahead in this exam yet. Your score is still spread across the full mixed review."}
                              </div>
                            </div>
                            <div
                              style={{
                                padding: "16px 18px",
                                borderRadius: 16,
                                background: C.surface,
                                border: `1px solid ${C.border}`,
                              }}
                            >
                              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>Subjects To Review Again</div>
                              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                                {simulationWeakSubjects.length
                                  ? simulationWeakSubjects.map((item) => `${item.subject} (${item.percent}%)`).join(" • ")
                                  : "No major weak subject cluster stood out in this run. Review the answer sheet to see the exact items you missed."}
                              </div>
                            </div>
                          </div>

                          <div
                            style={{
                              marginTop: 14,
                              display: "grid",
                              gap: 10,
                              gridTemplateColumns: width < 920 ? "1fr" : "repeat(2, minmax(0, 1fr))",
                            }}
                          >
                            {simulationSubjectBreakdown.map((item) => (
                              <div
                                key={item.subject}
                                style={{
                                  padding: "14px 16px",
                                  borderRadius: 14,
                                  background: C.surface,
                                  border: `1px solid ${C.border}`,
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                                  <div style={{ fontSize: 14, fontWeight: 800 }}>{item.subject}</div>
                                  <Badge label={`${item.percent}%`} color={item.percent >= 75 ? "green" : item.percent >= 60 ? "amber" : "red"} />
                                </div>
                                <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: darkMode ? C.border : "#E8E4DC", overflow: "hidden" }}>
                                  <div
                                    style={{
                                      width: `${item.percent}%`,
                                      height: "100%",
                                      background: item.percent >= 75 ? "#2D6A4F" : item.percent >= 60 ? "#E7A93B" : "#C1121F",
                                    }}
                                  />
                                </div>
                                <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>
                                  {item.correct}/{item.total} correct
                                </div>
                              </div>
                            ))}
                          </div>

                          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={() =>
                                startRemediationMode({
                                  id: uid(),
                                  mode: "simulation",
                                  subject: "Mixed Review",
                                  topic: "",
                                  questions: simulationQuestions,
                                  correctCount: simulationCorrectCount,
                                  answeredCount: simulationAnsweredCount,
                                })
                              }
                              style={{
                                padding: "10px 14px",
                                borderRadius: 12,
                                border: "none",
                                background: C.accent,
                                color: "#fff",
                                fontWeight: 800,
                                cursor: "pointer",
                              }}
                            >
                              Build Remediation Quiz
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSimulationLaunchOpen(true);
                                setStatusMessage("Choose a new simulation length to start another exam.");
                              }}
                              style={{
                                padding: "10px 14px",
                                borderRadius: 12,
                                border: `1px solid ${C.border}`,
                                background: C.surface,
                                color: C.text,
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              New Simulation Setup
                            </button>
                          </div>

                          {simulationAnswerSheetOpen ? (
                            <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
                              {simulationQuestions.map((item, index) => {
                                const review = buildQuestionReview(item);
                                const isCorrect = review.isCorrect;
                                return (
                                  <div
                                    key={`${item.id || "simulation-sheet"}-${index}`}
                                    style={{
                                      padding: "16px 18px",
                                      borderRadius: 16,
                                      background: C.surface,
                                      border: `1px solid ${isCorrect ? "#10B981" : "#F43F5E"}`,
                                    }}
                                  >
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                                      <Badge label={`Q ${index + 1}`} color="blue" />
                                      <Badge label={item.subject} color="gray" />
                                      <Badge label={item.topic} color="gray" />
                                      {item.flagged ? <Badge label="flagged" color="amber" /> : null}
                                      <Badge
                                        label={isCorrect ? "Correct" : "Incorrect"}
                                        color={isCorrect ? "green" : "red"}
                                      />
                                    </div>
                                    <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.45 }}>{item.prompt}</div>
                                    {review.type === QUESTION_TYPES.MULTIPLE_RESPONSE ? (
                                      <div style={{ marginTop: 8, fontSize: 12, color: C.amber, fontWeight: 700 }}>
                                        Select all that apply
                                      </div>
                                    ) : null}
                                    <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                                      <div style={{ fontSize: 13, color: C.muted }}>
                                        Your answer: <strong style={{ color: C.text }}>{review.selectedOptions.length ? review.selectedOptions.map((option) => option.text).join(", ") : "No answer saved"}</strong>
                                      </div>
                                      <div style={{ fontSize: 13, color: C.muted }}>
                                        Correct answer: <strong style={{ color: C.text }}>{review.correctOptions.map((option) => option.text).join(", ") || item.correctAnswer}</strong>
                                      </div>
                                      {review.missedCorrectOptions.length ? (
                                        <div style={{ fontSize: 13, color: C.muted }}>
                                          Missed correct options: <strong style={{ color: C.text }}>{review.missedCorrectOptions.map((option) => option.text).join(", ")}</strong>
                                        </div>
                                      ) : null}
                                      {review.incorrectSelectedOptions.length ? (
                                        <div style={{ fontSize: 13, color: C.muted }}>
                                          Incorrectly selected: <strong style={{ color: C.text }}>{review.incorrectSelectedOptions.map((option) => option.text).join(", ")}</strong>
                                        </div>
                                      ) : null}
                                      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7 }}>
                                        <strong>Rationale:</strong> {item.rationale}
                                      </div>
                                      {review.options.some((option) => option.rationale) ? (
                                        <div style={{ display: "grid", gap: 6 }}>
                                          {review.options
                                            .filter((option) => option.rationale)
                                            .map((option) => (
                                              <div key={`${item.id || "simulation-rationale"}-${option.id}`} style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                                                <strong style={{ color: C.text }}>{option.text}:</strong> {option.rationale}
                                              </div>
                                            ))}
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
              </ErrorBoundary>
            ) : null}

            {mode === "notes" ? (
              <ErrorBoundary label="Notes and upload" onReset={() => queueModeChange("notes")} onBack={() => queueModeChange("dashboard")}>
              <div style={panelStyle}>
                <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>Notes & Upload</div>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 18 }}>
                  Upload a reviewer, PDF, or image, then use the extracted text for flashcards, quizzes, and reviewer notes.
                </div>

                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  style={{
                    border: `2px dashed ${dragActive ? C.accentMid : C.border}`,
                    borderRadius: 16,
                    padding: 22,
                    textAlign: "center",
                    background: dragActive ? C.accentLight : darkMode ? softSurface : "#FBFAF7",
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, color: C.accent }}>DROPZONE</div>
                  <label
                    style={{
                      padding: "10px 18px",
                      borderRadius: 10,
                      background: C.accent,
                      color: "#fff",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-block",
                    }}
                  >
                    Choose File
                    <input
                      type="file"
                      accept=".doc,.docx,.pdf,.jpg,.jpeg,.png,.webp,.txt"
                      onChange={handleFileUpload}
                      style={{ display: "none" }}
                    />
                  </label>
                  <div style={{ marginTop: 10, fontSize: 12, color: C.muted }}>
                    {uploadedFileName || "No file uploaded yet."}
                  </div>
                  {uploadedFileName ? (
                    <div style={{ marginTop: 10, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                      <label
                        style={{
                          padding: "8px 14px",
                          borderRadius: 10,
                          background: C.surface,
                          border: `1px solid ${C.border}`,
                          color: C.text,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Replace File
                        <input
                          type="file"
                          accept=".doc,.docx,.pdf,.jpg,.jpeg,.png,.webp,.txt"
                          onChange={handleFileUpload}
                          style={{ display: "none" }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={removeUploadedSource}
                        style={{
                          padding: "8px 14px",
                          borderRadius: 10,
                          border: `1px solid ${C.red}`,
                          background: C.redLight,
                          color: C.red,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Remove File
                      </button>
                    </div>
                  ) : null}
                  <div style={{ marginTop: 6, fontSize: 12, color: C.faint }}>
                    Supported: DOC, DOCX, PDF, JPG, JPEG, PNG, WEBP, TXT
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 12,
                      color: uploadState === "failed" ? C.red : uploadState === "success" ? C.accent : C.muted,
                    }}
                  >
                    {uploadState === "idle"
                      ? "Idle"
                      : uploadState === "uploading"
                        ? "Uploading and extracting..."
                        : uploadState === "success"
                          ? "Upload successful"
                          : "Upload failed"}
                  </div>
                  {uploadError ? (
                    <div style={{ marginTop: 6, fontSize: 12, color: C.red }}>
                      {uploadError}
                    </div>
                  ) : null}
                </div>

                <textarea
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  placeholder="Paste lecture notes, reviewer text, or high-yield concepts here..."
                  style={{
                    width: "100%",
                    minHeight: 160,
                    marginTop: 16,
                    padding: "14px 16px",
                    borderRadius: 14,
                    border: `1px solid ${C.border}`,
                    background: C.bg,
                    fontSize: 14,
                    color: C.text,
                    resize: "vertical",
                    lineHeight: 1.7,
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                />

                <div style={{ display: "grid", gap: 10, gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, max-content))", marginTop: 14 }}>
                  <button
                    onClick={generateSummary}
                    disabled={apiLoading || !studyText.trim()}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 10,
                      border: "none",
                      background: apiLoading || !studyText.trim() ? C.border : C.accent,
                      color: apiLoading || !studyText.trim() ? C.muted : "#fff",
                      fontWeight: 700,
                      cursor: apiLoading || !studyText.trim() ? "not-allowed" : "pointer",
                    }}
                  >
                    Gemini Summary
                  </button>
                  <button
                    onClick={generateClaudeFlashcards}
                    disabled={apiLoading || !studyText.trim()}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 10,
                      border: `1px solid ${C.border}`,
                      background: apiLoading || !studyText.trim() ? C.border : C.surface,
                      color: apiLoading || !studyText.trim() ? C.muted : C.text,
                      fontWeight: 700,
                      cursor: apiLoading || !studyText.trim() ? "not-allowed" : "pointer",
                    }}
                  >
                    Gemini Flashcards
                  </button>
                  <button
                    onClick={generateQuiz}
                    disabled={apiLoading || !studyText.trim()}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 10,
                      border: `1px solid ${C.border}`,
                      background: apiLoading || !studyText.trim() ? C.border : C.surface,
                      color: apiLoading || !studyText.trim() ? C.muted : C.text,
                      fontWeight: 700,
                      cursor: apiLoading || !studyText.trim() ? "not-allowed" : "pointer",
                    }}
                  >
                    Gemini Quiz
                  </button>
                </div>

                <div
                  style={{
                    marginTop: 18,
                    background: darkMode ? softSurface : "#FBFAF7",
                    borderRadius: 16,
                    border: `1px solid ${C.border}`,
                    padding: 18,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, marginBottom: 10 }}>
                    Reviewer Summary
                  </div>
                  <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.8 }}>
                    {summaryText}
                  </div>
                </div>
                {uploadedText ? (
                  <div
                    style={{
                      marginTop: 16,
                      background: darkMode ? softSurface : "#FBFAF7",
                      borderRadius: 16,
                      border: `1px solid ${C.border}`,
                      padding: 18,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, marginBottom: 10 }}>
                      Extracted Content Preview
                    </div>
                    <div
                      style={{
                        whiteSpace: "pre-wrap",
                        fontSize: 13,
                        lineHeight: 1.8,
                        maxHeight: 220,
                        overflowY: "auto",
                      }}
                    >
                      {uploadedText.slice(0, 4000)}
                    </div>
                  </div>
                ) : null}
              </div>
              </ErrorBoundary>
            ) : null}

            {mode === "planner" ? (
              <ErrorBoundary label="Planner" onReset={() => queueModeChange("planner")} onBack={() => queueModeChange("dashboard")}>
              <div style={panelStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    marginBottom: 18,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17 }}>Study Planner</div>
                    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
                      Turn weak areas and upcoming study blocks into named targets with due dates you can revisit.
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Badge label={`${plannerCompletionRate}% complete`} color={plannerCompletionRate >= 60 ? "green" : plannerCompletionRate >= 30 ? "amber" : "gray"} />
                    {overduePlannerItems.length ? <Badge label={`${overduePlannerItems.length} overdue`} color="red" /> : null}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: width < 1100 ? "1fr" : "minmax(320px, 0.9fr) minmax(0, 1.1fr)",
                    gap: 18,
                  }}
                >
                  <div
                    style={{
                      borderRadius: 18,
                      border: `1px solid ${C.border}`,
                            background: darkMode ? softSurface : "#FCFBF8",
                      padding: 18,
                    }}
                  >
                    <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Add Planner Item
                    </div>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        addPlannerItem();
                      }}
                      style={{ marginTop: 12, display: "grid", gap: 10 }}
                    >
                      <input
                        value={plannerTitle}
                        onChange={(event) => setPlannerTitle(event.target.value)}
                        placeholder="What do you want to complete?"
                        style={{ ...selectStyle, cursor: "text" }}
                      />
                      <select value={plannerSubject} onChange={(event) => setPlannerSubject(event.target.value)} style={selectStyle}>
                        <option value="">No subject tag</option>
                        {SUBJECT_OPTIONS.filter((value) => value !== "Mixed Review").map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                      <select value={plannerMode} onChange={(event) => setPlannerMode(event.target.value)} style={selectStyle}>
                        {PLANNER_MODE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={plannerDueDate}
                        onChange={(event) => setPlannerDueDate(event.target.value)}
                        style={{ ...selectStyle, cursor: "pointer" }}
                      />
                      <textarea
                        value={plannerNotes}
                        onChange={(event) => setPlannerNotes(event.target.value)}
                        placeholder="Optional note, strategy, or reminder"
                        style={{
                          ...selectStyle,
                          minHeight: 96,
                          resize: "vertical",
                          cursor: "text",
                        }}
                      />
                      <button
                        type="submit"
                        style={{
                          padding: "11px 14px",
                          borderRadius: 12,
                          border: "none",
                          background: C.accent,
                          color: "#fff",
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        Save planner item
                      </button>
                    </form>
                  </div>

                  <div style={{ display: "grid", gap: 14 }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: width < 900 ? "1fr" : "repeat(3, minmax(0, 1fr))",
                        gap: 12,
                      }}
                    >
                      {[
                        {
                          label: "Open items",
                          value: plannerOpenItems.length,
                          helper: plannerRecommendedItem ? plannerSummaryLine : "Nothing active yet",
                        },
                        {
                          label: "Completed",
                          value: plannerItems.filter((item) => item.completed).length,
                          helper: plannerItems.length ? "Tracked in this account" : "No completions yet",
                        },
                        {
                          label: "Overdue",
                          value: overduePlannerItems.length,
                          helper: overduePlannerItems.length ? "Needs rescheduling or completion" : "Everything is on schedule",
                        },
                      ].map((item) => (
                        <div
                          key={item.label}
                          style={{
                            borderRadius: 16,
                            padding: 16,
                            border: `1px solid ${C.border}`,
                            background: darkMode ? softSurface : "#FCFBF8",
                          }}
                        >
                          <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                            {item.label}
                          </div>
                          <div style={{ marginTop: 10, fontSize: 30, fontWeight: 900 }}>{item.value}</div>
                          <div style={{ marginTop: 6, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>{item.helper}</div>
                        </div>
                      ))}
                    </div>

                    <div
                      style={{
                        borderRadius: 18,
                        border: `1px solid ${C.border}`,
                        background: darkMode ? softSurface : "#FCFBF8",
                        padding: 18,
                      }}
                    >
                      <div style={{ fontSize: 12, color: C.faint, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Active Planner Items
                      </div>
                      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                        {plannerItems.length ? (
                          sortByDateAsc(plannerItems, "dueDate").map((item) => (
                            <div
                              key={item.id}
                              style={{
                                padding: "14px 16px",
                                borderRadius: 14,
                                background: cardSurface,
                                border: `1px solid ${item.completed ? "#BEE5C9" : item.dueDate && item.dueDate < formatDateKey(new Date()) ? "#F5B9C0" : C.border}`,
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                  <Badge label={item.completed ? "complete" : "active"} color={item.completed ? "green" : item.dueDate && item.dueDate < formatDateKey(new Date()) ? "red" : "blue"} />
                                  {item.subject ? <Badge label={item.subject} color="gray" /> : null}
                                </div>
                                <div style={{ fontSize: 12, color: C.muted }}>
                                  {item.dueDate ? `Due ${item.dueDate}` : "No due date"}
                                </div>
                              </div>
                              <div style={{ marginTop: 10, fontSize: 15, fontWeight: 800 }}>{item.title}</div>
                              {item.notes ? (
                                <div style={{ marginTop: 6, fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                                  {item.notes}
                                </div>
                              ) : null}
                              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  onClick={() => togglePlannerItem(item.id)}
                                  style={{
                                    padding: "8px 12px",
                                    borderRadius: 10,
                                    border: `1px solid ${C.border}`,
                                    background: C.surface,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  {item.completed ? "Mark open" : "Mark complete"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => addPlannerItemToCalendar(item)}
                                  style={{
                                    padding: "8px 12px",
                                    borderRadius: 10,
                                    border: `1px solid ${C.border}`,
                                    background: C.surface,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  Add to calendar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (item.subject) {
                                      setSubject(item.subject);
                                    }
                                    setMode(item.mode === "mixed" ? "flashcard" : item.mode);
                                    setStatusMessage("Planner target opened in the workspace.");
                                  }}
                                  style={{
                                    padding: "8px 12px",
                                    borderRadius: 10,
                                    border: `1px solid ${C.accentMid}`,
                                    background: C.accentLight,
                                    color: C.accent,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  Open workspace
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deletePlannerItem(item.id)}
                                  style={{
                                    padding: "8px 12px",
                                    borderRadius: 10,
                                    border: `1px solid ${C.red}`,
                                    background: C.redLight,
                                    color: C.red,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                            No planner items yet. Add one on the left to turn the dashboard into a real study plan.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              </ErrorBoundary>
            ) : null}

            {mode === "history" ? (
              <ErrorBoundary label="Review history" onReset={() => queueModeChange("history")} onBack={() => queueModeChange("dashboard")}>
              <div style={panelStyle}>
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>
                  Review History
                </div>
                {reviewSessions.length ? (
                  <div style={{ display: "grid", gap: 12 }}>
                    {reviewSessions.map((session) => (
                      <SavedSessionCard
                        key={session.id}
                        session={session}
                        onOpen={openSavedQuiz}
                        onDelete={deleteSavedQuiz}
                        buildSessionLabel={buildSessionLabel}
                      />
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                    Submit a flashcard or quiz session and it will appear here for review later.
                  </div>
                )}
              </div>
              </ErrorBoundary>
            ) : null}
          </div>
        </div>
      </div>

      <footer
        style={{
          borderTop: `1px solid ${C.border}`,
          padding: "16px 24px",
          textAlign: "center",
          color: C.faint,
          fontSize: 12,
        }}
      >
        CareDrop | subject-focused flashcards and quizzes with Gemini support
      </footer>

      {statusMessage ? (
        <div
          style={{
            position: "fixed",
            right: isMobile ? 12 : 18,
            left: isMobile ? 12 : "auto",
            bottom: isMobile ? 76 : 82,
            zIndex: 95,
            maxWidth: isMobile ? "none" : 360,
            padding: "12px 14px",
            borderRadius: 14,
            border: `1px solid ${C.accentMid}`,
            background: C.accentLight,
            color: C.text,
            boxShadow: "0 16px 30px rgba(45, 106, 79, 0.16)",
            opacity: statusFading ? 0 : 1,
            transform: statusFading ? "translateY(12px)" : "translateY(0)",
            transition: "opacity 0.8s ease, transform 0.8s ease",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800, color: C.accent, marginBottom: 4 }}>
            Success
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            {statusMessage}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          setRequestStatus("");
          setRequestModalOpen(true);
        }}
        style={{
          position: "fixed",
          right: isMobile ? 12 : 18,
          bottom: isMobile ? 12 : 18,
          zIndex: 90,
          border: "none",
          borderRadius: 999,
          background: C.accent,
          color: "#fff",
          width: isMobile ? 48 : 52,
          height: isMobile ? 48 : 52,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 14px 26px rgba(45, 106, 79, 0.28)",
          cursor: "pointer",
        }}
        title="Open request or report form"
        aria-label="Open request or report form"
      >
        <MessageCircleMore size={22} />
      </button>

      {hasRequestDraft && !requestModalOpen ? (
        <div
          style={{
            position: "fixed",
            right: isMobile ? 12 : 18,
            bottom: isMobile ? 68 : 78,
            zIndex: 89,
            padding: "8px 12px",
            borderRadius: 999,
            background: warningSurface,
            border: `1px solid ${warningBorder}`,
            color: C.amber,
            fontSize: 12,
            fontWeight: 700,
            boxShadow: "0 12px 24px rgba(231, 111, 0, 0.12)",
          }}
        >
          Draft saved
        </div>
      ) : null}

      <RequestModal
        open={requestModalOpen}
        onClose={() => setRequestModalOpen(false)}
        onDiscard={() => {
          clearRequestDraft();
          setRequestModalOpen(false);
        }}
        requestType={requestType}
        setRequestType={setRequestType}
        requestName={requestName}
        setRequestName={setRequestName}
        requestMessage={requestMessage}
        setRequestMessage={setRequestMessage}
        onSubmit={submitRequest}
        requestHistory={requestHistory}
        requestStatus={requestStatus}
        requestLoading={requestLoading}
        requestConfigured={requestConfigured}
      />
    </div>
  );
}


