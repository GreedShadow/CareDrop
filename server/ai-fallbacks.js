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
    {
      prompt: `The nurse is planning care for a client with concerns related to ${topicLabel}. What should guide the first decision?`,
      correct: "Identify the finding that creates the greatest immediate safety risk.",
    },
    {
      prompt: `During review of ${topicLabel}, which choice best reflects PNLE priority-setting?`,
      correct: "Choose the response that protects airway, breathing, circulation, or prevents deterioration first.",
    },
    {
      prompt: `A student is comparing possible actions for ${topicLabel}. Which option is least likely to delay safe care?`,
      correct: "Use focused assessment cues to decide whether urgent intervention or escalation is needed.",
    },
    {
      prompt: `The stem points to ${topicLabel} and asks for the best nursing judgment. What is the safest approach?`,
      correct: "Match the action to the priority clinical cue instead of choosing routine care.",
    },
    {
      prompt: `A nurse receives a report involving ${topicLabel}. Which response shows the strongest safety thinking?`,
      correct: "Recognize possible deterioration early and respond before lower-priority tasks.",
    },
    {
      prompt: `When answering a board-style question about ${topicLabel}, which thinking rule is most useful?`,
      correct: "Separate urgent assessment findings from stable or comfort-focused details before choosing an answer.",
    },
  ];

  return Array.from({ length: count }, (_, index) => {
    const template = templates[index % templates.length];
    const distractorSets = [
      [
        "Delay action until all routine care tasks are finished.",
        "Choose a comfort measure before checking for instability.",
        "Delegate the clinical judgment before completing a focused assessment.",
      ],
      [
        "Document the finding first and reassess only at the next scheduled round.",
        "Give general reassurance before checking for a priority risk cue.",
        "Ask another team member to decide before gathering focused assessment data.",
      ],
      [
        "Start with a nonurgent teaching point even if the stem suggests possible deterioration.",
        "Postpone escalation until the client reports more severe symptoms.",
        "Focus on convenience and workflow before client safety.",
      ],
    ];
    const rawOptions = [template.correct, ...distractorSets[index % distractorSets.length]];
    const options = rawOptions.map((text, optionIndex) => ({
      id: ["a", "b", "c", "d"][optionIndex],
      text,
      rationale:
        optionIndex === 0
          ? `This is the best answer because it keeps ${topicLabel} tied to the priority assessment cue and client safety.`
          : "This is less appropriate because it delays focused assessment, urgent action, or escalation when the stem may point to risk.",
    }));

    return {
      subject: safeSubject,
      difficulty: examMode ? (index % 3 === 0 ? "hard" : safeDifficulty) : safeDifficulty,
      topic: topicLabel,
      type: "single_choice",
      source: "fallback",
      tags: ["priority", "assessment", "safety"],
      prompt: template.prompt,
      stem: template.prompt,
      correctAnswer: template.correct,
      correctOptionIds: ["a"],
      options,
      rationale: {
        correct:
          "The correct answer is best because it follows priority nursing judgment and protects client safety.",
        incorrect: {
          b: "This choice delays assessment or action when the stem may point to a priority risk.",
          c: "This choice focuses on a lower-priority comfort or routine action before safety is addressed.",
          d: "This choice shifts clinical judgment away from the nurse before focused assessment is complete.",
        },
        takeaway:
          "In PNLE-style questions, prioritize safety, focused assessment, and the main clinical risk.",
      },
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
