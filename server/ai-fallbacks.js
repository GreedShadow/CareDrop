const SUMMARY_HEADINGS = [
  "Key Concepts",
  "Important Terms",
  "Signs and Symptoms",
  "Nursing Interventions",
  "Patient Teaching",
  "Safety Considerations",
  "Exam Traps",
  "High-Yield PNLE Points",
];

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sentenceSplit(text) {
  return normalizeText(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function inferTopic({ topic, notes }) {
  const explicit = normalizeText(topic);
  if (explicit) return explicit;

  const source = normalizeText(notes).toLowerCase();
  const match = source.match(
    /(airway|breathing|circulation|respiratory|pulmonary|cardiac|infection|shock|medication|delegation|maternal|newborn|pediatric|community|psychiatric|safety|teaching)/
  );
  return match?.[0] || "priority nursing care";
}

function pickSourceCue(notes, fallback) {
  const sentences = sentenceSplit(notes);
  return sentences.find((line) => line.length > 24) || fallback;
}

export function buildFallbackSummary(notes) {
  const sentences = sentenceSplit(notes);
  const mainCue = sentences[0] || "The uploaded material should be reviewed for nursing priorities, safety, assessment cues, and patient teaching.";
  const assessmentCue =
    sentences.find((line) => /(assess|monitor|check|observe|vital|saturation|breathing|airway)/i.test(line)) || mainCue;
  const interventionCue =
    sentences.find((line) => /(intervention|position|oxygen|support|teach|escalat|notify|administer|prioriti)/i.test(line)) || mainCue;
  const safetyCue =
    sentences.find((line) => /(severe|distress|failure|risk|unsafe|emergency|worsening|contraindicat|avoid)/i.test(line)) || interventionCue;

  const sections = {
    "Key Concepts": [
      mainCue,
      "Connect each topic to assessment-before-intervention thinking, client safety, and the safest nursing priority.",
    ],
    "Important Terms": [
      "Priority cue: the stem detail that tells the nurse what must be handled first.",
      "Clinical deterioration: worsening signs that require closer assessment or escalation.",
    ],
    "Signs and Symptoms": [
      assessmentCue,
      "Watch for worsening work of breathing, altered mentation, abnormal vital signs, pain, bleeding, dehydration, or other instability when supported by the source.",
    ],
    "Nursing Interventions": [
      interventionCue,
      "Prioritize immediate safety, focused assessment, timely escalation, and ordered interventions that match the client condition.",
    ],
    "Patient Teaching": [
      "Teach warning signs to report early, follow-up needs, medication precautions when present, and when to seek urgent help.",
      "Use simple, concrete instructions based on the uploaded material.",
    ],
    "Safety Considerations": [
      safetyCue,
      "Preserve source warnings, contraindications, and only-if or unless conditions before choosing an answer.",
    ],
    "Exam Traps": [
      "Do not choose routine care when the stem shows instability or a priority safety cue.",
      "Avoid jumping to implementation if the question is asking for the first assessment.",
    ],
    "High-Yield PNLE Points": [
      "Ask: what is safest, what must be assessed first, and what action prevents harm?",
      "Match broad questions with broad nursing priorities and specific questions with precise clinical cues.",
    ],
  };

  return SUMMARY_HEADINGS.map((heading) => [
    heading,
    ...sections[heading].map((item) => `- ${item}`),
  ].join("\n")).join("\n\n");
}

export function buildFallbackCards({ notes, subject, topic, difficulty, count }) {
  const topicLabel = inferTopic({ topic, notes });
  const cue = pickSourceCue(notes, `Review the safest nursing priority for ${topicLabel}.`);
  const safeSubject = normalizeText(subject) || "Mixed Review";
  const safeDifficulty = ["easy", "medium", "hard"].includes(String(difficulty).toLowerCase())
    ? String(difficulty).toLowerCase()
    : "medium";

  return Array.from({ length: count }, (_, index) => ({
    subject: safeSubject,
    difficulty: safeDifficulty,
    topic: topicLabel,
    question: [
      `What is the priority nursing cue for ${topicLabel}?`,
      `Which safety point should guide care for ${topicLabel}?`,
      `What should the nurse assess first when ${topicLabel} is suspected?`,
      `What patient-teaching point matters most for ${topicLabel}?`,
      `What board-review takeaway connects to ${topicLabel}?`,
      `Which clinical change would require prompt attention in ${topicLabel}?`,
    ][index % 6],
    answer: cue,
    rationale: `Correct Answer Explanation: This answer is useful because it keeps ${topicLabel} tied to assessment, safety, and priority nursing judgment.`,
    notes: `Key Takeaway: For PNLE-style review, connect ${topicLabel} to the safest assessment cue or first nursing action.`,
  }));
}

export function buildFallbackQuestions({ notes, subject, topic, difficulty, count, examMode = false }) {
  const topicLabel = inferTopic({ topic, notes });
  const cue = pickSourceCue(notes, `The priority nursing concern is ${topicLabel}.`);
  const safeSubject = normalizeText(subject) || "Mixed Review";
  const safeDifficulty = ["easy", "medium", "hard"].includes(String(difficulty).toLowerCase())
    ? String(difficulty).toLowerCase()
    : "medium";

  const templates = [
    {
      prompt: `A client is being reviewed for ${topicLabel}. The key source cue is: ${cue} Which nursing response is best?`,
      correct: "Assess the priority cue first and escalate care if signs of instability are present.",
    },
    {
      prompt: `The nurse is answering a PNLE-style item about ${topicLabel}. Which action best protects client safety?`,
      correct: "Focus on the assessment finding that signals the greatest immediate risk.",
    },
    {
      prompt: `A learner is reviewing ${topicLabel}. Which answer best follows assessment-before-intervention logic?`,
      correct: "Collect focused assessment data before choosing routine care.",
    },
    {
      prompt: `A client-care question includes ${topicLabel}. Which response is most appropriate?`,
      correct: "Prioritize the safest nursing action that addresses the main clinical concern.",
    },
  ];

  return Array.from({ length: count }, (_, index) => {
    const template = templates[index % templates.length];
    const options = [
      template.correct,
      "Delay action until all routine care tasks are finished.",
      "Choose a comfort measure before checking for instability.",
      "Delegate the clinical judgment before completing a focused assessment.",
    ];

    return {
      subject: safeSubject,
      difficulty: examMode ? (index % 3 === 0 ? "hard" : safeDifficulty) : safeDifficulty,
      topic: topicLabel,
      type: "single_choice",
      prompt: template.prompt,
      correctAnswer: template.correct,
      options,
      rationale:
        "Correct Answer Explanation: The correct answer is best because it follows priority nursing judgment and protects client safety. Incorrect Options Explanation: The other choices delay assessment, focus on secondary comfort, or delegate judgment too early. Key Takeaway: In PNLE-style questions, prioritize safety, focused assessment, and the main clinical risk.",
      notes: `Key Takeaway: Link ${topicLabel} to the safest nursing priority.`,
    };
  });
}

export function buildFallbackReviewHelp({ userPrompt, question, selectedAnswer, correctAnswer, rationale, topic }) {
  return [
    `1. Direct answer\n${correctAnswer} is the best answer for this item. ${userPrompt ? `For your question: ${userPrompt}` : ""}`.trim(),
    `2. Why your answer was weaker\n${selectedAnswer || "The selected answer"} is weaker because it may miss the priority cue or delay the safest nursing action.`,
    `3. Clue in the question\nLook for the part of the stem pointing to ${topic || "the main clinical risk"} and decide whether assessment, safety, or urgent intervention comes first.`,
    `4. What to remember for boards\n${rationale || `For PNLE-style review, choose the answer that best protects safety and matches the highest-priority nursing judgment.`}`,
  ].join("\n\n");
}
