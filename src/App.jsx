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
  SIMULATION_BLOCK_SIZE,
  SIMULATION_DURATION_MINUTES,
  SIMULATION_FULL_SIZE,
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
  TIMER_LIMITS,
  TIMER_PRESETS,
  buildTimerSessionMeta,
  clampTimerMinutes,
  formatDuration,
  getPacingInsight,
} from "./services/timerUtils";
import {
  buildDueFlashcardPool,
  getDueTodayCount,
  updateCardSchedule,
} from "./services/spacedRepetition";
import {
  buildQuestionReview,
  getCorrectOptionIds,
  getCorrectAnswerText,
  getQuestionOptions,
  getQuestionRationaleText,
  getQuestionType,
  getSelectedOptionIds,
  isQuestionAnswered,
  normalizeQuestions,
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

const EXAM_ITEMS_PER_BUCKET = BANK_ITEMS_PER_BUCKET * 2;
const QUESTION_BANK = buildExpandedBank(SEED_QUESTION_BANK);
const SIMULATION_QUESTION_BANK = buildExpandedBank(SEED_QUESTION_BANK, EXAM_ITEMS_PER_BUCKET);
const ALL_BANK_ENTRIES = Object.entries(QUESTION_BANK).flatMap(([subject, entries]) =>
  entries.map((entry) => ({ ...entry, subject }))
);
const ALL_SIMULATION_BANK_ENTRIES = Object.entries(SIMULATION_QUESTION_BANK).flatMap(([subject, entries]) =>
  entries.map((entry) => ({ ...entry, subject, bankType: "simulation" }))
);
const SUBJECT_OPTIONS = [...Object.keys(QUESTION_BANK), "Mixed Review"];
const DIFFICULTIES = ["All", "easy", "medium", "hard"];
const ENCOURAGEMENTS = [
  "You've got this, future RN.",
  "One focused session at a time still counts.",
  "Read the stem slowly. Your nursing judgment is getting stronger.",
  "Progress matters more than perfection.",
  "Every review session helps you understand what needs more focus.",
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

const PNLE_DOMAIN_ORDER = ["NP1", "NP2", "NP3", "NP4", "NP5"];
const PNLE_DOMAIN_DETAILS = {
  NP1: {
    label: "Block 1",
    title: "Review Block 1: Community Health",
    shortTitle: "Community Health",
    weight: 20,
    subjects: ["Community Health"],
  },
  NP2: {
    label: "Block 2",
    title: "Review Block 2: Healthy/At-Risk Mother and Child",
    shortTitle: "Mother & Child",
    weight: 20,
    subjects: ["Maternal & Newborn", "Pediatrics"],
  },
  NP3: {
    label: "Block 3",
    title: "Review Block 3: Physiologic and Psychosocial Alterations Part A",
    shortTitle: "Alterations A",
    weight: 20,
    subjects: ["Medical-Surgical", "Psychiatric Nursing", "Pharmacology", "Fundamentals"],
  },
  NP4: {
    label: "Block 4",
    title: "Review Block 4: Physiologic and Psychosocial Alterations Part B",
    shortTitle: "Alterations B",
    weight: 20,
    subjects: ["Medical-Surgical", "Pharmacology", "Fundamentals"],
  },
  NP5: {
    label: "Block 5",
    title: "Review Block 5: Physiologic and Psychosocial Alterations Part C",
    shortTitle: "Alterations C",
    weight: 20,
    subjects: ["Medical-Surgical", "Pharmacology", "Leadership & Management"],
  },
};

const PNLE_DOMAIN_FALLBACK_BY_SUBJECT = {
  "Community Health": "NP1",
  "Maternal & Newborn": "NP2",
  Pediatrics: "NP2",
};

const PNLE_INTEGRATED_DISCIPLINES = [
  "Anatomy and Physiology",
  "Nutrition and Diet Therapy",
  "Pathophysiology",
  "Parasitology and Microbiology",
  "Pharmacology and Therapeutics",
];

const PNLE_COMPETENCY_DETAILS = {
  "Safe and Quality Nursing Care": { cluster: "Patient Care Competencies" },
  Communication: { cluster: "Patient Care Competencies" },
  "Collaboration and Teamwork": { cluster: "Patient Care Competencies" },
  "Health Education": { cluster: "Patient Care Competencies" },
  "Legal Responsibilities": { cluster: "Empowering Competencies" },
  "Ethico-Moral-Spiritual Responsibilities": { cluster: "Empowering Competencies" },
  "Personal and Professional Development": { cluster: "Empowering Competencies" },
  "Management of Resources and Environment": { cluster: "Enabling Competencies" },
  "Records Management": { cluster: "Enabling Competencies" },
  Research: { cluster: "Enhancing Competencies" },
  "Quality Improvement": { cluster: "Enhancing Competencies" },
};

const PNLE_COMPETENCY_AREAS = Object.keys(PNLE_COMPETENCY_DETAILS);

function getPnleDomainDetail(domain) {
  return PNLE_DOMAIN_DETAILS[domain] || PNLE_DOMAIN_DETAILS.NP1;
}

function getCompetencyCluster(area) {
  return PNLE_COMPETENCY_DETAILS[area]?.cluster || "Patient Care Competencies";
}

function inferIntegratedDiscipline(item) {
  const source = normalize(
    `${item?.subject || ""} ${item?.topic || ""} ${item?.prompt || item?.question || item?.stem || item?.q || ""} ${item?.correctAnswer || item?.answer || item?.a || ""}`
  );

  if (/\b(drug|medication|dose|insulin|digoxin|heparin|warfarin|morphine|antibiotic|anticoagulant|diuretic|therapeutic|toxicity|antidote)\b/.test(source)) {
    return "Pharmacology and Therapeutics";
  }

  if (/\b(pathophysiology|shock|sepsis|heart failure|copd|asthma|stroke|renal|liver|pancrea|diabetes|thyroid|acid base|electrolyte|bleeding)\b/.test(source)) {
    return "Pathophysiology";
  }

  if (/\b(nutrition|diet|feeding|breastfeeding|protein|calorie|fluid intake|npo|diet therapy)\b/.test(source)) {
    return "Nutrition and Diet Therapy";
  }

  if (/\b(infection|microbiology|parasite|parasitology|communicable|tuberculosis|dengue|asepsis|isolation|transmission)\b/.test(source)) {
    return "Parasitology and Microbiology";
  }

  return "Anatomy and Physiology";
}

function inferCompetencyArea(item) {
  const source = normalize(
    `${item?.subject || ""} ${item?.topic || ""} ${item?.prompt || item?.question || item?.stem || item?.q || ""} ${item?.correctAnswer || item?.answer || item?.a || ""}`
  );

  if (/\b(research|evidence based|evidence-based|study design|data collection|sample|hypothesis)\b/.test(source)) {
    return "Research";
  }

  if (/\b(quality improvement|quality assurance|near miss|sentinel|root cause|safety process|audit|benchmark)\b/.test(source)) {
    return "Quality Improvement";
  }

  if (/\b(teach|teaching|education|instruction|discharge|understands|health promotion)\b/.test(source)) {
    return "Health Education";
  }

  if (/\b(communicat|therapeutic|handoff|endorsement|closed loop|conflict|de-escalation)\b/.test(source)) {
    return "Communication";
  }

  if (/\b(collaboration|team|delegate|assign|uap|staff|supervis|scope)\b/.test(source)) {
    return "Collaboration and Teamwork";
  }

  if (/\b(ethical|ethico|moral|spiritual|confidentiality|advocacy|values|belief)\b/.test(source)) {
    return "Ethico-Moral-Spiritual Responsibilities";
  }

  if (/\b(professional development|continuing education|competence|accountability|standards of practice|scope of practice)\b/.test(source)) {
    return "Personal and Professional Development";
  }

  if (/\b(legal|consent|negligence|liability|malpractice|incident report|informed consent)\b/.test(source)) {
    return "Legal Responsibilities";
  }

  if (/\b(resource|environment|staffing|assignment|management|shortage|triage|disaster|equipment)\b/.test(source)) {
    return "Management of Resources and Environment";
  }

  if (/\b(record|documentation|chart|incident report)\b/.test(source)) {
    return "Records Management";
  }

  return "Safe and Quality Nursing Care";
}

function inferPnleDomain(item, fallbackIndex = 0) {
  const explicitDomain = String(item?.pnleDomain || item?.npDomain || "").trim().toUpperCase();
  if (PNLE_DOMAIN_ORDER.includes(explicitDomain)) {
    return explicitDomain;
  }

  const subject = String(item?.subject || "");

  const source = normalize(
    `${subject} ${item?.topic || ""} ${item?.prompt || item?.question || item?.stem || item?.q || ""} ${item?.correctAnswer || item?.answer || item?.a || ""}`
  );

  if (/\b(community|public health|doh|epidemiology|immunization|vaccine|barangay|family planning|home visit|outbreak|surveillance|prevention|health center|communicable)\b/.test(source)) {
    return "NP1";
  }

  if (/\b(maternal|pregnan|labor|postpartum|newborn|pediatric|child|infant|toddler|adolescent|family|mother|fetal|prenatal|breastfeeding|apgar)\b/.test(source)) {
    return "NP2";
  }

  if (/\b(psych|mental|therapeutic communication|depression|anxiety|schizophrenia|bipolar|suicide|substance|cardiac|respiratory|oxygen|shock|chest pain|asthma|copd|airway|mi|heart failure)\b/.test(source)) {
    return "NP3";
  }

  if (/\b(neuro|stroke|seizure|endocrine|diabetes|thyroid|renal|kidney|fluid|electrolyte|acid base|gi|liver|pancrea|bowel|abg|siadh|diabetes insipidus)\b/.test(source)) {
    return "NP4";
  }

  if (/\b(oncology|cancer|perioperative|surgery|trauma|emergency|critical care|infection|sepsis|orthopedic|reproductive|immune|hematologic|burn|delegation|management|quality|legal|ethical|records|research)\b/.test(source)) {
    return "NP5";
  }

  if (PNLE_DOMAIN_FALLBACK_BY_SUBJECT[subject]) {
    return PNLE_DOMAIN_FALLBACK_BY_SUBJECT[subject];
  }

  return PNLE_DOMAIN_ORDER[fallbackIndex % PNLE_DOMAIN_ORDER.length];
}

function attachPnleDomain(item, index = 0) {
  const pnleDomain = inferPnleDomain(item, index);
  const detail = getPnleDomainDetail(pnleDomain);
  const competencyArea = item.competencyArea || inferCompetencyArea(item);
  const competencyCluster = item.competencyCluster || getCompetencyCluster(competencyArea);
  return {
    ...item,
    pnleDomain,
    pnleDomainTitle: detail.title,
    pnleDomainShortTitle: detail.shortTitle,
    integratedDiscipline: item.integratedDiscipline || inferIntegratedDiscipline(item),
    competencyArea,
    competencyCluster,
  };
}

function attachPnleDomains(items) {
  return (Array.isArray(items) ? items : []).map((item, index) => attachPnleDomain(item, index));
}

function buildBalancedPnleSimulationSet(pool, targetSize, usedPrompts = [], recentPrompts = []) {
  const target = Math.max(Number(targetSize) || 0, 1);
  const uniquePool = uniqueBy(attachPnleDomains(pool), (item) => normalize(item.prompt || item.question || item.stem || item.q || item.id));
  const used = new Set((Array.isArray(usedPrompts) ? usedPrompts : []).map((value) => normalize(value)));
  const recent = new Set((Array.isArray(recentPrompts) ? recentPrompts : []).map((value) => normalize(value)));
  const selected = [];
  const selectedKeys = new Set();
  const basePerDomain = Math.floor(target / PNLE_DOMAIN_ORDER.length);
  const extraSlots = target % PNLE_DOMAIN_ORDER.length;

  function getKey(item) {
    return normalize(item.prompt || item.question || item.stem || item.q || item.id);
  }

  function takeFrom(candidates, limit) {
    for (const item of shuffle(candidates)) {
      const key = getKey(item);
      if (!key || selectedKeys.has(key)) {
        continue;
      }

      selected.push(item);
      selectedKeys.add(key);

      if (selected.length >= target || selected.filter((selectedItem) => selectedItem.pnleDomain === item.pnleDomain).length >= limit) {
        return;
      }
    }
  }

  for (const domain of PNLE_DOMAIN_ORDER) {
    const desired = basePerDomain + (PNLE_DOMAIN_ORDER.indexOf(domain) < extraSlots ? 1 : 0);
    const domainPool = uniquePool.filter((item) => item.pnleDomain === domain);
    takeFrom(domainPool.filter((item) => !used.has(getKey(item)) && !recent.has(getKey(item))), desired);
    if (selected.filter((item) => item.pnleDomain === domain).length < desired) {
      takeFrom(domainPool.filter((item) => !used.has(getKey(item))), desired);
    }
    if (selected.filter((item) => item.pnleDomain === domain).length < desired) {
      takeFrom(domainPool, desired);
    }
  }

  if (selected.length < Math.min(target, uniquePool.length)) {
    for (const item of shuffle(uniquePool.filter((candidate) => !used.has(getKey(candidate)) && !recent.has(getKey(candidate))))) {
      const key = getKey(item);
      if (key && !selectedKeys.has(key)) {
        selected.push(item);
        selectedKeys.add(key);
      }
      if (selected.length >= target) break;
    }
  }

  if (selected.length < Math.min(target, uniquePool.length)) {
    for (const item of shuffle(uniquePool)) {
      const key = getKey(item);
      if (key && !selectedKeys.has(key)) {
        selected.push(item);
        selectedKeys.add(key);
      }
      if (selected.length >= target) break;
    }
  }

  if (selected.length >= target || !uniquePool.length) {
    return selected.slice(0, target);
  }

  while (selected.length < target) {
    const recycled = attachPnleDomain(uniquePool[selected.length % uniquePool.length], selected.length);
    selected.push({ ...recycled, id: `${recycled.id || "pnle-recycled"}-${selected.length}` });
  }

  return selected.slice(0, target);
}

function buildFullPnleSimulationSet(pool, usedPrompts = [], recentPrompts = []) {
  const normalizedPool = attachPnleDomains(pool);
  const selected = [];
  const selectedKeys = new Set();

  function getKey(item) {
    return normalize(item.prompt || item.question || item.stem || item.q || item.id);
  }

  for (const domain of PNLE_DOMAIN_ORDER) {
    const domainPool = normalizedPool.filter((item) => item.pnleDomain === domain);
    const cleanDomainPool = uniqueBy(domainPool, getKey);
    const freshDomainPool = cleanDomainPool.filter((item) => {
      const key = getKey(item);
      return key && !selectedKeys.has(key);
    });
    const block = selectSessionItems(
      freshDomainPool.length ? freshDomainPool : cleanDomainPool,
      SIMULATION_BLOCK_SIZE,
      usedPrompts,
      recentPrompts,
      getKey
    );

    for (const item of block) {
      const key = getKey(item);
      selected.push(item);
      if (key) {
        selectedKeys.add(key);
      }
    }

    if (block.length < SIMULATION_BLOCK_SIZE) {
      const fill = selectSessionItems(
        normalizedPool.filter((item) => item.pnleDomain !== domain),
        SIMULATION_BLOCK_SIZE - block.length,
        [...usedPrompts, ...selected.map(getKey)],
        recentPrompts,
        getKey
      );
      selected.push(...fill.map((item) => ({ ...item, pnleDomain: domain, pnleDomainTitle: getPnleDomainDetail(domain).title, pnleDomainShortTitle: getPnleDomainDetail(domain).shortTitle })));
    }
  }

  return selected.slice(0, SIMULATION_FULL_SIZE).map((item, index) => {
    const domainIndex = Math.floor(index / SIMULATION_BLOCK_SIZE);
    const domain = PNLE_DOMAIN_ORDER[domainIndex] || inferPnleDomain(item, index);
    const detail = getPnleDomainDetail(domain);
    return {
      ...attachPnleDomain(item, index),
      pnleDomain: domain,
      pnleDomainTitle: detail.title,
      pnleDomainShortTitle: detail.shortTitle,
      simulationBlockQuestion: (index % SIMULATION_BLOCK_SIZE) + 1,
    };
  });
}

function waitForUiPaint() {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.setTimeout(resolve, 0);
    });
  });
}

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
    "- In knowledge-check items, assess instability and safety risks before routine care.",
    "",
    "Knowledge Check Traps",
    "- Do not choose an intervention before assessment when the stem asks for the first nursing action.",
    "- Watch for answers that are possible but not the safest, most immediate, or most patient-centered.",
    "",
    "High-Yield Review Points",
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
  return sanitizeLegacyReviewLanguage(prompt)
    .replace(/^\s*(question\s*:|q\s*:)\s*/i, "")
    .replace(/\b(answer\s*:|instruction\s*:|directions\s*:).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeLegacyReviewLanguage(text) {
  return String(text || "")
    .replace(/\bPNLE\s+takeaway\b/gi, "key review takeaway")
    .replace(/\bPNLE[-\s]*style\b/gi, "knowledge-check")
    .replace(/\bPRC\s*NLE\b/gi, "nursing knowledge")
    .replace(/\bNurse Licensure Examination\b/gi, "nursing knowledge review")
    .replace(/\blicensure\s+exam(?:ination)?\b/gi, "knowledge check")
    .replace(/\bboard[-\s]*review\b/gi, "focused review")
    .replace(/\bboard[-\s]*style\b/gi, "clinical judgment")
    .replace(/\bboard\s+recall\s*:\s*/gi, "Focused review: ")
    .replace(/\bwhat to remember for boards\b/gi, "what to remember")
    .replace(/\bfor boards\b/gi, "for review")
    .replace(/\bboards\b/gi, "review")
    .replace(/\bPNLE\b/g, "review")
    .replace(/\bNLE\b/g, "review");
}

function cleanClinicalCueForPrompt(prompt) {
  return cleanQuizPrompt(prompt)
    .replace(/^\s*(board recall|focused review|nursing priority check|prc nle review|clinical decision point|exam coaching prompt|knowledge check)\s*:\s*/i, "")
    .replace(/\b(the stem asks|review stem|the key cue is|clinical cue|stem)\s*:\s*/gi, "")
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

function inferClinicalTrap(prompt, entry = {}) {
  const primaryValue = normalize(`${prompt || ""} ${entry.topic || ""} ${entry.subject || ""}`);
  const answerValue = normalize(`${entry.a || entry.answer || entry.correctAnswer || ""}`);
  const value = `${primaryValue} ${answerValue}`.trim();

  if (/\b(airway|stridor|breath|oxygen|dyspnea|respiratory|choking|aspiration)\b/.test(primaryValue)) {
    return "airway-breathing";
  }

  if (/\b(delegat|assign|uap|nursing assistant|supervis|staff|scope)\b/.test(primaryValue)) {
    return "delegation";
  }

  if (/\b(medication|drug|dose|digoxin|insulin|heparin|warfarin|morphine|opioid|anticoagulant|antibiotic|administer)\b/.test(primaryValue)) {
    return "medication-safety";
  }

  if (/\b(infection|isolation|asepsis|sterile|transmission|communicable|tuberculosis|dengue|sepsis)\b/.test(primaryValue)) {
    return "infection-control";
  }

  if (/\b(lab|electrolyte|potassium|sodium|calcium|abg|ph|paco2|hco3|fluid|dehydrat|shock|bleeding|perfusion|neuro|mentation|stroke|seizure|consciousness)\b/.test(primaryValue)) {
    return "physiologic-instability";
  }

  if (/\b(teaching|discharge|instruction|education|understands|learn|home care)\b/.test(primaryValue)) {
    return "patient-teaching";
  }

  if (/\b(first|priority|initial|most important|safest|immediate)\b/.test(primaryValue)) {
    return "priority-setting";
  }

  if (/\b(airway|stridor|breath|oxygen|dyspnea|respiratory|choking|aspiration)\b/.test(value)) return "airway-breathing";
  if (/\b(delegat|assign|uap|nursing assistant|supervis|staff|scope)\b/.test(value)) return "delegation";
  if (/\b(medication|drug|dose|digoxin|insulin|heparin|warfarin|morphine|opioid|anticoagulant|antibiotic|administer)\b/.test(value)) return "medication-safety";
  if (/\b(lab|electrolyte|potassium|sodium|calcium|abg|ph|paco2|hco3|fluid|dehydrat|shock|bleeding|perfusion|neuro|mentation|stroke|seizure|consciousness)\b/.test(value)) return "physiologic-instability";
  if (/\b(infection|isolation|asepsis|sterile|transmission|communicable|tuberculosis|dengue|sepsis)\b/.test(value)) return "infection-control";
  return "clinical-judgment";
}

function getTrapLabel(trap) {
  return {
    "airway-breathing": "ABC priority",
    delegation: "delegation and scope",
    "medication-safety": "medication safety",
    "infection-control": "infection control",
    "physiologic-instability": "physiologic instability",
    "patient-teaching": "patient teaching",
    "priority-setting": "priority setting",
    "clinical-judgment": "clinical judgment",
  }[trap] || "clinical judgment";
}

function buildClinicalStem(entry, requestedTopic = "", variantIndex = 0) {
  const topic = String(requestedTopic || entry.topic || "the client situation").trim();
  const subject = entry.subject || "nursing review";
  const cue = cleanClinicalCueForPrompt(entry.q || "");
  const trap = inferClinicalTrap(cue || entry.q, entry);
  const client = [
    "an adult client",
    "a newly admitted client",
    "a postoperative client",
    "a client on the medical-surgical unit",
    "a client in a community clinic",
    "a client receiving nursing care",
  ][variantIndex % 6];
  const scenarioCue = cue && cue.length > 18 ? cue.replace(/[?]+$/g, "") : `the stem centers on ${topic}`;
  const frames = [
    `The nurse is caring for ${client}. The key cue is: ${scenarioCue}. Which action best reflects safe ${getTrapLabel(trap)}?`,
    `A clinical judgment item describes ${client} with a concern related to ${topic}. ${scenarioCue}. Which response should the nurse prioritize?`,
    `During endorsement, the nurse notes this cue: ${scenarioCue}. Which option is the best nursing judgment for ${subject}?`,
    `The nurse must choose between several reasonable actions for ${topic}. Based on this cue, ${scenarioCue}, what is the safest next response?`,
  ];

  return frames[variantIndex % frames.length].replace(/\s+/g, " ").trim();
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

function buildTrapDistractors(prompt, correctAnswer, entry = {}) {
  const trap = inferClinicalTrap(prompt, entry);
  const banks = {
    "airway-breathing": [
      "Document the finding and reassess after completing routine care.",
      "Offer oral fluids and allow the client to rest before escalating.",
      "Ask a nursing assistant to obtain supplies while delaying focused respiratory assessment.",
      "Provide reassurance first because anxiety can worsen breathing discomfort.",
    ],
    delegation: [
      "Assign the unstable assessment to assistive personnel and review the findings later.",
      "Delegate teaching because the task is routine once instructions are written.",
      "Ask the least busy staff member to decide which client should be seen first.",
      "Complete documentation before clarifying whether the assigned task is within scope.",
    ],
    "medication-safety": [
      "Administer the medication now and check the focused assessment afterward.",
      "Hold the medication without assessing the client or notifying the prescriber.",
      "Give the dose through the fastest available route to prevent delay.",
      "Rely on the previous shift's assessment because the order is already prescribed.",
    ],
    "infection-control": [
      "Delay isolation measures until the diagnosis is confirmed by the provider.",
      "Use standard precautions only because transmission risk is not yet proven.",
      "Prioritize visitor comfort before applying the indicated transmission precautions.",
      "Place the client with another client who has a similar symptom pattern.",
    ],
    "physiologic-instability": [
      "Continue routine monitoring because one abnormal cue may be temporary.",
      "Offer comfort measures before reassessing perfusion, vital signs, or oxygenation.",
      "Wait for the next scheduled assessment before escalating the change.",
      "Focus on documenting the trend before intervening for possible deterioration.",
    ],
    "patient-teaching": [
      "Give all discharge instructions at once and ask the client to read them later.",
      "Assume understanding because the client nods during the explanation.",
      "Emphasize general wellness advice instead of the warning signs in the stem.",
      "Ask family members to interpret teaching without checking client understanding.",
    ],
    "priority-setting": [
      "Address the easiest task first to reduce the number of remaining concerns.",
      "Choose the comfort-focused action before assessing possible instability.",
      "Delay the priority action until all routine data have been collected.",
      "Select the option that is helpful but does not address the most immediate risk.",
    ],
    "clinical-judgment": [
      "Choose the familiar routine action even though the stem gives a higher-risk cue.",
      "Delay focused assessment until the client reports worsening symptoms.",
      "Prioritize documentation before acting on the most concerning cue.",
      "Select the action that may be correct later but is not the safest first response.",
    ],
  };

  return (banks[trap] || banks["clinical-judgment"]).filter((option) => normalize(option) !== normalize(correctAnswer));
}

function buildFallbackDistractors(prompt, correctAnswer, entry = {}) {
  const scope = inferQuestionScope(prompt);
  const trimmedCorrect = alignTextToPrompt(prompt, correctAnswer);
  const trapDistractors = buildTrapDistractors(prompt, trimmedCorrect, entry);

  if (scope === "specific") {
    return uniqueBy([
      ...trapDistractors,
      "Delay the priority action until more symptoms appear.",
      "Continue routine monitoring before addressing the priority cue.",
      "Delegate the judgment call before completing the nursing assessment.",
    ].filter((option) => normalize(option) !== normalize(trimmedCorrect)), (option) => normalizeOptionKey(option));
  }

  return uniqueBy([
    ...trapDistractors,
    "Continue routine care before reassessing the client.",
    "Delay the priority intervention until the provider evaluates the client.",
    "Focus on a secondary comfort measure before addressing the main clinical need.",
  ].filter((option) => normalize(option) !== normalize(trimmedCorrect)), (option) => normalizeOptionKey(option));
}

function buildOptionRationale(option, correctAnswer, prompt, entry = {}) {
  const isCorrect = normalize(option) === normalize(correctAnswer);
  const trap = getTrapLabel(inferClinicalTrap(prompt, entry));

  if (isCorrect) {
    return `Correct: this option best matches the stem cue and protects the client using ${trap} logic.`;
  }

  if (/delay|wait|later|scheduled|routine monitoring|reassess after/i.test(option)) {
    return `Incorrect: this delays action even though the stem points to a priority or possible deterioration.`;
  }

  if (/delegate|assign|assistant|uap|staff/i.test(option)) {
    return `Incorrect: this shifts nursing judgment or assessment outside the safest scope for the cue given.`;
  }

  if (/document|documentation|chart/i.test(option)) {
    return `Incorrect: documentation matters after the nurse addresses the immediate clinical priority.`;
  }

  if (/reassurance|comfort|oral fluids|visitor|wellness/i.test(option)) {
    return `Incorrect: this may be supportive later, but it does not address the highest-risk cue first.`;
  }

  return `Incorrect: this is plausible, but it is less appropriate because it misses the safest priority in the stem.`;
}

function buildOptionObjects(prompt, correctAnswer, optionTexts, entry = {}) {
  return optionTexts.map((text, index) => ({
    id: ["a", "b", "c", "d", "e"][index] || `option-${index + 1}`,
    text,
    rationale: buildOptionRationale(text, correctAnswer, prompt, entry),
  }));
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
  const subject = entry.subject || "nursing review";
  const cue = cleanClinicalCueForPrompt(entry.q || entry.question || "");
  const cueText = cue ? ` The review cue is: ${cue}.` : "";
  return `Correct Answer Explanation: ${answer} fits ${topic} in ${subject} because it keeps the learner focused on the safest assessment cue, priority action, or patient-teaching point.${cueText}`;
}

function buildFlashcardTakeaway(entry, answer) {
  const topic = entry.topic || "general review";
  return `Key Takeaway: For ${topic}, connect the cue to the safest nursing priority, core assessment finding, or first-line intervention. Anchor point: ${answer}`;
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
    `In ${topicLabel}, the safest review approach is to identify the priority finding, reassess focused signs, and avoid routine care when the stem suggests instability.`,
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
    `What is the safest nursing priority when a knowledge-check item focuses on ${topicLabel}?`,
    `Which assessment cue should guide care first for ${topicLabel}?`,
    `What should the nurse remember when reviewing ${topicLabel}?`,
    `Which patient-safety point is most important for ${topicLabel}?`,
    `How should a student approach a clinical judgment question about ${topicLabel}?`,
    `Which nursing judgment best supports safe care for ${topicLabel}?`,
    `What common knowledge-check trap should be avoided when answering about ${topicLabel}?`,
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
  const subject = entry.subject || "nursing review";
  const trap = getTrapLabel(inferClinicalTrap(prompt, entry));
  return `Correct Answer Explanation: ${correctAnswer} is best because it matches the stem cue and applies ${trap} reasoning for ${topic} in ${subject}. Incorrect Options Explanation: The distractors are designed as tempting but less safe choices, such as delaying action, choosing routine care, delegating nursing judgment, or treating a secondary concern before the priority cue. Key Takeaway: identify the highest-risk cue first, then choose the option that protects safety, follows assessment-before-intervention when appropriate, and fits the nurse's scope.`;
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

function getAllSimulationEntries() {
  return ALL_SIMULATION_BANK_ENTRIES;
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
      "The learner wants a full topic-focused set. If the uploaded notes are thin, expand with safe nursing review knowledge while staying centered on the requested topic.",
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
  const cue = cleanClinicalCueForPrompt(entry.q || "");
  const cueText = cue || `a cue related to ${topic}`;
  const prompts = [
    entry.q,
    `In ${subject}, what should this ${topic} cue make you remember: ${cueText}?`,
    `Which safe nursing takeaway best matches this ${topic} cue: ${cueText}?`,
    `What priority idea should you connect to this ${topic} review cue: ${cueText}?`,
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

function buildFocusedFlashcardVariants(entry, requestedTopic) {
  const focusTopic = String(requestedTopic || "").trim();
  if (!focusTopic) {
    return buildFlashcardVariants(entry);
  }

  const subject = entry.subject;
  const baseId = `${subject}-${normalize(focusTopic)}-${normalize(entry.q)}`;
  const answer = alignTextToPrompt(entry.q, entry.a, 20, 30) || entry.a;
  const focusedEntry = { ...entry, topic: focusTopic };
  const rationale = buildFlashcardRationale(focusedEntry, answer);
  const notes = buildFlashcardTakeaway(focusedEntry, answer);
  const cue = cleanClinicalCueForPrompt(entry.q || "");
  const cueText = cue || `a cue related to ${focusTopic}`;
  const prompts = [
    `For ${focusTopic}, what should this review cue make you remember: ${cueText}?`,
    `Which assessment or safety point best matches this ${focusTopic} cue: ${cueText}?`,
    `What is the key review takeaway for ${focusTopic} from this cue: ${cueText}?`,
    `How should a nurse connect this ${focusTopic} cue to safe clinical judgment: ${cueText}?`,
  ];

  return uniqueBy(
    prompts.map((prompt, index) => ({
      id: `${baseId}-focus-card-${index + 1}`,
      subject,
      difficulty: entry.difficulty || "medium",
      topic: focusTopic,
      question: prompt,
      answer,
      rationale,
      notes,
    })),
    (item) => item.id
  );
}

function buildQuizVariants(entry, requestedTopic = "") {
  const alignedAnswer = alignTextToPrompt(entry.q, entry.a, 18, 26) || entry.a;
  const sourceCue = cleanClinicalCueForPrompt(entry.q || "");
  const topicLabel = String(requestedTopic || entry.topic || "this nursing concept").trim();
  const focusedEntry = { ...entry, topic: topicLabel };
  const scenarioStems = [0, 1, 2, 3].map((index) => buildClinicalStem(focusedEntry, topicLabel, index));

  return [
    {
      prompt: requestedTopic
        ? scenarioStems[0]
        : buildClinicalStem(focusedEntry, topicLabel, 0),
      rationale: buildQuizRationale(focusedEntry, scenarioStems[0], alignedAnswer),
    },
    {
      prompt: scenarioStems[1],
      rationale: buildQuizRationale(focusedEntry, scenarioStems[1], alignedAnswer),
    },
    {
      prompt: scenarioStems[2],
      rationale: buildQuizRationale(focusedEntry, scenarioStems[2], alignedAnswer),
    },
    {
      prompt: scenarioStems[3],
      rationale: buildQuizRationale(focusedEntry, scenarioStems[3], alignedAnswer),
    },
  ];
}

function finalizeQuizOptions(prompt, correctAnswer, options, subject, difficulty, topic) {
  const alignedCorrect = alignTextToPrompt(prompt, correctAnswer, 18, 26);
  const contextEntry = { subject, difficulty, topic, a: alignedCorrect };
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

  for (const option of buildFallbackDistractors(prompt, alignedCorrect, contextEntry)) {
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
  const sameTopicPool = uniqueBy(
    shuffle(
      pool.filter((item) => {
        if (normalize(item.a) === normalize(entry.a)) {
          return false;
        }
        return entry.topic && item.topic && normalize(item.topic) === normalize(entry.topic);
      })
    ),
    (item) => normalize(item.a)
  );
  const sameSubjectPool = uniqueBy(
    shuffle(
      pool.filter((item) => {
        if (normalize(item.a) === normalize(entry.a)) {
          return false;
        }
        if (sameTopicPool.some((topicItem) => normalize(topicItem.a) === normalize(item.a))) {
          return false;
        }
        return entry.subject && item.subject && normalize(item.subject) === normalize(entry.subject);
      })
    ),
    (item) => normalize(item.a)
  );
  const fallbackOptions = buildFallbackDistractors(entry.q, entry.a, entry);

  const options = [
    ...sameTopicPool.map((item) => item.a),
    ...fallbackOptions,
    ...sameSubjectPool.map((item) => item.a),
  ].slice(0, 10);
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
      for (const variant of shuffle(buildQuizVariants(entry, topic))) {
        const normalizedPrompt = normalize(variant.prompt);
        if (!normalizedPrompt || (!ignoreUsedPrompts && usedPrompts.includes(normalizedPrompt))) {
          continue;
        }

        const correctAnswer = alignTextToPrompt(variant.prompt, entry.a, 18, 26);
        const optionTexts = buildDistractors({ ...entry, q: variant.prompt }, distractorPool);

        questions.push({
          id: `${entry.subject}-${uid()}`,
          subject: entry.subject,
          difficulty: entry.difficulty,
          topic: topic || entry.topic,
          type: QUESTION_TYPES.SINGLE_CHOICE,
          prompt: variant.prompt,
          correctAnswer,
          options: buildOptionObjects(variant.prompt, correctAnswer, optionTexts, entry),
          rationale: variant.rationale,
          notes: `Key takeaway: use ${getTrapLabel(inferClinicalTrap(variant.prompt, entry))} logic before choosing the answer for ${topic || entry.topic}.`,
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
        answer: sanitizeLegacyReviewLanguage(answer),
        rationale: alignTextToPrompt(
          question,
          sanitizeLegacyReviewLanguage(card.rationale) ||
            buildFlashcardRationale({ ...card, subject: nextSubject, topic: topic || card.topic }, answer),
          24,
          48
        ),
        notes: sanitizeLegacyReviewLanguage(
          card.notes || buildFlashcardTakeaway({ ...card, subject: nextSubject, topic: topic || card.topic }, answer)
        ),
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

function sanitizePersistedFlashcards(cards) {
  return (Array.isArray(cards) ? cards : []).map((card) => ({
    ...card,
    question: cleanQuizPrompt(card.question || card.prompt || ""),
    answer: sanitizeLegacyReviewLanguage(card.answer || ""),
    rationale: sanitizeLegacyReviewLanguage(card.rationale || ""),
    notes: sanitizeLegacyReviewLanguage(card.notes || ""),
  }));
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
      const fallbackRationale = buildQuizRationale(
        { ...item, subject: item.subject || subject || "Mixed Review", topic: topic || item.topic || "ai review" },
        prompt,
        correctAnswer
      );
      const rationale =
        item.rationale && typeof item.rationale === "object"
          ? item.rationale
          : alignTextToPrompt(prompt, item.rationale || fallbackRationale, 30, 70);

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
        rationale,
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
          rationale: getQuestionRationaleText(item),
        },
        subject,
        difficulty,
        topic
      ) &&
      matchesGeneratedTopicContent(item, topic)
    );
  }).map((item) =>
    normalizeQuestions([item], {
      source: item.source || "ai",
      allowMultipleResponse,
    })[0]
  );
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

function createDefaultTimerSettings() {
  return {
    flashcard: { timerMode: "untimed", durationMinutes: 10, customMinutes: "" },
    quiz: { timerMode: "untimed", durationMinutes: 15, customMinutes: "" },
    simulation: { timerMode: "timed", durationMinutes: SIMULATION_DURATION_MINUTES, customMinutes: "" },
  };
}

function normalizeTimerSettings(settings) {
  const defaults = createDefaultTimerSettings();
  const source = settings && typeof settings === "object" ? settings : {};

  return Object.keys(defaults).reduce((accumulator, key) => {
    const current = source[key] && typeof source[key] === "object" ? source[key] : {};
    accumulator[key] = {
      timerMode: current.timerMode === "timed" ? "timed" : "untimed",
      durationMinutes: clampTimerMinutes(current.durationMinutes) || defaults[key].durationMinutes,
      customMinutes: current.customMinutes ? String(current.customMinutes) : "",
    };
    return accumulator;
  }, {});
}

function createInactiveTimer() {
  return {
    modeType: "",
    timerMode: "untimed",
    durationMinutes: null,
    startedAt: null,
    endsAt: null,
    endedAt: null,
    isTimerRunning: false,
    timeExpired: false,
    expiredHandled: false,
  };
}

function normalizeActiveTimer(timer) {
  if (!timer || typeof timer !== "object") {
    return createInactiveTimer();
  }

  return {
    ...createInactiveTimer(),
    ...timer,
    timerMode: timer.timerMode === "timed" ? "timed" : "untimed",
    durationMinutes: clampTimerMinutes(timer.durationMinutes) || null,
    isTimerRunning: Boolean(timer.isTimerRunning),
    timeExpired: Boolean(timer.timeExpired),
    expiredHandled: Boolean(timer.expiredHandled),
  };
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
  const [flashcardDeckVersion, setFlashcardDeckVersion] = useState(0);
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
  const [simulationSize, setSimulationSize] = useState(SIMULATION_FULL_SIZE);
  const [simulationUsedAi, setSimulationUsedAi] = useState(false);
  const [simulationAnswerSheetOpen, setSimulationAnswerSheetOpen] = useState(false);
  const [simulationLaunchOpen, setSimulationLaunchOpen] = useState(
    !(safeMode(persisted?.mode) === "simulation" && safeArray(persisted?.simulationQuestions).length)
  );
  const [timerSettings, setTimerSettings] = useState(normalizeTimerSettings(persisted?.timerSettings));
  const [activeTimer, setActiveTimer] = useState(normalizeActiveTimer(persisted?.activeTimer));
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState(null);
  const [timerValidationError, setTimerValidationError] = useState("");
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
        timerSettings,
        activeTimer,
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
      timerSettings,
      activeTimer,
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
    const restoredFlashcards = sanitizePersistedFlashcards(safeArray(snapshot.flashcards));
    setFlashcards(restoredFlashcards);
    setCardIdx(clamp(Number(snapshot.cardIdx || 0), 0, Math.max(restoredFlashcards.length - 1, 0)));
    setCardSchedule(safeObject(snapshot.cardSchedule));
    setFlashcardSessionRatings(safeObject(snapshot.flashcardSessionRatings));
    setFlashcardResponseTimes(safeObject(snapshot.flashcardResponseTimes));
    setFlashcardSessionSubmitted(Boolean(snapshot.flashcardSessionSubmitted));
    setQuiz(normalizeQuestions(safeArray(snapshot.quiz), { source: "restored" }));
    setQuizIdx(clamp(Number(snapshot.quizIdx || 0), 0, Math.max(safeArray(snapshot.quiz).length - 1, 0)));
    setQuizResponseTimes(safeObject(snapshot.quizResponseTimes));
    setQuizSubmitted(Boolean(snapshot.quizSubmitted));
    setQuizAnswerSheetOpen(false);
    setSimulationQuestions(attachPnleDomains(normalizeQuestions(safeArray(snapshot.simulationQuestions), { source: "restored", allowMultipleResponse: true })));
    setSimulationIdx(clamp(Number(snapshot.simulationIdx || 0), 0, Math.max(safeArray(snapshot.simulationQuestions).length - 1, 0)));
    setSimulationResponseTimes(safeObject(snapshot.simulationResponseTimes));
    setSimulationSubmitted(Boolean(snapshot.simulationSubmitted));
    setSimulationSize(SIMULATION_FULL_SIZE);
    setSimulationUsedAi(Boolean(snapshot.simulationUsedAi));
    setSimulationAnswerSheetOpen(false);
    setSimulationLaunchOpen(!(safeMode(snapshot.mode) === "simulation" && safeArray(snapshot.simulationQuestions).length));
    setTimerSettings(normalizeTimerSettings(snapshot.timerSettings));
    setActiveTimer(normalizeActiveTimer(snapshot.activeTimer));
    setTimeRemainingSeconds(null);
    setTimerValidationError("");
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
    resetSessionTimer();
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
    resetSessionTimer();
    setMobileDrawerOpen(false);
    setSimulationLaunchOpen(true);
    queueModeChange("simulation");
  }

  function openNewSimulationSetup() {
    resetSessionTimer();
    setSimulationLaunchOpen(true);
    setStatusMessage("Take a moment before starting a new full knowledge-check simulation.");
  }

  function updateTimerSetting(modeType, patch) {
    setTimerValidationError("");
    setTimerSettings((prev) => ({
      ...prev,
      [modeType]: {
        ...(prev[modeType] || createDefaultTimerSettings()[modeType]),
        ...patch,
      },
    }));
  }

  function getTimerDurationForMode(modeType, settingsOverride = timerSettings) {
    const settings = settingsOverride[modeType] || createDefaultTimerSettings()[modeType];
    if (settings.timerMode !== "timed") {
      return null;
    }

    if (String(settings.customMinutes || "").trim()) {
      const custom = Number(settings.customMinutes);
      if (!Number.isFinite(custom) || custom < TIMER_LIMITS.minMinutes || custom > TIMER_LIMITS.maxMinutes) {
        return null;
      }
      return Math.round(custom);
    }

    return clampTimerMinutes(settings.durationMinutes);
  }

  function validateTimerBeforeStart(modeType) {
    const settings = timerSettings[modeType] || createDefaultTimerSettings()[modeType];
    if (settings.timerMode !== "timed") {
      setTimerValidationError("");
      return true;
    }

    const minutes = getTimerDurationForMode(modeType);
    if (!minutes) {
      setTimerValidationError(`Choose a timer duration from ${TIMER_LIMITS.minMinutes} to ${TIMER_LIMITS.maxMinutes} minutes.`);
      return false;
    }

    setTimerValidationError("");
    return true;
  }

  function startSessionTimer(modeType, settingsOverride = null) {
    const settings = settingsOverride || timerSettings[modeType] || createDefaultTimerSettings()[modeType];
    const now = new Date();
    const durationMinutes = settings.timerMode === "timed"
      ? getTimerDurationForMode(modeType, { ...timerSettings, [modeType]: settings })
      : null;
    const nextTimer = {
      modeType,
      timerMode: settings.timerMode === "timed" && durationMinutes ? "timed" : "untimed",
      durationMinutes,
      startedAt: now.toISOString(),
      endsAt: durationMinutes ? new Date(now.getTime() + durationMinutes * 60 * 1000).toISOString() : null,
      endedAt: null,
      isTimerRunning: Boolean(durationMinutes),
      timeExpired: false,
      expiredHandled: false,
    };

    setActiveTimer(nextTimer);
    setTimeRemainingSeconds(durationMinutes ? durationMinutes * 60 : null);
    return nextTimer;
  }

  function stopSessionTimer(options = {}) {
    const { expired = false, continueUntimed = false } = options;
    const endedAt = new Date().toISOString();
    let nextTimer = null;

    setActiveTimer((prev) => {
      nextTimer = {
        ...prev,
        timerMode: continueUntimed ? "untimed" : prev.timerMode,
        endedAt: prev.endedAt || endedAt,
        endsAt: continueUntimed ? null : prev.endsAt,
        isTimerRunning: false,
        timeExpired: expired || prev.timeExpired,
        expiredHandled: expired ? true : prev.expiredHandled,
      };
      return nextTimer;
    });

    if (continueUntimed) {
      setTimeRemainingSeconds(null);
    }

    return {
      ...activeTimer,
      endedAt: activeTimer.endedAt || endedAt,
      isTimerRunning: false,
      timeExpired: expired || activeTimer.timeExpired,
      expiredHandled: expired ? true : activeTimer.expiredHandled,
    };
  }

  function resetSessionTimer() {
    setActiveTimer(createInactiveTimer());
    setTimeRemainingSeconds(null);
    setTimerValidationError("");
  }

  function finishActiveTimerMeta(modeType, counts = {}, options = {}) {
    const finalTimer = stopSessionTimer(options);
    return buildTimerSessionMeta(finalTimer, { modeType, ...counts });
  }

  function continueExpiredSessionUntimed() {
    stopSessionTimer({ expired: true, continueUntimed: true });
    setStatusMessage("Timer stopped. You can continue this session untimed.");
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
    if (activeTimer.timerMode !== "timed" || !activeTimer.endsAt || !activeTimer.isTimerRunning) {
      return undefined;
    }

    function tick() {
      const remaining = Math.max(0, Math.ceil((new Date(activeTimer.endsAt).getTime() - Date.now()) / 1000));
      setTimeRemainingSeconds(remaining);

      if (remaining <= 0) {
        setActiveTimer((prev) => ({
          ...prev,
          isTimerRunning: false,
          timeExpired: true,
        }));
      }
    }

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [activeTimer.endsAt, activeTimer.isTimerRunning, activeTimer.timerMode]);

  useEffect(() => {
    if (!activeTimer.timeExpired || activeTimer.expiredHandled) {
      return;
    }

    if (activeTimer.modeType === "simulation" && simulationQuestions.length && !simulationSubmitted) {
      setActiveTimer((prev) => ({ ...prev, expiredHandled: true }));
      submitSimulationExam({ force: true, expired: true });
      setApiError("Time is up. Your exam has been submitted.");
    }
  }, [activeTimer.timeExpired, activeTimer.expiredHandled, activeTimer.modeType, simulationQuestions.length, simulationSubmitted]);

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

    const persist = () => {
      persistLocalSnapshot(currentUser.id, progressSnapshot, window.localStorage);
    };
    const timeoutId = window.setTimeout(persist, mode === "simulation" ? 700 : 180);

    setCloudSyncState(
      supabaseConfigured && currentUser?.provider === "supabase"
        ? (isOnline ? "queued-sync" : "saved-local")
        : "saved-local"
    );

    return () => window.clearTimeout(timeoutId);
  }, [currentUser?.id, mode, progressSnapshot]);

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
  const simulationBankEntries = useMemo(() => getAllSimulationEntries(), []);
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
  const activeSimulationEntries = useMemo(() => {
    if (!hasCustomSource) {
      return simulationBankEntries;
    }

    if (!customEntries.length) {
      return simulationBankEntries;
    }

    if (activeTopicFocus) {
      return uniqueBy(
        [...customEntries, ...simulationBankEntries],
        (entry) => `${entry.subject}-${normalize(entry.q || entry.prompt)}-${normalize(entry.a || entry.answer)}`
      );
    }

    return customEntries;
  }, [hasCustomSource, customEntries, simulationBankEntries, activeTopicFocus]);

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
  const quizStats = useMemo(() => {
    let answered = 0;
    let correct = 0;
    const unanswered = [];

    quiz.forEach((item, index) => {
      if (isQuestionAnswered(item)) {
        answered += 1;
        if (scoreQuestion(item) === 1) {
          correct += 1;
        }
      } else {
        unanswered.push(index + 1);
      }
    });

    return { answered, correct, unanswered };
  }, [quiz]);
  const answeredCount = quizStats.answered;
  const unansweredQuizNumbers = quizStats.unanswered;
  const correctCount = quizStats.correct;
  const simulationItem = simulationQuestions[simulationIdx];
  const simulationCurrentDomain = simulationItem?.pnleDomain || inferPnleDomain(simulationItem, simulationIdx);
  const simulationCurrentDomainDetail = getPnleDomainDetail(simulationCurrentDomain);
  const simulationBlockQuestionNumber = (simulationIdx % SIMULATION_BLOCK_SIZE) + 1;
  const simulationStats = useMemo(() => {
    let answered = 0;
    let correct = 0;
    let flagged = 0;
    const unanswered = [];

    simulationQuestions.forEach((item, index) => {
      if (item.flagged) {
        flagged += 1;
      }

      if (isQuestionAnswered(item)) {
        answered += 1;
        if (scoreQuestion(item) === 1) {
          correct += 1;
        }
      } else {
        unanswered.push(index + 1);
      }
    });

    return { answered, correct, flagged, unanswered };
  }, [simulationQuestions]);
  const simulationAnsweredCount = simulationStats.answered;
  const unansweredSimulationNumbers = simulationStats.unanswered;
  const simulationCorrectCount = simulationStats.correct;
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
  const simulationUnansweredCount = Math.max(simulationQuestions.length - simulationAnsweredCount, 0);
  const simulationIncorrectCount = Math.max(simulationAnsweredCount - simulationCorrectCount, 0);
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
  const simulationNpBreakdown = useMemo(
    () => {
      const byDomain = PNLE_DOMAIN_ORDER.reduce((accumulator, domain) => {
        accumulator[domain] = { total: 0, correct: 0 };
        return accumulator;
      }, {});

      simulationQuestions.forEach((item, index) => {
        const domain = inferPnleDomain(item, index);
        if (!byDomain[domain]) {
          byDomain[domain] = { total: 0, correct: 0 };
        }
        byDomain[domain].total += 1;
        if (scoreQuestion(item) === 1) {
          byDomain[domain].correct += 1;
        }
      });

      return PNLE_DOMAIN_ORDER.map((domain) => {
        const detail = getPnleDomainDetail(domain);
        const stats = byDomain[domain] || { total: 0, correct: 0 };
        return {
          domain,
          label: detail.label,
          title: detail.title,
          shortTitle: detail.shortTitle,
          total: stats.total,
          correct: stats.correct,
          percent: stats.total ? Math.round((stats.correct / stats.total) * 100) : 0,
        };
      });
    },
    [simulationQuestions]
  );
  const simulationCompetencyBreakdown = useMemo(
    () =>
      Object.values(
        simulationQuestions.reduce((accumulator, item) => {
          const area = item.competencyArea || inferCompetencyArea(item);
          const cluster = item.competencyCluster || getCompetencyCluster(area);
          if (!accumulator[area]) {
            accumulator[area] = { area, cluster, total: 0, correct: 0 };
          }

          accumulator[area].total += 1;
          if (scoreQuestion(item) === 1) {
            accumulator[area].correct += 1;
          }

          return accumulator;
        }, {})
      )
        .map((item) => ({
          ...item,
          percent: item.total ? Math.round((item.correct / item.total) * 100) : 0,
        }))
        .sort((left, right) => right.total - left.total || left.percent - right.percent),
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
  const simulationFlaggedCount = simulationStats.flagged;
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
  const latestFullSimulationSession = reviewSessions.find((session) => session.mode === "simulation" && session.simulationType === "full_500");
  const latestSimulationInsight = latestFullSimulationSession?.weakestBlock
    ? {
        weakest: latestFullSimulationSession.weakestBlock,
        strongest: latestFullSimulationSession.strongestBlock,
        recommendation: latestFullSimulationSession.recommendation,
      }
    : null;
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
  const successSurface = C.accentLight;
  const successBorder = darkMode ? C.accentMid : "#B9E3CA";
  const errorSurface = C.redLight;
  const errorBorder = darkMode ? C.red : "#F4A8B4";
  const warningSurface = C.amberLight;
  const warningBorder = C.amber;
  const infoSurface = C.blueLight;
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
          ? `Prepare for a full knowledge-check simulation, with extra attention on ${recommendedFocus.subject}.`
          : "Prepare for a full knowledge-check simulation when you are ready."
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
      ].flatMap((entry) => buildFocusedFlashcardVariants(entry, resolvedTopic)),
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
      getTopicAlignedEntries(activeEntries, reviewSubject, difficulty, resolvedTopic).flatMap((entry) =>
        buildFocusedFlashcardVariants(entry, resolvedTopic)
      ),
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
        .flatMap((entry) => buildFocusedFlashcardVariants(entry, resolvedTopic))
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
    if (deck.length && message) {
      resetSessionTimer();
    }

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
      resetSessionTimer();
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
      resetSessionTimer();
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
        resetSessionTimer();
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
      const normalizedQuestions = normalizeQuestions(questions, { source: "bank" });
      setQuiz(normalizedQuestions);
      setQuizViewMode("study");
      setViewMode("study");
      setRemediationContext(null);
      setQuizIdx(0);
      setQuizResponseTimes({});
      setMode("quiz");
      setQuizSubmitted(false);
      setQuizAnswerSheetOpen(false);
      if (normalizedQuestions.length) {
        resetSessionTimer();
      }

      if (asError) {
        setApiError(message);
      } else {
        setStatusMessage(message);
      }

      if (!hasCustomSource) {
        setUsedQuizPrompts((prev) =>
          uniqueBy(
            [...prev, ...normalizedQuestions.map((item) => normalize(item.prompt))],
            (value) => value
          )
        );
        setRecentQuizPrompts((prev) =>
          [...prev, ...normalizedQuestions.map((item) => normalize(item.prompt))].slice(-RECENT_MEMORY_LIMIT)
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

  async function generateSimulationExam() {
    const finalTarget = SIMULATION_FULL_SIZE;
    const simulationSubject = "Mixed Review";
    const simulationDifficulty = "mixed";
    const simulationTopic = "";
    const maxAiQuestions = 120;
    const aiBatchCap = Math.ceil(maxAiQuestions / SIMULATION_BATCH_SIZE);
    clearMessages();
    setApiLoading(true);
    setStatusMessage("Preparing your simulation. CareDrop is building the full set now...");
    setSimulationSubmitted(false);
    setSimulationUsedAi(false);
    setSimulationResponseTimes({});
    await waitForUiPaint();

    try {
      const localCandidates = buildLocalQuizFallback(
        activeSimulationEntries,
        "",
        "All",
        "",
        Math.max(finalTarget, 120),
        [],
        { includeSyntheticTopicFill: false }
      );
      const localUniqueCount = uniqueBy(activeSimulationEntries, (item) => normalize(item.q || item.prompt || item.question || item.stem || item.id)).length;
      const localPool = buildFullPnleSimulationSet(
        localCandidates,
        hasCustomSource ? [] : usedQuizPromptsRef.current,
        recentQuizPromptsRef.current
      );

      let combined = [...localPool];
      const shouldAskAi = isOnline && Boolean(hasCustomSource || localUniqueCount < finalTarget || combined.length < finalTarget);

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

      const questions = attachPnleDomains(normalizeQuestions(buildFullPnleSimulationSet(
        combined,
        hasCustomSource ? [] : usedQuizPromptsRef.current,
        recentQuizPromptsRef.current
      ), { source: combined.length > localPool.length ? "ai" : "bank", allowMultipleResponse: true }));

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
      startSessionTimer("simulation", { timerMode: "timed", durationMinutes: SIMULATION_DURATION_MINUTES, customMinutes: "" });
      setStatusMessage(
        combined.length > localPool.length
          ? "Full knowledge-check simulation started. Gemini helped shape the expansion set."
          : "Full knowledge-check simulation started. Take it one item at a time."
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
      await waitForUiPaint();
      const fallbackCandidates = buildLocalQuizFallback(
        activeSimulationEntries,
        "",
        "All",
        "",
        Math.max(finalTarget, 120),
        [],
        { includeSyntheticTopicFill: false }
      );
      const fallback = attachPnleDomains(normalizeQuestions(buildFullPnleSimulationSet(
        fallbackCandidates,
        hasCustomSource ? [] : usedQuizPromptsRef.current,
        recentQuizPromptsRef.current
      ), { source: "bank", allowMultipleResponse: true }));

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
      startSessionTimer("simulation", { timerMode: "timed", durationMinutes: SIMULATION_DURATION_MINUTES, customMinutes: "" });
      setApiError(normalizeAiErrorMessage(error) || `Gemini simulation generation failed. A local ${finalTarget}-question simulation was loaded instead.`);
      setStatusMessage("Full knowledge-check simulation started from the CareDrop bank.");
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
        correctAnswer: getCorrectAnswerText(quizItem),
        rationale: getQuestionRationaleText(quizItem),
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

  function submitFlashcardSession(options = {}) {
    const { force = false } = options;
    if (!flashcards.length || (!force && flashcardCompletedCount < flashcards.length) || flashcardSessionSubmitted) {
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

  function submitQuizSession(options = {}) {
    const { force = false } = options;
    if (!quiz.length || (!force && answeredCount < quiz.length) || quizSubmitted) {
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
      setSimulationQuestions(attachPnleDomains(normalizeQuestions(session.questions || [], { source: "saved", allowMultipleResponse: true })));
      setSimulationIdx(clamp(session.currentIndex || 0, 0, Math.max((session.questions || []).length - 1, 0)));
      setSimulationResponseTimes(session.responseTimes || {});
      setSimulationSubmitted(true);
      setSimulationSize(SIMULATION_FULL_SIZE);
      setSimulationUsedAi(Boolean(session.usedAi));
      setSimulationAnswerSheetOpen(false);
      setSimulationLaunchOpen(false);
      setMode("simulation");
      setStatusMessage(`Loaded saved session: ${buildSessionLabel(session)}.`);
      return;
    }

    setQuiz(normalizeQuestions(session.questions || [], { source: "saved" }));
    setQuizIdx(clamp(session.currentIndex || 0, 0, Math.max((session.questions || []).length - 1, 0)));
    setQuizResponseTimes(session.responseTimes || {});
    setQuizSubmitted(Boolean(session.submitted));
    setQuizViewMode(session.submitted ? "result" : "study");
    setQuizAnswerSheetOpen(false);
    setMode("quiz");
    setStatusMessage(`Loaded saved session: ${buildSessionLabel(session)}.`);
  }

  function submitSimulationExam(options = {}) {
    const { force = false, expired = false } = options;
    if (!simulationQuestions.length || (!force && simulationAnsweredCount < simulationQuestions.length) || simulationSubmitted) {
      return;
    }

    const timerMeta = finishActiveTimerMeta("simulation", {
      completedItemCount: simulationAnsweredCount,
      totalItemCount: simulationQuestions.length,
    }, { expired });
    const answeredAt = new Date().toISOString();
    const weakestBlock = [...simulationNpBreakdown].filter((item) => item.total).sort((left, right) => left.percent - right.percent)[0] || null;
    const strongestBlock = [...simulationNpBreakdown].filter((item) => item.total).sort((left, right) => right.percent - left.percent)[0] || null;
    const weakTopics = simulationSubjectBreakdown
      .filter((item) => item.percent < 65)
      .map((item) => item.subject)
      .slice(0, 5);
    const recommendation = weakestBlock
      ? `Recommended Focus: ${weakestBlock.label || weakestBlock.shortTitle}. You may benefit from extra practice in ${weakestBlock.shortTitle}, while keeping the progress you built in ${strongestBlock?.label || strongestBlock?.shortTitle || "your stronger areas"}.`
      : "Recommended Focus: review the answer sheet and choose one topic that felt uncertain.";

    const session = {
      id: uid(),
      createdAt: new Date().toISOString(),
      mode: "simulation",
      simulationType: "full_500",
      startedAt: timerMeta.startedAt,
      submittedAt: answeredAt,
      timeStartedAt: timerMeta.startedAt,
      timeExpired: Boolean(expired || timerMeta.timeExpired),
      timeUsedSeconds: timerMeta.actualDurationSeconds,
      totalQuestions: SIMULATION_FULL_SIZE,
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
      unansweredCount: simulationUnansweredCount,
      correctCount: simulationCorrectCount,
      overallScore: simulationCorrectCount,
      overallAccuracy: simulationQuestions.length ? Math.round((simulationCorrectCount / simulationQuestions.length) * 100) : 0,
      simulationSize,
      usedAi: simulationUsedAi,
      blockScores: simulationNpBreakdown,
      weakestBlock,
      strongestBlock,
      weakTopics,
      recommendation,
      userAnswers: simulationQuestions.map((item) => ({
        id: item.id,
        prompt: item.prompt,
        userAnswer: item.userAnswer,
        subject: item.subject,
        topic: item.topic,
        pnleDomain: item.pnleDomain,
      })),
      itemReviewData: simulationQuestions.map((item) => buildQuestionReview(item)),
      pnleBreakdown: simulationNpBreakdown,
      competencyBreakdown: simulationCompetencyBreakdown,
      timer: timerMeta,
      pacingInsight: getPacingInsight(timerMeta, "simulation exam"),
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
      normalizeQuestions(questions.map((item) => ({
        ...item,
        notes: `${item.notes} Remediation focus: revisit why the safest answer wins for this topic.`,
      })), { source: "remediation" })
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
    setSimulationSize(SIMULATION_FULL_SIZE);
    setSimulationUsedAi(false);
    setSimulationAnswerSheetOpen(false);
    setSimulationLaunchOpen(true);
    resetSessionTimer();
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

    if (activeStudyMode === "simulation" && !validateTimerBeforeStart(activeStudyMode)) {
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
  const activeSimulationFocusMode =
    mode === "simulation" &&
    !simulationLaunchOpen &&
    simulationQuestions.length > 0 &&
    !simulationSubmitted;
  const isStudyMode = mode === "flashcard" || mode === "quiz" || mode === "simulation";
  const headerShouldBeVisible = usesDrawerNav || headerVisible || mobileDrawerOpen;
  const studySectionPadding = isMobile ? 16 : 22;
  const studyMetaSize = 12;
  const studyQuestionSize = isMobile ? 18 : 20;
  const studyBodySize = isMobile ? 14 : 15;
  const studyActionPadding = isMobile ? "10px 14px" : "10px 16px";
  const headerHeight = usesDrawerNav ? (isMobile ? 72 : 68) : isMobile ? 88 : 68;
  const timerIsUrgent = activeTimer.timerMode === "timed" && Number(timeRemainingSeconds || 0) <= 60;
  const timerIsCritical = activeTimer.timerMode === "timed" && Number(timeRemainingSeconds || 0) <= 10;
  const showTimerExpiredModal = false;
  const cardSurface = C.surface;
  const elevatedSurface = C.surfaceRaised;
  const heroSurface = darkMode
    ? `linear-gradient(180deg, ${C.bgElevated} 0%, ${C.surface} 100%)`
    : `linear-gradient(180deg, ${C.bgElevated} 0%, ${C.surfaceRaised} 100%)`;
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

  const renderTimerSetup = (modeType) => {
    const settings = timerSettings[modeType] || createDefaultTimerSettings()[modeType];
    const presets = modeType === "simulation"
      ? TIMER_PRESETS.simulation[SIMULATION_FULL_SIZE] || [SIMULATION_DURATION_MINUTES]
      : TIMER_PRESETS[modeType];
    const chipStyle = (active) => ({
      padding: "9px 12px",
      borderRadius: 999,
      border: `1px solid ${active ? C.accent : C.border}`,
      background: active ? C.accentLight : C.surface,
      color: active ? C.accent : C.text,
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
    });

    return (
      <div
        style={{
          display: "grid",
          gap: 10,
          padding: "12px 14px",
          borderRadius: 16,
          border: `1px solid ${C.border}`,
          background: C.surfaceMuted,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: C.faint, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>Timer</div>
            <div style={{ marginTop: 3, fontSize: 12, color: C.muted }}>Optional pacing practice. Timer starts only after the set loads.</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["untimed", "timed"].map((value) => (
              <button
                key={`${modeType}-timer-${value}`}
                type="button"
                onClick={() => updateTimerSetting(modeType, { timerMode: value })}
                style={chipStyle(settings.timerMode === value)}
              >
                {value === "timed" ? "Timed" : "Untimed"}
              </button>
            ))}
          </div>
        </div>
        {settings.timerMode === "timed" ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {presets.map((minutes) => (
              <button
                key={`${modeType}-${minutes}-minutes`}
                type="button"
                onClick={() => updateTimerSetting(modeType, { durationMinutes: minutes, customMinutes: "" })}
                style={chipStyle(Number(settings.durationMinutes) === minutes)}
              >
                {minutes} min
              </button>
            ))}
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: C.muted }}>
              Custom
              <input
                type="number"
                min={TIMER_LIMITS.minMinutes}
                max={TIMER_LIMITS.maxMinutes}
                value={settings.customMinutes}
                onChange={(event) => {
                  const value = event.target.value;
                  updateTimerSetting(modeType, {
                    customMinutes: value,
                    durationMinutes: value ? clampTimerMinutes(value) : settings.durationMinutes,
                  });
                }}
                placeholder="min"
                style={{ ...selectStyle, width: 90, cursor: "text" }}
              />
            </label>
            {timerValidationError ? (
              <div style={{ flexBasis: "100%", fontSize: 12, color: C.red, fontWeight: 700 }}>
                {timerValidationError}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const renderTimerDisplay = (modeType) => {
    if (activeTimer.modeType !== modeType || !activeTimer.startedAt) {
      return null;
    }

    const text = activeTimer.timerMode === "timed"
      ? `Time left: ${formatDuration(timeRemainingSeconds ?? 0)}`
      : "Untimed session";
    return (
      <div
        aria-live="polite"
        style={{
          padding: "8px 11px",
          borderRadius: 999,
          border: `1px solid ${timerIsCritical ? C.red : timerIsUrgent ? C.amber : C.border}`,
          background: timerIsCritical ? errorSurface : timerIsUrgent ? warningSurface : C.surface,
          color: timerIsCritical ? C.red : timerIsUrgent ? C.amber : C.text,
          fontSize: 12,
          fontWeight: 900,
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
    );
  };

  const renderTimerSummary = (modeType, completedItemCount, totalItemCount, label) => {
    if (activeTimer.modeType !== modeType || !activeTimer.startedAt) {
      return null;
    }

    const meta = buildTimerSessionMeta(activeTimer, { modeType, completedItemCount, totalItemCount });
    return (
      <div
        style={{
          marginTop: 14,
          padding: "12px 14px",
          borderRadius: 14,
          background: C.surface,
          border: `1px solid ${C.border}`,
          fontSize: 13,
          color: C.muted,
          lineHeight: 1.7,
        }}
      >
        <strong style={{ color: C.text }}>Timer summary:</strong>{" "}
        {meta.timerMode === "timed" ? `${meta.timerDurationMinutes} min selected | ` : "Untimed | "}
        used {formatDuration(meta.actualDurationSeconds)} | avg {formatDuration(meta.averageTimePerItem)} per item.
        <div style={{ marginTop: 4 }}>{getPacingInsight(meta, label)}</div>
      </div>
    );
  };

  const renderModuleSetupControls = (lockedMode) => {
    const label = lockedMode === "quiz" ? "Quiz" : "Flashcards";
    const gridColumns = width < 900 ? "1fr" : "160px minmax(180px, 220px) minmax(240px, 1fr)";
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
          background: elevatedSurface,
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
        </div>
        <div style={{ marginTop: 12, display: "flex", justifyContent: width < 900 ? "stretch" : "flex-end" }}>
          <button
            type="button"
            onClick={submitReviewFocus}
            disabled={apiLoading}
            style={{
              width: width < 900 ? "100%" : "auto",
              minWidth: width < 900 ? "auto" : 210,
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
    setFlashcardDeckVersion((value) => value + 1);
  }, [flashcards]);

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
          transform: headerShouldBeVisible ? "translateY(0)" : "translateY(-100%)",
          transition: "transform 0.28s ease",
          boxShadow: headerShouldBeVisible ? C.shellShadow : "none",
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

      {showTimerExpiredModal ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Timer expired"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(2, 6, 23, 0.58)",
            display: "grid",
            placeItems: "center",
            padding: 18,
          }}
        >
          <div
            style={{
              width: "min(440px, 100%)",
              borderRadius: 22,
              padding: 22,
              background: C.surface,
              border: `1px solid ${C.border}`,
              boxShadow: C.shellShadow,
              color: C.text,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>Time is up</div>
            <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.7 }}>
              {activeTimer.modeType === "flashcard"
                ? "Would you like to finish this flashcard session now or continue reviewing without the timer?"
                : "Would you like to submit your quiz now or continue answering without the timer?"}
            </div>
            <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={continueExpiredSessionUntimed}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: `1px solid ${C.border}`,
                  background: C.surfaceMuted,
                  color: C.text,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Continue Untimed
              </button>
              <button
                type="button"
                onClick={() =>
                  activeTimer.modeType === "flashcard"
                    ? submitFlashcardSession({ force: true, expired: true })
                    : submitQuizSession({ force: true, expired: true })
                }
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "none",
                  background: C.accent,
                  color: "#fff",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                {activeTimer.modeType === "flashcard" ? "Finish Session" : "Submit Quiz"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
                  <div style={{ padding: "10px 14px", borderRadius: 999, background: C.accentLight, border: `1px solid ${darkMode ? C.border : "#C4DDCE"}`, fontSize: 12, color: darkMode ? C.accentMid : "#235B42", fontWeight: 700 }}>
                    {studyStreak ? `${studyStreak}-day study streak` : "Start a streak with one session today"}
                  </div>
                  <div style={{ padding: "10px 14px", borderRadius: 999, background: C.blueLight, border: `1px solid ${darkMode ? C.border : "#C6D5E8"}`, fontSize: 12, color: darkMode ? C.blue : "#355E8A", fontWeight: 700 }}>
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
            gridTemplateColumns: usesDrawerNav || activeSimulationFocusMode ? "1fr" : "minmax(280px, 300px) minmax(0, 1fr)",
            gap: 20,
          }}
        >
          {!usesDrawerNav && !activeSimulationFocusMode ? (
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
                      {latestSimulationInsight ? (
                        <div
                          style={{
                            marginTop: 12,
                            padding: "12px 14px",
                            borderRadius: 14,
                            background: darkMode ? "rgba(20, 211, 154, 0.08)" : C.accentLight,
                            border: `1px solid ${darkMode ? "rgba(20, 211, 154, 0.28)" : "#BFEBD4"}`,
                            color: C.text,
                            fontSize: 13,
                            lineHeight: 1.7,
                          }}
                        >
                          <strong>Simulation insight:</strong> {latestSimulationInsight.recommendation}
                          {latestSimulationInsight.strongest ? ` Good progress showed in ${latestSimulationInsight.strongest.label || latestSimulationInsight.strongest.shortTitle}. Keep going one block at a time.` : ""}
                        </div>
                      ) : null}
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
                      key={`${flashcardDeckVersion}-${currentCard.id || "flashcard"}-${cardIdx}`}
                      card={currentCard}
                      idx={cardIdx}
                      total={flashcards.length}
                      rating={flashcardSessionRatings[currentCard.id]}
                      onRate={handleRate}
                    />
                    <div
                      style={{
                        marginTop: 16,
                        borderRadius: 18,
                        padding: studySectionPadding,
                        background: softSurface,
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
                              onChange={() => handleQuizAnswer(option.id)}
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
                          <div><strong>Correct answer:</strong> {getCorrectAnswerText(quizItem)}</div>
                          <div><strong>Rationale:</strong> {getQuestionRationaleText(quizItem)}</div>
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
                                      Correct answer: <strong style={{ color: C.text }}>{getCorrectAnswerText(item)}</strong>
                                    </div>
                                    <div style={{ fontSize: studyBodySize, color: C.text, lineHeight: 1.7 }}>
                                      <strong>Rationale:</strong> {getQuestionRationaleText(item)}
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
                      Build a mixed long-form knowledge check across five review blocks. Gemini can help expand the set so each area receives balanced coverage while still testing clinical judgment and responsibility-area competencies.
                    </div>
                  </div>
                  {!simulationLaunchOpen && simulationQuestions.length ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={openNewSimulationSetup}
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
                        New Full Simulation
                      </button>
                    </div>
                  ) : null}
                </div>

                {simulationLaunchOpen ? (
                  <div
                    style={{
                      marginTop: 18,
                      border: `1px solid ${C.border}`,
                      borderRadius: 24,
                      padding: width < 720 ? 22 : 32,
                      background: darkMode
                        ? "linear-gradient(135deg, rgba(20, 211, 154, 0.10), rgba(30, 41, 59, 0.94))"
                        : `linear-gradient(135deg, ${C.bgElevated}, ${C.surfaceRaised})`,
                      minHeight: 360,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <Badge label="Full 500-item knowledge check" color="green" />
                      <div style={{ marginTop: 16, fontSize: width < 720 ? 26 : 32, fontWeight: 950, letterSpacing: "-0.05em", color: C.text }}>
                        Take a moment before you begin.
                      </div>
                      <div style={{ marginTop: 12, fontSize: 15, color: C.text, lineHeight: 1.8, maxWidth: 820 }}>
                        You are not expected to know everything right away. This simulation is here to help you understand what you already know and what needs more focus.
                      </div>
                      <div
                        style={{
                          marginTop: 18,
                          padding: "14px 16px",
                          borderRadius: 16,
                          background: darkMode ? "rgba(15, 23, 42, 0.62)" : "rgba(245, 242, 234, 0.82)",
                          border: `1px solid ${C.border}`,
                          color: C.muted,
                          fontSize: 13,
                          lineHeight: 1.75,
                          maxWidth: 920,
                        }}
                      >
                        This simulation is intended as a study and self-assessment tool only. It is designed to help you review concepts, identify areas that may need more attention, and guide your learning. Your consistency, effort, and continued review are still the most important factors in your progress.
                      </div>
                      <div style={{ marginTop: 16, display: "grid", gap: 10, gridTemplateColumns: width < 820 ? "1fr" : "repeat(3, minmax(0, 1fr))" }}>
                        {[
                          { label: "500 questions", hint: "Five review blocks, 100 items each" },
                          { label: "3 hours", hint: "Timer starts after you click start" },
                          { label: "Answers hidden", hint: "Rationales appear only after submission" },
                        ].map((item) => (
                          <div key={item.label} style={{ padding: "13px 14px", borderRadius: 14, background: C.surface, border: `1px solid ${C.border}` }}>
                            <div style={{ fontWeight: 900, color: C.text }}>{item.label}</div>
                            <div style={{ marginTop: 4, fontSize: 12, color: C.muted }}>{item.hint}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ marginTop: 24, display: "flex", justifyContent: "center", flexDirection: "column", alignItems: "center", gap: 10 }}>
                      <button
                        type="button"
                        onClick={() => generateSimulationExam()}
                        disabled={apiLoading}
                        style={{
                          minHeight: 48,
                          minWidth: width < 720 ? "100%" : 260,
                          padding: "13px 22px",
                          borderRadius: 999,
                          border: "none",
                          background: apiLoading ? C.border : C.accent,
                          color: apiLoading ? C.muted : "#fff",
                          fontWeight: 900,
                          cursor: apiLoading ? "not-allowed" : "pointer",
                        }}
                      >
                        {apiLoading ? "Preparing your simulation..." : "Let’s Start"}
                      </button>
                      <div style={{ fontSize: 12, color: C.muted, textAlign: "center" }}>
                        Find a quiet space, take a breath, and answer one item at a time.
                      </div>
                      {simulationQuestions.length ? (
                        <button
                          type="button"
                          onClick={() => setSimulationLaunchOpen(false)}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 999,
                            border: `1px solid ${C.border}`,
                            background: C.surface,
                            color: C.text,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Resume Current Simulation
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : !simulationItem ? (
                  <div
                    style={{
                      marginTop: 18,
                      border: `1px dashed ${C.border}`,
                      borderRadius: 18,
                      padding: 24,
                      background: softSurface,
                      color: C.muted,
                      lineHeight: 1.7,
                    }}
                  >
                    Open the preparation screen to begin the full knowledge-check simulation.
                  </div>
                ) : (
                  <>
                    <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
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
                      {renderTimerDisplay("simulation")}
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
                      <div>{simulationUnansweredCount} unanswered</div>
                      <div>{simulationCurrentDomainDetail.label} progress: {simulationBlockQuestionNumber}/{SIMULATION_BLOCK_SIZE}</div>
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
                        <Badge label={`${simulationCurrentDomainDetail.label} · Question ${simulationIdx + 1} of ${simulationQuestions.length}`} color="blue" />
                        <Badge label={`Block progress ${simulationBlockQuestionNumber}/${SIMULATION_BLOCK_SIZE}`} color="green" />
                        <Badge label={simulationItem.competencyArea || inferCompetencyArea(simulationItem)} color="blue" />
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
                        {simulationCurrentDomainDetail.shortTitle}
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
                            <div>Remaining: <strong>{simulationUnansweredCount}</strong></div>
                            <div>Current block: <strong>{simulationCurrentDomainDetail.label} · {simulationBlockQuestionNumber}/{SIMULATION_BLOCK_SIZE}</strong></div>
                          </div>
                          <div style={{ marginTop: 10, fontSize: studyBodySize, color: C.muted, lineHeight: 1.7 }}>
                            Answers stay hidden while the simulation is active so the flow feels closer to a focused long-form knowledge check. Move back through earlier questions anytime if you want to review or change an answer before the final submit on the last item.
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
                                ? "This full knowledge-check simulation combined the CareDrop bank with Gemini-generated expansion for broader review practice."
                                : "This full knowledge-check simulation came from the CareDrop bank and is now saved in Review History for later review."}
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
                              { label: "Accuracy", value: `${simulationScore}%`, hint: `${simulationCorrectCount}/${simulationQuestions.length} correct` },
                              { label: "Answered", value: `${simulationAnsweredCount}`, hint: `${simulationUnansweredCount} unanswered` },
                              { label: "Correct", value: `${simulationCorrectCount}`, hint: "Strong answers recorded" },
                              { label: "Needs review", value: `${simulationIncorrectCount + simulationUnansweredCount}`, hint: `${simulationIncorrectCount} incorrect | ${simulationUnansweredCount} unanswered` },
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
                          {renderTimerSummary("simulation", simulationAnsweredCount, simulationQuestions.length, "simulation")}

                          <div
                            style={{
                              marginTop: 14,
                              padding: "14px 16px",
                              borderRadius: 16,
                              background: darkMode ? "rgba(20, 211, 154, 0.08)" : C.accentLight,
                              border: `1px solid ${darkMode ? "rgba(20, 211, 154, 0.28)" : "#BFEBD4"}`,
                              fontSize: 13,
                              color: C.text,
                              lineHeight: 1.7,
                            }}
                          >
                            <strong>Recommended next step:</strong>{" "}
                            {simulationNpBreakdown.filter((item) => item.total).sort((left, right) => left.percent - right.percent)[0]
                              ? `You may benefit from extra practice in ${simulationNpBreakdown.filter((item) => item.total).sort((left, right) => left.percent - right.percent)[0].label}. Good progress still counts, and this result is here to guide your next review, not judge it.`
                              : "Review the answer sheet and choose one area that felt uncertain."}
                          </div>

                          <div
                            style={{
                              marginTop: 14,
                              padding: "16px 18px",
                              borderRadius: 16,
                              background: C.surface,
                              border: `1px solid ${C.border}`,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                              <div>
                                <div style={{ fontSize: 15, fontWeight: 800 }}>Review Block Breakdown</div>
                                <div style={{ marginTop: 4, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                                  A 500-item simulation targets 100 items per review block, or 20% each.
                                </div>
                              </div>
                              <Badge label="5 balanced blocks" color="green" />
                            </div>
                            <div
                              style={{
                                marginTop: 14,
                                display: "grid",
                                gap: 10,
                                gridTemplateColumns: width < 920 ? "1fr" : "repeat(5, minmax(0, 1fr))",
                              }}
                            >
                              {simulationNpBreakdown.map((item) => (
                                <div
                                  key={item.domain}
                                  style={{
                                    padding: "13px 14px",
                                    borderRadius: 14,
                                    background: darkMode ? "rgba(15, 23, 42, 0.72)" : C.surfaceMuted,
                                    border: `1px solid ${C.border}`,
                                  }}
                                >
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                                    <div style={{ fontSize: 14, fontWeight: 900 }}>{item.label}</div>
                                    <Badge label={`${item.percent}%`} color={item.percent >= 75 ? "green" : item.percent >= 60 ? "amber" : "red"} />
                                  </div>
                                  <div style={{ marginTop: 6, fontSize: 12, color: C.muted, lineHeight: 1.45 }}>{item.shortTitle}</div>
                                  <div style={{ marginTop: 8, height: 7, borderRadius: 999, background: darkMode ? C.border : "#E8E4DC", overflow: "hidden" }}>
                                    <div
                                      style={{
                                        width: `${item.percent}%`,
                                        height: "100%",
                                        background: item.percent >= 75 ? "#10B981" : item.percent >= 60 ? "#E7A93B" : "#EF4444",
                                      }}
                                    />
                                  </div>
                                  <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>
                                    {item.correct}/{item.total} correct
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div
                            style={{
                              marginTop: 14,
                              padding: "16px 18px",
                              borderRadius: 16,
                              background: C.surface,
                              border: `1px solid ${C.border}`,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                              <div>
                                <div style={{ fontSize: 15, fontWeight: 800 }}>Competency Area Snapshot</div>
                                <div style={{ marginTop: 4, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                                  Items are also tagged against nursing responsibility areas for safer remediation.
                                </div>
                              </div>
                              <Badge label="11 areas" color="blue" />
                            </div>
                            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                              {simulationCompetencyBreakdown.slice(0, 6).map((item) => (
                                <div
                                  key={item.area}
                                  style={{
                                    display: "grid",
                                    gap: 8,
                                    gridTemplateColumns: width < 760 ? "1fr" : "minmax(0, 1.7fr) minmax(0, 1fr) 72px",
                                    alignItems: "center",
                                    padding: "10px 12px",
                                    borderRadius: 12,
                                    background: darkMode ? "rgba(15, 23, 42, 0.72)" : C.surfaceMuted,
                                    border: `1px solid ${C.border}`,
                                  }}
                                >
                                  <div>
                                    <div style={{ fontSize: 13, fontWeight: 800 }}>{item.area}</div>
                                    <div style={{ marginTop: 2, fontSize: 11, color: C.muted }}>{item.cluster}</div>
                                  </div>
                                  <div style={{ height: 7, borderRadius: 999, background: darkMode ? C.border : "#E8E4DC", overflow: "hidden" }}>
                                    <div
                                      style={{
                                        width: `${item.percent}%`,
                                        height: "100%",
                                        background: item.percent >= 75 ? "#10B981" : item.percent >= 60 ? "#E7A93B" : "#EF4444",
                                      }}
                                    />
                                  </div>
                                  <div style={{ fontSize: 12, color: C.muted, textAlign: width < 760 ? "left" : "right" }}>
                                    {item.correct}/{item.total}
                                  </div>
                                </div>
                              ))}
                            </div>
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
                              onClick={openNewSimulationSetup}
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
                                      <Badge label={getPnleDomainDetail(item.pnleDomain || inferPnleDomain(item, index)).label} color="green" />
                                      <Badge label={item.competencyArea || inferCompetencyArea(item)} color="blue" />
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
                                        Correct answer: <strong style={{ color: C.text }}>{review.correctOptions.map((option) => option.text).join(", ") || getCorrectAnswerText(item)}</strong>
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
                                        <strong>Rationale:</strong> {getQuestionRationaleText(item)}
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
                    background: dragActive ? C.accentLight : softSurface,
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
                    background: softSurface,
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
                      background: softSurface,
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


