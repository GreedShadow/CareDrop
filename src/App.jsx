import { useEffect, useMemo, useRef, useState } from "react";
import MagicBento from "./MagicBento";

const STORAGE_KEY = "caredrop-dashboard-v2";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const FLASHCARD_SET_SIZE = 10;
const QUIZ_SET_SIZE = 20;

const C = {
  bg: "#F7F6F3",
  surface: "#FFFFFF",
  border: "#E8E4DC",
  accent: "#2D6A4F",
  accentLight: "#E8F5EE",
  accentMid: "#52B788",
  red: "#C1121F",
  redLight: "#FCECEA",
  amber: "#E76F00",
  amberLight: "#FFF3E0",
  blue: "#1D4ED8",
  blueLight: "#E8F0FF",
  text: "#1A1A1A",
  muted: "#6B7280",
  faint: "#9CA3AF",
  pill: "#F0EDE6",
};

const QUESTION_BANK = {
  Fundamentals: [
    { q: "What is the first priority when a patient suddenly becomes unresponsive?", a: "Assess responsiveness, call for help, and check airway, breathing, and circulation. Start CPR if no pulse is present.", difficulty: "easy", topic: "basic life support" },
    { q: "Why is hand hygiene the single most important nursing intervention?", a: "It breaks the chain of infection and prevents transmission of pathogens between patients, staff, and surfaces.", difficulty: "easy", topic: "infection control" },
    { q: "Which type of isolation is used for pulmonary tuberculosis?", a: "Airborne isolation in a negative-pressure room with N95 mask use.", difficulty: "medium", topic: "isolation precautions" },
    { q: "What is the best site to check capillary refill in an adult?", a: "The nail bed of a finger or toe. Normal refill is usually 2 seconds or less.", difficulty: "easy", topic: "assessment" },
    { q: "What is the safe angle for an intramuscular injection in adults?", a: "Ninety degrees into a large muscle such as the ventrogluteal or vastus lateralis site.", difficulty: "easy", topic: "medication administration" },
    { q: "Why is patient identification required before every medication pass?", a: "It reduces wrong-patient medication errors and supports safe administration standards.", difficulty: "easy", topic: "patient safety" },
    { q: "What is the nurse's priority when a patient reports chest pain?", a: "Assess pain, obtain vital signs, support oxygenation as ordered, and rapidly escalate because cardiac ischemia is time-sensitive.", difficulty: "medium", topic: "priority setting" },
    { q: "Why should side rails not be used as a routine restraint alternative?", a: "Improper use can increase injury risk and does not replace ongoing fall-prevention assessment.", difficulty: "medium", topic: "safety" },
    { q: "What is the purpose of the nursing process?", a: "It provides a systematic method for assessment, diagnosis, planning, implementation, and evaluation of care.", difficulty: "easy", topic: "nursing process" },
    { q: "What is the best first action when a sterile field becomes contaminated?", a: "Recognize the break in sterile technique and replace the contaminated field or item before continuing.", difficulty: "medium", topic: "sterile technique" },
  ],
  Pharmacology: [
    { q: "What is the priority assessment before administering digoxin?", a: "Check the apical pulse for 1 full minute and hold if it is below the ordered parameter. Also review potassium because hypokalemia increases toxicity risk.", difficulty: "medium", topic: "cardiac drugs" },
    { q: "A patient on heparin has an aPTT of 180 seconds. What is the antidote?", a: "Protamine sulfate. It reverses the anticoagulant effect of heparin and must be given carefully because it may cause hypotension.", difficulty: "hard", topic: "anticoagulants" },
    { q: "Why is metformin held before and after IV contrast procedures?", a: "Contrast can reduce kidney function, which raises the risk of metformin-associated lactic acidosis.", difficulty: "medium", topic: "antidiabetics" },
    { q: "What is the priority pre-administration assessment before IV morphine?", a: "Respiratory rate and level of consciousness. Hold and reassess if respirations are significantly depressed.", difficulty: "easy", topic: "opioids" },
    { q: "What is the antidote for acetaminophen overdose?", a: "N-acetylcysteine, which replenishes glutathione and reduces liver injury when given early.", difficulty: "hard", topic: "toxicology" },
    { q: "Which lab value is most important before giving warfarin?", a: "The INR. It shows anticoagulation intensity and helps determine bleeding risk.", difficulty: "medium", topic: "anticoagulants" },
    { q: "What teaching is essential for a patient taking furosemide?", a: "Monitor for dizziness, dehydration, and low potassium, and rise slowly to prevent orthostatic hypotension.", difficulty: "easy", topic: "diuretics" },
    { q: "Why should nitroglycerin tablets be stored in their original dark bottle?", a: "Nitroglycerin is sensitive to light and moisture, which can reduce potency if stored improperly.", difficulty: "easy", topic: "antianginals" },
    { q: "What adverse effect should be watched for after insulin administration?", a: "Hypoglycemia, especially if food intake is delayed or the dose is too high.", difficulty: "easy", topic: "insulin" },
    { q: "Why should aminoglycosides be monitored carefully?", a: "They can cause nephrotoxicity and ototoxicity, so kidney function and hearing-related symptoms matter.", difficulty: "medium", topic: "antibiotics" },
  ],
  "Medical-Surgical": [
    { q: "A post-op patient has urine output of 15 mL/hour for 3 hours. What does this suggest?", a: "Oliguria. It may indicate hypovolemia, renal hypoperfusion, or obstruction and requires prompt assessment.", difficulty: "medium", topic: "renal" },
    { q: "What does tracheal deviation away from the affected side indicate?", a: "Tension pneumothorax, a life-threatening emergency requiring immediate decompression.", difficulty: "hard", topic: "respiratory" },
    { q: "Which electrolyte imbalance causes tall peaked T-waves?", a: "Hyperkalemia. Severe cases can progress to lethal dysrhythmias.", difficulty: "hard", topic: "electrolytes" },
    { q: "A patient with pulmonary embolism usually presents with what sudden symptom pattern?", a: "Sudden dyspnea, pleuritic chest pain, tachycardia, and possible hypoxemia.", difficulty: "hard", topic: "cardiovascular" },
    { q: "Why is Homans' sign no longer used to diagnose DVT?", a: "It is unreliable and may be negative even in true DVT. Doppler ultrasound is preferred.", difficulty: "medium", topic: "vascular" },
    { q: "What is the nurse's priority action for suspected hypoglycemia in a conscious diabetic patient?", a: "Give 15 grams of fast-acting carbohydrate, then recheck blood glucose after 15 minutes.", difficulty: "easy", topic: "endocrine" },
    { q: "What is the earliest sign of increased intracranial pressure?", a: "A change in level of consciousness, such as restlessness or confusion.", difficulty: "hard", topic: "neurologic" },
    { q: "Which finding after thyroidectomy requires immediate action?", a: "Stridor or respiratory distress, which may indicate airway obstruction or hemorrhage.", difficulty: "hard", topic: "post-op care" },
    { q: "What is the best position for a patient with acute dyspnea?", a: "High Fowler's or the most upright tolerated position to support ventilation.", difficulty: "easy", topic: "respiratory" },
    { q: "What should the nurse suspect when a patient with GI bleeding becomes cool, pale, and tachycardic?", a: "Hypovolemic shock from blood loss requiring urgent assessment, support, and escalation.", difficulty: "hard", topic: "shock" },
  ],
  "Maternal & Newborn": [
    { q: "Late decelerations during labor usually mean what?", a: "Uteroplacental insufficiency. Reposition, give oxygen, increase fluids, stop oxytocin, and notify the provider.", difficulty: "hard", topic: "fetal monitoring" },
    { q: "What are the 4 Ts of postpartum hemorrhage?", a: "Tone, Trauma, Tissue, and Thrombin.", difficulty: "medium", topic: "postpartum" },
    { q: "What is the expected fundal location immediately after delivery?", a: "At the level of the umbilicus.", difficulty: "easy", topic: "postpartum" },
    { q: "What does HELLP stand for?", a: "Hemolysis, Elevated Liver enzymes, and Low Platelets.", difficulty: "hard", topic: "complications" },
    { q: "A newborn with an Apgar score of 4 at 1 minute needs what general response?", a: "Prompt resuscitative support such as stimulation and assisted breathing as indicated, then reassessment.", difficulty: "medium", topic: "newborn" },
    { q: "What is the priority finding in placental abruption?", a: "Painful vaginal bleeding with a tender, rigid uterus and fetal distress.", difficulty: "hard", topic: "antepartum complications" },
    { q: "What is a priority nursing intervention for a patient receiving magnesium sulfate?", a: "Monitor respirations, deep tendon reflexes, and urine output for toxicity.", difficulty: "medium", topic: "high-risk pregnancy" },
    { q: "Why is skin-to-skin contact encouraged after birth?", a: "It promotes thermoregulation, bonding, breastfeeding, and newborn stabilization.", difficulty: "easy", topic: "newborn care" },
    { q: "What assessment finding suggests uterine atony?", a: "A boggy uterus with increased postpartum bleeding.", difficulty: "medium", topic: "postpartum" },
    { q: "Why should the nurse monitor lochia after delivery?", a: "Changes in amount, color, or odor can signal expected recovery or possible complications.", difficulty: "easy", topic: "postpartum" },
  ],
  Pediatrics: [
    { q: "A child with drooling, tripod position, and muffled voice most likely has what emergency?", a: "Epiglottitis. Avoid throat examination and prepare for airway support.", difficulty: "hard", topic: "respiratory emergencies" },
    { q: "What is the epinephrine dose rule for pediatric anaphylaxis?", a: "0.01 mg/kg of 1:1000 intramuscularly, usually into the anterolateral thigh.", difficulty: "hard", topic: "emergency" },
    { q: "Why is respiratory rate a critical pediatric assessment?", a: "Children compensate until late, so an increased respiratory rate can be an early sign of deterioration.", difficulty: "easy", topic: "vital signs" },
    { q: "What is a classic sign of dehydration in an infant?", a: "Sunken fontanelle, along with dry mucous membranes and fewer wet diapers.", difficulty: "easy", topic: "fluids" },
    { q: "What is the priority teaching for oral rehydration therapy?", a: "Give small, frequent sips and continue reassessing hydration status.", difficulty: "easy", topic: "fluids" },
    { q: "What is the priority action for a febrile child actively seizing?", a: "Protect the airway and child from injury, do not restrain, and time the seizure.", difficulty: "medium", topic: "neurologic" },
    { q: "Why should aspirin generally be avoided in children with viral illness?", a: "Because it is associated with Reye syndrome.", difficulty: "medium", topic: "medication safety" },
    { q: "What is the priority sign of severe bronchiolitis or asthma in a child?", a: "Increasing work of breathing, fatigue, and decreasing oxygen saturation.", difficulty: "hard", topic: "respiratory" },
    { q: "Why are weight-based doses used in pediatrics?", a: "Because medication safety depends on matching the dose to the child's size and developmental needs.", difficulty: "easy", topic: "medication safety" },
    { q: "What is the first concern when assessing a child with persistent vomiting and diarrhea?", a: "Fluid volume deficit and the risk of rapid dehydration.", difficulty: "medium", topic: "fluids" },
  ],
  "Psychiatric Nursing": [
    { q: "What is the best therapeutic response to 'Nobody cares about me'?", a: "It sounds like you're feeling very alone right now.", difficulty: "medium", topic: "therapeutic communication" },
    { q: "What syndrome is suggested by muscle rigidity, high fever, and altered mental status after antipsychotic use?", a: "Neuroleptic malignant syndrome.", difficulty: "hard", topic: "adverse effects" },
    { q: "What is the therapeutic lithium range?", a: "Typically 0.6 to 1.2 mEq/L, with higher levels increasing toxicity risk.", difficulty: "medium", topic: "mood stabilizers" },
    { q: "What severe alcohol withdrawal complication peaks at 24 to 72 hours?", a: "Delirium tremens.", difficulty: "hard", topic: "withdrawal" },
    { q: "What is the priority when a patient voices suicidal intent?", a: "Ensure safety through direct assessment, close observation, and immediate escalation per protocol.", difficulty: "hard", topic: "crisis intervention" },
    { q: "Why are open-ended questions used in therapeutic communication?", a: "They invite the patient to share more freely and help the nurse assess thoughts and feelings.", difficulty: "easy", topic: "communication" },
    { q: "What is a common SSRI teaching point?", a: "Benefits may take several weeks, and the patient should watch for worsening mood or suicidal thoughts early in treatment.", difficulty: "medium", topic: "antidepressants" },
    { q: "How should the nurse respond to hallucinations?", a: "Acknowledge the patient's experience without validating the hallucination as real, then refocus on reality and safety.", difficulty: "medium", topic: "psychosis" },
    { q: "What is the therapeutic goal of setting limits?", a: "To maintain safety and structure while remaining calm, consistent, and respectful.", difficulty: "easy", topic: "behavior management" },
    { q: "Why is medication adherence teaching important in bipolar disorder?", a: "Stopping medication abruptly can trigger relapse, instability, and safety risks.", difficulty: "medium", topic: "mood disorders" },
  ],
  "Community Health": [
    { q: "What disease does the DOH DOTS program primarily address?", a: "Tuberculosis.", difficulty: "easy", topic: "infectious disease" },
    { q: "What level of prevention does immunization belong to?", a: "Primary prevention.", difficulty: "easy", topic: "prevention" },
    { q: "What dengue warning signs should trigger urgent referral?", a: "Persistent vomiting, severe abdominal pain, bleeding, lethargy, and respiratory distress.", difficulty: "medium", topic: "endemic disease" },
    { q: "What is contact tracing used for in public health?", a: "To identify exposed individuals, interrupt transmission, and guide monitoring or treatment.", difficulty: "medium", topic: "surveillance" },
    { q: "Why is health teaching important in barangay nursing?", a: "It improves prevention, early recognition, treatment adherence, and community participation.", difficulty: "easy", topic: "health promotion" },
    { q: "What is the priority nursing response to a suspected measles outbreak?", a: "Prompt reporting, isolation measures, contact follow-up, and immunization review.", difficulty: "hard", topic: "outbreak response" },
    { q: "What is the nurse's role in disaster triage?", a: "Sort patients by urgency to maximize survival and use resources effectively.", difficulty: "medium", topic: "disaster nursing" },
    { q: "What is tertiary prevention?", a: "Measures that reduce complications and improve function after disease is established.", difficulty: "medium", topic: "prevention" },
    { q: "Why is safe water education important in community nursing?", a: "It reduces preventable diarrheal disease and supports family-level prevention.", difficulty: "easy", topic: "sanitation" },
    { q: "What is the purpose of directly observed therapy in TB care?", a: "It improves adherence and lowers the risk of treatment failure and resistance.", difficulty: "medium", topic: "infectious disease" },
  ],
  "Leadership & Management": [
    { q: "Which task is appropriate for UAP delegation?", a: "Obtaining routine vital signs on a stable patient.", difficulty: "easy", topic: "delegation" },
    { q: "What responsibilities cannot be delegated by the nurse?", a: "Assessment, teaching, evaluation, and judgment-based clinical decisions.", difficulty: "medium", topic: "delegation" },
    { q: "What is the best first response to a conflict between team members during a shift?", a: "Address it early, privately, and professionally to protect patient care and team function.", difficulty: "medium", topic: "conflict management" },
    { q: "What is the nurse manager's priority during a medication error event?", a: "Protect the patient, assess for harm, report the event, and support accurate documentation.", difficulty: "hard", topic: "safety" },
    { q: "When assigning patients, what factor should be prioritized?", a: "Patient acuity and the competence of available staff.", difficulty: "medium", topic: "assignment" },
    { q: "What is the purpose of incident reporting?", a: "To improve safety and systems, not to punish staff.", difficulty: "easy", topic: "quality improvement" },
    { q: "What is the best task for a float nurse who is unfamiliar with a unit?", a: "Stable patients and routine tasks within clearly verified competency.", difficulty: "medium", topic: "staffing" },
    { q: "Why is closed-loop communication important during emergencies?", a: "It confirms that directions were heard, understood, and acted on.", difficulty: "hard", topic: "communication" },
    { q: "What is the nurse leader's role during staffing shortage?", a: "Prioritize patient safety, match assignments carefully, and communicate escalation needs early.", difficulty: "hard", topic: "staffing" },
    { q: "Why is delegation follow-up important?", a: "The nurse remains accountable for the outcome and must verify that the task was completed safely.", difficulty: "medium", topic: "delegation" },
  ],
};

const SUBJECT_OPTIONS = [...Object.keys(QUESTION_BANK), "Mixed Review"];
const DIFFICULTIES = ["All", "easy", "medium", "hard"];
const ENCOURAGEMENTS = [
  "You've got this, future RN.",
  "One focused session at a time still counts.",
  "Read the stem slowly. Your nursing judgment is getting stronger.",
  "Progress matters more than perfection.",
  "The board exam is hard. You're training for it every day.",
];

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function normalize(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function useWindowWidth() {
  const [width, setWidth] = useState(typeof window === "undefined" ? 1200 : window.innerWidth);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return width;
}

function buildStudyText(noteText, uploadedText) {
  return [uploadedText, noteText].filter(Boolean).join("\n\n").trim();
}

function buildLocalSummary(text) {
  const cleaned = String(text || "").replace(/\r/g, " ").trim();
  if (!cleaned) {
    return "Paste notes or upload a document to generate a reviewer summary.";
  }

  const parts = cleaned
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);

  if (!parts.length) {
    return "Paste notes or upload a document to generate a reviewer summary.";
  }

  return parts.map((line, index) => `${index + 1}. ${line}`).join("\n");
}

function toFlashcard(entry, subject) {
  return {
    id: `${subject}-${normalize(entry.q)}`,
    subject,
    difficulty: entry.difficulty || "medium",
    topic: entry.topic || "general",
    question: entry.q,
    answer: entry.a,
    rationale: entry.a,
    notes: `Focus area: ${entry.topic || "general review"}.`,
  };
}

function getAllEntries() {
  return Object.entries(QUESTION_BANK).flatMap(([subject, entries]) =>
    entries.map((entry) => ({ ...entry, subject }))
  );
}

function getFilteredEntries(subject, difficulty, topic) {
  const source =
    subject === "Mixed Review"
      ? getAllEntries()
      : (QUESTION_BANK[subject] || []).map((entry) => ({ ...entry, subject }));

  return source.filter((entry) => {
    const matchesDifficulty = difficulty === "All" ? true : entry.difficulty === difficulty;
    const matchesTopic = topic
      ? `${entry.topic} ${entry.q} ${entry.a}`.toLowerCase().includes(topic.toLowerCase())
      : true;
    return matchesDifficulty && matchesTopic;
  });
}

function buildFlashcardCandidates(subject, difficulty, topic) {
  const pools = [
    getFilteredEntries(subject, difficulty, topic),
    getFilteredEntries(subject, difficulty, ""),
    getFilteredEntries(subject, "All", topic),
    getFilteredEntries(subject, "All", ""),
    getFilteredEntries("Mixed Review", difficulty, topic),
    getFilteredEntries("Mixed Review", "All", ""),
  ];

  return uniqueBy(
    pools.flat().map((entry) => toFlashcard(entry, entry.subject)),
    (item) => item.id
  );
}

function buildQuizVariants(entry) {
  return [
    { prompt: entry.q, rationale: entry.a },
    {
      prompt: `Which statement is most accurate about ${entry.topic} in ${entry.subject}?`,
      rationale: entry.a,
    },
    {
      prompt: `A nursing student is reviewing ${entry.topic}. Which response is correct?`,
      rationale: entry.a,
    },
  ];
}

function buildDistractors(correctAnswer, pool) {
  const distractors = uniqueBy(
    shuffle(pool.filter((item) => normalize(item.a) !== normalize(correctAnswer))),
    (item) => normalize(item.a)
  )
    .slice(0, 3)
    .map((item) => item.a);

  const fallback = [
    "Document the finding and continue routine monitoring.",
    "Delay action until more data becomes available.",
    "Delegate the task before completing the assessment.",
  ];

  while (distractors.length < 3) {
    distractors.push(fallback[distractors.length]);
  }

  return shuffle([correctAnswer, ...distractors]).slice(0, 4);
}

function buildLocalQuizFallback(subject, difficulty, topic, count, usedPrompts = []) {
  const allEntries = getAllEntries();
  const prioritized = uniqueBy(
    [
      ...getFilteredEntries(subject, difficulty, topic),
      ...getFilteredEntries(subject, difficulty, ""),
      ...getFilteredEntries(subject, "All", topic),
      ...getFilteredEntries(subject, "All", ""),
      ...getFilteredEntries("Mixed Review", difficulty, topic),
      ...allEntries,
    ],
    (entry) => `${entry.subject}-${normalize(entry.q)}`
  );

  const questions = [];

  for (const entry of prioritized) {
    for (const variant of buildQuizVariants(entry)) {
      const normalizedPrompt = normalize(variant.prompt);
      if (!normalizedPrompt || usedPrompts.includes(normalizedPrompt)) {
        continue;
      }

      questions.push({
        id: `${entry.subject}-${uid()}`,
        subject: entry.subject,
        difficulty: entry.difficulty,
        topic: entry.topic,
        prompt: variant.prompt,
        correctAnswer: entry.a,
        options: buildDistractors(entry.a, allEntries),
        rationale: variant.rationale,
        notes: `Topic focus: ${entry.topic}.`,
        userAnswer: null,
      });

      if (questions.length >= count) {
        return questions;
      }
    }
  }

  return questions;
}

function sanitizeFlashcards(cards, subject, topic, usedIds, allowRepeat) {
  return uniqueBy(
    (Array.isArray(cards) ? cards : []).map((card) => {
      const nextSubject = card.subject || subject || "Mixed Review";
      const question = String(card.question || card.prompt || "").trim();
      const answer = String(card.answer || "").trim();
      return {
        id: `${nextSubject}-${normalize(question)}`,
        subject: nextSubject,
        difficulty: ["easy", "medium", "hard"].includes(card.difficulty) ? card.difficulty : "medium",
        topic: topic || "ai review",
        question,
        answer,
        rationale: String(card.rationale || answer || "Generated by Claude."),
        notes: String(card.notes || `Topic focus: ${topic || "general review"}.`),
      };
    }),
    (card) => card.id
  ).filter(
    (card) =>
      card.question &&
      card.answer &&
      (allowRepeat ? true : !usedIds.includes(card.id))
  );
}

function sanitizeQuizQuestions(questions, subject, topic, usedPrompts, allowRepeat) {
  return uniqueBy(
    (Array.isArray(questions) ? questions : []).map((item) => {
      const prompt = String(item.prompt || item.question || "").trim();
      const options = uniqueBy(
        (Array.isArray(item.options) ? item.options : [])
          .map((option) => String(option || "").trim())
          .filter(Boolean),
        (option) => normalize(option)
      );

      return {
        id: item.id || uid(),
        subject: item.subject || subject || "Mixed Review",
        difficulty: ["easy", "medium", "hard"].includes(item.difficulty) ? item.difficulty : "medium",
        topic: topic || item.topic || "ai review",
        prompt,
        correctAnswer: String(item.correctAnswer || "").trim(),
        options,
        rationale: String(item.rationale || item.correctAnswer || "").trim(),
        notes: String(item.notes || `Topic focus: ${topic || "general review"}.`),
        userAnswer: item.userAnswer ?? null,
      };
    }),
    (item) => normalize(item.prompt)
  ).filter((item) => {
    const valid = item.prompt && item.correctAnswer && item.options.length >= 4;
    const notUsed = allowRepeat ? true : !usedPrompts.includes(normalize(item.prompt));
    const includesCorrect = item.options.some((option) => normalize(option) === normalize(item.correctAnswer));
    return valid && notUsed && includesCorrect;
  });
}

function buildSessionLabel(session) {
  return `${session.subject}${session.topic ? ` - ${session.topic}` : ""} (${session.mode})`;
}

function loadPersisted() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function postJson(path, payload) {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();
  let data;

  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(
      rawText.includes("<!DOCTYPE") || rawText.startsWith("The page")
        ? "AI server is not returning JSON. If you deployed only the frontend, move the Express backend to Render or set VITE_API_BASE_URL to the live API."
        : "AI returned an invalid response. Please try again."
    );
  }

  if (!response.ok) {
    throw new Error(data.error || "AI request failed.");
  }

  return data;
}

function Badge({ label, color = "gray" }) {
  const styles = {
    green: { bg: C.accentLight, text: C.accent },
    red: { bg: C.redLight, text: C.red },
    amber: { bg: C.amberLight, text: C.amber },
    blue: { bg: C.blueLight, text: C.blue },
    gray: { bg: C.pill, text: C.muted },
  };
  const style = styles[color] || styles.gray;

  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.04em",
        padding: "3px 9px",
        borderRadius: 999,
        background: style.bg,
        color: style.text,
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}

function Flashcard({ card, idx, total, onRate }) {
  const [flipped, setFlipped] = useState(false);
  const prevCardId = useRef(card?.id);

  useEffect(() => {
    if (prevCardId.current !== card?.id) {
      setFlipped(false);
      prevCardId.current = card?.id;
    }
  }, [card?.id]);

  if (!card) {
    return null;
  }

  const diffColor =
    card.difficulty === "hard" ? "red" : card.difficulty === "medium" ? "amber" : "green";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            flex: 1,
            height: 4,
            background: C.border,
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${((idx + 1) / Math.max(total, 1)) * 100}%`,
              height: "100%",
              background: C.accentMid,
              borderRadius: 999,
              transition: "width 0.3s ease",
            }}
          />
        </div>
        <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>
          {idx + 1} / {total}
        </span>
      </div>

      <div
        onClick={() => setFlipped((value) => !value)}
        style={{
          cursor: "pointer",
          minHeight: 260,
          background: flipped ? `linear-gradient(135deg, ${C.accentLight} 0%, #fff 100%)` : C.surface,
          border: `1.5px solid ${flipped ? C.accentMid : C.border}`,
          borderRadius: 22,
          padding: "28px 28px 24px",
          transition: "all 0.25s ease",
          userSelect: "none",
          boxShadow: "0 12px 24px rgba(15, 23, 42, 0.05)",
        }}
      >
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <Badge label={card.subject} color="blue" />
          <Badge label={card.topic} color="gray" />
          <Badge label={card.difficulty} color={diffColor} />
          {flipped ? <Badge label="Answer" color="green" /> : null}
        </div>

        {!flipped ? (
          <>
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
            <div style={{ fontSize: 19, fontWeight: 700, color: C.text, lineHeight: 1.55 }}>
              {card.question}
            </div>
            <div style={{ marginTop: 20, fontSize: 12, color: C.faint, textAlign: "center" }}>
              Tap to reveal answer
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                fontSize: 11,
                color: C.accent,
                fontWeight: 700,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              Rationale
            </div>
            <div style={{ fontSize: 15, color: C.text, lineHeight: 1.7 }}>{card.answer}</div>
            <div
              style={{
                marginTop: 16,
                padding: 14,
                borderRadius: 14,
                background: "#FAFBF8",
                border: `1px solid ${C.border}`,
                fontSize: 13,
                lineHeight: 1.65,
                color: C.muted,
              }}
            >
              {card.notes}
            </div>
          </>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          opacity: flipped ? 1 : 0,
          transition: "opacity 0.2s ease",
          pointerEvents: flipped ? "auto" : "none",
          flexWrap: "wrap",
        }}
      >
        {[
          { label: "Missed it", key: "again", color: C.red, bg: C.redLight },
          { label: "Unsure", key: "hard", color: C.amber, bg: C.amberLight },
          { label: "Got it", key: "easy", color: C.accent, bg: C.accentLight },
        ].map((button) => (
          <button
            key={button.key}
            onClick={() => onRate(button.key)}
            style={{
              flex: 1,
              minWidth: 120,
              padding: "11px 14px",
              borderRadius: 12,
              border: `1.5px solid ${button.color}`,
              background: button.bg,
              color: button.color,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {button.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function AIPanel({
  apiLoading,
  aiResponse,
  onGenerate,
  onAsk,
  question,
  setQuestion,
  buttonLabel,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <button
        onClick={onGenerate}
        disabled={apiLoading}
        style={{
          padding: "13px 20px",
          borderRadius: 12,
          background: apiLoading ? C.border : C.accent,
          color: apiLoading ? C.muted : "#fff",
          border: "none",
          fontWeight: 700,
          fontSize: 14,
          cursor: apiLoading ? "not-allowed" : "pointer",
        }}
      >
        {apiLoading ? "Generating..." : buttonLabel}
      </button>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onAsk();
            }
          }}
          placeholder="Ask Claude about a nursing concept..."
          style={{
            flex: 1,
            minWidth: 220,
            padding: "10px 14px",
            borderRadius: 10,
            border: `1px solid ${C.border}`,
            background: C.bg,
            fontSize: 13,
            color: C.text,
            outline: "none",
          }}
        />
        <button
          onClick={onAsk}
          disabled={apiLoading || !question.trim()}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            background: apiLoading || !question.trim() ? C.border : C.accentMid,
            color: apiLoading || !question.trim() ? C.muted : "#fff",
            border: "none",
            fontWeight: 700,
            fontSize: 13,
            cursor: apiLoading || !question.trim() ? "not-allowed" : "pointer",
          }}
        >
          Ask
        </button>
      </div>

      {aiResponse ? (
        <div
          style={{
            background: C.accentLight,
            border: `1px solid ${C.accentMid}`,
            borderRadius: 12,
            padding: "14px 16px",
            fontSize: 13,
            color: C.text,
            lineHeight: 1.7,
            maxHeight: 220,
            overflowY: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: C.accent,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Claude's Response
          </div>
          {aiResponse}
        </div>
      ) : null}
    </div>
  );
}

function SavedSessionCard({ session, onOpen, onDelete }) {
  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: 14,
        background: "#FBFAF7",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{buildSessionLabel(session)}</div>
          <div style={{ fontSize: 12, color: C.muted }}>
            {new Date(session.createdAt).toLocaleString()}
          </div>
        </div>
        <Badge label={`${session.questions.length} items`} color="blue" />
      </div>
      <div style={{ fontSize: 12, color: C.muted }}>{session.sourceLabel}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={() => onOpen(session)}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            background: C.accentLight,
            color: C.accent,
            border: `1px solid ${C.accentMid}`,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Open
        </button>
        <button
          onClick={() => onDelete(session.id)}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            background: C.redLight,
            color: C.red,
            border: `1px solid ${C.red}`,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const width = useWindowWidth();
  const persisted = loadPersisted();
  const [subject, setSubject] = useState(persisted?.subject || "Pharmacology");
  const [difficulty, setDifficulty] = useState(persisted?.difficulty || "All");
  const [topicFilter, setTopicFilter] = useState(persisted?.topicFilter || "");
  const [mode, setMode] = useState(persisted?.mode || "flashcard");
  const [flashcards, setFlashcards] = useState([]);
  const [cardIdx, setCardIdx] = useState(0);
  const [quiz, setQuiz] = useState([]);
  const [quizIdx, setQuizIdx] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [ratings, setRatings] = useState(persisted?.ratings || {});
  const [sessions, setSessions] = useState(persisted?.sessions || 0);
  const [savedQuizSessions, setSavedQuizSessions] = useState(persisted?.savedQuizSessions || []);
  const [usedFlashcardIds, setUsedFlashcardIds] = useState(persisted?.usedFlashcardIds || []);
  const [usedQuizPrompts, setUsedQuizPrompts] = useState(persisted?.usedQuizPrompts || []);
  const [apiLoading, setApiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState("");
  const [apiError, setApiError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [question, setQuestion] = useState("");
  const [gentlePush, setGentlePush] = useState(ENCOURAGEMENTS[0]);
  const [noteText, setNoteText] = useState(persisted?.noteText || "");
  const [uploadedText, setUploadedText] = useState(persisted?.uploadedText || "");
  const [uploadedFileName, setUploadedFileName] = useState(persisted?.uploadedFileName || "");
  const [summaryText, setSummaryText] = useState(
    persisted?.summaryText || "Paste notes or upload a document to generate a reviewer summary."
  );
  const [filterWeakOnly, setFilterWeakOnly] = useState(persisted?.filterWeakOnly || false);
  const [lastQuizSignature, setLastQuizSignature] = useState("");

  const usedFlashcardIdsRef = useRef(usedFlashcardIds);
  const usedQuizPromptsRef = useRef(usedQuizPrompts);
  const sessionsCountedRef = useRef(new Set());

  useEffect(() => {
    usedFlashcardIdsRef.current = usedFlashcardIds;
  }, [usedFlashcardIds]);

  useEffect(() => {
    usedQuizPromptsRef.current = usedQuizPrompts;
  }, [usedQuizPrompts]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setGentlePush(ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)]);
    }, 8000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        subject,
        difficulty,
        topicFilter,
        mode,
        ratings,
        sessions,
        savedQuizSessions,
        usedFlashcardIds,
        usedQuizPrompts,
        noteText,
        uploadedText,
        uploadedFileName,
        summaryText,
        filterWeakOnly,
      })
    );
  }, [
    subject,
    difficulty,
    topicFilter,
    mode,
    ratings,
    sessions,
    savedQuizSessions,
    usedFlashcardIds,
    usedQuizPrompts,
    noteText,
    uploadedText,
    uploadedFileName,
    summaryText,
    filterWeakOnly,
  ]);

  const studyText = buildStudyText(noteText, uploadedText);
  const hasCustomSource = Boolean(studyText);

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
  const answeredCount = quiz.filter((item) => item.userAnswer !== null).length;
  const correctCount = quiz.filter(
    (item) => item.userAnswer && normalize(item.userAnswer) === normalize(item.correctAnswer)
  ).length;
  const currentCorrect =
    !!quizItem &&
    quizItem.userAnswer !== null &&
    normalize(quizItem.userAnswer) === normalize(quizItem.correctAnswer);
  const progressPercent = quiz.length ? Math.round((answeredCount / quiz.length) * 100) : 0;

  function clearMessages() {
    setApiError("");
    setStatusMessage("");
  }

  function markFlashcardsAsUsed(deck) {
    if (hasCustomSource || filterWeakOnly) {
      return;
    }

    setUsedFlashcardIds((prev) => uniqueBy([...prev, ...deck.map((card) => card.id)], (value) => value));
  }

  function buildLocalFlashcardSet() {
    let candidates = buildFlashcardCandidates(subject, difficulty, topicFilter);

    if (filterWeakOnly) {
      candidates = candidates.filter((card) => weakCardIds.includes(card.id));
    }

    if (!hasCustomSource) {
      candidates = candidates.filter((card) => !usedFlashcardIdsRef.current.includes(card.id));
    }

    return shuffle(candidates).slice(0, FLASHCARD_SET_SIZE);
  }

  function loadLocalFlashcardSet(message) {
    const deck = buildLocalFlashcardSet();
    setFlashcards(deck);
    setCardIdx(0);
    markFlashcardsAsUsed(deck);

    if (message) {
      if (deck.length >= FLASHCARD_SET_SIZE) {
        setStatusMessage(message);
      } else if (deck.length > 0) {
        setStatusMessage(`Showing ${deck.length} cards for this filter. Add notes or reset the rotation for a fresh set.`);
      } else {
        setStatusMessage("No fresh cards left for this filter. Reset the rotation or upload notes for a focused set.");
      }
    }
  }

  useEffect(() => {
    loadLocalFlashcardSet("");
  }, [subject, difficulty, topicFilter, filterWeakOnly]);

  useEffect(() => {
    if (!quiz.length || answeredCount !== quiz.length || sessionsCountedRef.current.has(lastQuizSignature)) {
      return;
    }

    sessionsCountedRef.current.add(lastQuizSignature);
    setSessions((value) => value + 1);
  }, [quiz, answeredCount, lastQuizSignature]);

  async function generateClaudeFlashcards() {
    clearMessages();
    setApiLoading(true);

    try {
      const data = await postJson("/api/claude/cards", {
        notes: studyText,
        subject,
        topic: topicFilter,
        count: FLASHCARD_SET_SIZE,
        excludeQuestions: hasCustomSource
          ? []
          : usedFlashcardIdsRef.current.map((id) => id.split("-").slice(1).join("-")),
      });

      const aiCards = sanitizeFlashcards(
        data.cards,
        subject,
        topicFilter,
        usedFlashcardIdsRef.current,
        hasCustomSource
      );
      const needed = Math.max(0, FLASHCARD_SET_SIZE - aiCards.length);
      const fallback = needed
        ? buildLocalFlashcardSet()
            .filter((card) => !aiCards.some((item) => item.id === card.id))
            .slice(0, needed)
        : [];
      const deck = [...aiCards, ...fallback].slice(0, FLASHCARD_SET_SIZE);

      setFlashcards(deck);
      setCardIdx(0);
      markFlashcardsAsUsed(deck);
      setStatusMessage(
        deck.length >= FLASHCARD_SET_SIZE
          ? "Claude generated a fresh 10-card flashcard set."
          : `Claude returned ${deck.length} cards for this focus.`
      );
    } catch (error) {
      setApiError(error.message || "Claude flashcards failed. Using local cards instead.");
      loadLocalFlashcardSet("Claude flashcards were unavailable, so the local deck was loaded.");
    } finally {
      setApiLoading(false);
    }
  }

  async function generateQuiz() {
    clearMessages();
    setApiLoading(true);
    setShowFeedback(false);

    try {
      const data = await postJson("/api/claude/quiz", {
        notes: studyText,
        subject,
        topic: topicFilter,
        difficulty: difficulty === "All" ? "mixed" : difficulty,
        count: QUIZ_SET_SIZE,
        excludeQuestions: hasCustomSource ? [] : usedQuizPromptsRef.current,
      });

      const aiQuestions = sanitizeQuizQuestions(
        data.questions,
        subject,
        topicFilter,
        usedQuizPromptsRef.current,
        hasCustomSource
      );
      const fallback = buildLocalQuizFallback(
        subject,
        difficulty,
        topicFilter,
        QUIZ_SET_SIZE - aiQuestions.length,
        [
          ...usedQuizPromptsRef.current,
          ...aiQuestions.map((item) => normalize(item.prompt)),
        ]
      );
      const questions = [...aiQuestions, ...fallback].slice(0, QUIZ_SET_SIZE);

      setQuiz(questions);
      setQuizIdx(0);
      setMode("quiz");
      setLastQuizSignature(`${Date.now()}-${questions[0]?.id || uid()}`);
      setStatusMessage(
        questions.length >= QUIZ_SET_SIZE
          ? "20 quiz questions are ready for review."
          : `Loaded ${questions.length} questions for this focus.`
      );

      if (!hasCustomSource) {
        setUsedQuizPrompts((prev) =>
          uniqueBy(
            [...prev, ...questions.map((item) => normalize(item.prompt))],
            (value) => value
          )
        );
      }
    } catch (error) {
      const fallback = buildLocalQuizFallback(
        subject,
        difficulty,
        topicFilter,
        QUIZ_SET_SIZE,
        hasCustomSource ? [] : usedQuizPromptsRef.current
      );
      setQuiz(fallback);
      setQuizIdx(0);
      setMode("quiz");
      setLastQuizSignature(`${Date.now()}-${fallback[0]?.id || uid()}`);
      setApiError(
        error.message || "Claude quiz generation failed. A local 20-question backup quiz has been loaded."
      );
      if (!hasCustomSource) {
        setUsedQuizPrompts((prev) =>
          uniqueBy(
            [...prev, ...fallback.map((item) => normalize(item.prompt))],
            (value) => value
          )
        );
      }
    } finally {
      setApiLoading(false);
    }
  }

  async function generateSummary() {
    const notes = studyText.trim();
    if (!notes) {
      setApiError("Add notes or upload a file before asking Claude for a summary.");
      return;
    }

    clearMessages();
    setApiLoading(true);

    try {
      const data = await postJson("/api/claude/summary", { notes });
      setSummaryText(data.summary || buildLocalSummary(notes));
      setStatusMessage("Claude generated a reviewer summary from your notes.");
    } catch (error) {
      setSummaryText(buildLocalSummary(notes));
      setApiError(error.message || "Claude summary failed. A local reviewer summary was generated instead.");
    } finally {
      setApiLoading(false);
    }
  }

  async function askClaude() {
    if (!question.trim()) {
      return;
    }

    clearMessages();
    setApiLoading(true);
    setAiResponse("");

    try {
      const data = await postJson("/api/claude/ask", {
        question,
        subject,
        topic: topicFilter,
        notes: studyText,
      });

      setAiResponse(data.response || "No response returned.");
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

  function handleRate(key) {
    if (!currentCard) {
      return;
    }

    setRatings((prev) => ({
      ...prev,
      [currentCard.id]: key,
    }));

    if (cardIdx < flashcards.length - 1) {
      setCardIdx((value) => value + 1);
      return;
    }

    setSessions((value) => value + 1);
    loadLocalFlashcardSet("A new 10-card flashcard set is ready.");
  }

  function handleQuizAnswer(option) {
    if (!quizItem || quizItem.userAnswer !== null) {
      return;
    }

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
    setShowFeedback(true);
  }

  function saveCurrentQuiz() {
    if (!quiz.length) {
      return;
    }

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
    };

    setSavedQuizSessions((prev) => [session, ...prev].slice(0, 12));
    setStatusMessage("Quiz session saved. You can reopen it from Saved Review Sessions.");
  }

  function openSavedQuiz(session) {
    setQuiz(session.questions || []);
    setQuizIdx(clamp(session.currentIndex || 0, 0, Math.max((session.questions || []).length - 1, 0)));
    setShowFeedback(false);
    setMode("quiz");
    setStatusMessage(`Loaded saved session: ${buildSessionLabel(session)}.`);
  }

  function deleteSavedQuiz(sessionId) {
    setSavedQuizSessions((prev) => prev.filter((session) => session.id !== sessionId));
  }

  function resetRotation() {
    setUsedFlashcardIds([]);
    setUsedQuizPrompts([]);
    setStatusMessage("Flashcard and quiz rotation history was cleared.");
    loadLocalFlashcardSet("Fresh local flashcards loaded after reset.");
  }

  function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const text = String(loadEvent.target?.result || "");
      setUploadedFileName(file.name);
      setUploadedText(text);
      setSummaryText(buildLocalSummary(text));
      setStatusMessage(`${file.name} loaded. Claude can now focus on this source.`);
    };
    reader.readAsText(file);
  }

  const bentoItems = [
    {
      title: String(totalCards),
      description: "Total Cards",
      icon: "🗂️",
      status: "local high-yield bank",
      tags: ["Study"],
      colSpan: 1,
    },
    {
      title: `${accuracy}%`,
      description: "Accuracy",
      icon: "🎯",
      status: Object.keys(ratings).length ? `${Object.keys(ratings).length} cards rated` : "start reviewing",
      tags: ["Progress"],
      colSpan: 1,
    },
    {
      title: String(weakCardIds.length),
      description: "Weak Cards",
      icon: "⚠️",
      status: weakCardIds.length ? "needs another pass" : "looking good",
      tags: ["Review"],
      colSpan: 1,
    },
    {
      title: String(savedQuizSessions.length),
      description: "Saved Quizzes",
      icon: "💾",
      status: savedQuizSessions.length ? "ready to reopen" : "nothing saved yet",
      tags: ["Sessions"],
      colSpan: 1,
    },
    {
      title: "Daily Boost",
      description: gentlePush,
      icon: "💬",
      status: hasCustomSource ? "focused source mode" : "standard subject mode",
      tags: ["Encouragement"],
      colSpan: 2,
    },
  ];

  const selectStyle = {
    padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${C.border}`,
    background: C.surface,
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
    borderRadius: 20,
    padding: 24,
    boxShadow: "0 10px 22px rgba(15, 23, 42, 0.04)",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
        color: C.text,
      }}
    >
      <nav
        style={{
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
          padding: "0 24px",
          minHeight: 62,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: C.accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 16,
            }}
          >
            💊
          </div>
          <span style={{ fontWeight: 800, fontSize: 18 }}>
            Care<span style={{ color: C.accent }}>Drop</span>
          </span>
        </div>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>
          React + Vite + Express
        </div>
      </nav>

      <div
        style={{
          maxWidth: 1220,
          margin: "0 auto",
          padding: "28px 20px 36px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {(apiError || statusMessage) ? (
          <div
            style={{
              ...panelStyle,
              padding: 16,
              borderColor: apiError ? C.red : C.accentMid,
              background: apiError ? C.redLight : C.accentLight,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, color: apiError ? C.red : C.accent }}>
              {apiError ? "Action Needed" : "Status"}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.7, color: C.text }}>
              {apiError || statusMessage}
            </div>
            {apiError && apiError.includes("Render") ? (
              <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>
                Your frontend can load on Vercel, but the Express API needs Render or another Node host unless you convert it to serverless functions.
              </div>
            ) : null}
          </div>
        ) : null}

        <MagicBento items={bentoItems} />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            ["flashcard", "Flashcards"],
            ["quiz", "Quiz"],
            ["notes", "Notes & Upload"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              style={{
                padding: "9px 18px",
                borderRadius: 999,
                border: mode === key ? `1.5px solid ${C.accent}` : `1px solid ${C.border}`,
                background: mode === key ? C.accentLight : C.surface,
                color: mode === key ? C.accent : C.muted,
                fontWeight: mode === key ? 800 : 600,
                fontSize: 13,
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
            gridTemplateColumns: width < 960 ? "1fr" : "minmax(280px, 300px) minmax(0, 1fr)",
            gap: 20,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={panelStyle}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: C.muted,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginBottom: 14,
                }}
              >
                Study Controls
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>Difficulty</label>
                <select
                  value={difficulty}
                  onChange={(event) => setDifficulty(event.target.value)}
                  style={selectStyle}
                >
                  {DIFFICULTIES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>

                <label style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>Subject</label>
                <select
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  style={selectStyle}
                >
                  {SUBJECT_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>

                <label style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>
                  Topic Focus
                </label>
                <input
                  value={topicFilter}
                  onChange={(event) => setTopicFilter(event.target.value)}
                  placeholder="cardiac drugs, dengue, delegation..."
                  style={{
                    ...selectStyle,
                    cursor: "text",
                  }}
                />

                <button
                  onClick={() => setFilterWeakOnly((value) => !value)}
                  style={{
                    marginTop: 4,
                    padding: "11px 14px",
                    borderRadius: 12,
                    border: filterWeakOnly ? `1px solid ${C.red}` : `1px solid ${C.border}`,
                    background: filterWeakOnly ? C.redLight : C.surface,
                    color: filterWeakOnly ? C.red : C.text,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {filterWeakOnly ? "Showing Weak Cards Only" : "Focus Weak Cards"}
                </button>

                <button
                  onClick={resetRotation}
                  style={{
                    padding: "11px 14px",
                    borderRadius: 12,
                    border: `1px solid ${C.border}`,
                    background: C.pill,
                    color: C.text,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Reset Non-Repeat Rotation
                </button>
              </div>
            </div>

            {weakCardIds.length ? (
              <div
                style={{
                  ...panelStyle,
                  background: C.redLight,
                  borderColor: C.red,
                  padding: 16,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, color: C.red }}>Weak Card Alert</div>
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, marginTop: 6 }}>
                  {weakCardIds.length} cards still need another pass.
                </div>
              </div>
            ) : null}

            <div style={panelStyle}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: C.muted,
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  marginBottom: 12,
                }}
              >
                Subject Shortcuts
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {SUBJECT_OPTIONS.map((value) => (
                  <button
                    key={value}
                    onClick={() => {
                      setSubject(value);
                      setMode("flashcard");
                    }}
                    style={{
                      padding: "7px 12px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 700,
                      border: `1px solid ${subject === value ? C.accent : C.border}`,
                      background: subject === value ? C.accentLight : C.surface,
                      color: subject === value ? C.accent : C.muted,
                      cursor: "pointer",
                    }}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            <div style={panelStyle}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, marginBottom: 10 }}>
                Source Mode
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.65, color: C.text }}>
                {hasCustomSource
                  ? `Focused source loaded${uploadedFileName ? `: ${uploadedFileName}` : ""}. Repeats are allowed so the app can stay centered on your document.`
                  : "Using the local CareDrop subject bank. Flashcards and quizzes will avoid repeats until you reset the rotation."}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {mode === "flashcard" ? (
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
                    <div style={{ fontWeight: 800, fontSize: 17 }}>Flashcards</div>
                    <div style={{ fontSize: 12, color: C.muted }}>
                      {subject} · target {FLASHCARD_SET_SIZE} cards per set · non-repeating unless a custom source is loaded
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => setCardIdx((value) => Math.max(0, value - 1))}
                      disabled={!flashcards.length || cardIdx === 0}
                      style={{
                        padding: "9px 14px",
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
                        padding: "9px 14px",
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
                    <button
                      onClick={() => loadLocalFlashcardSet("A fresh local flashcard set was loaded.")}
                      style={{
                        padding: "9px 14px",
                        borderRadius: 10,
                        border: `1px solid ${C.accentMid}`,
                        background: C.accentLight,
                        color: C.accent,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      New 10-Card Set
                    </button>
                    <button
                      onClick={generateClaudeFlashcards}
                      disabled={apiLoading}
                      style={{
                        padding: "9px 14px",
                        borderRadius: 10,
                        border: "none",
                        background: apiLoading ? C.border : C.accent,
                        color: apiLoading ? C.muted : "#fff",
                        fontWeight: 700,
                        cursor: apiLoading ? "not-allowed" : "pointer",
                      }}
                    >
                      {apiLoading ? "Loading..." : "Claude Focus Set"}
                    </button>
                  </div>
                </div>

                {currentCard ? (
                  <Flashcard
                    card={currentCard}
                    idx={cardIdx}
                    total={flashcards.length}
                    onRate={handleRate}
                  />
                ) : (
                  <div
                    style={{
                      border: `1px dashed ${C.border}`,
                      borderRadius: 20,
                      padding: "44px 24px",
                      textAlign: "center",
                      color: C.muted,
                      lineHeight: 1.7,
                    }}
                  >
                    No fresh flashcards are available for this exact filter right now. Reset the rotation or upload notes for a focused custom set.
                  </div>
                )}
              </div>
            ) : null}

            {mode === "quiz" ? (
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
                    <div style={{ fontWeight: 800, fontSize: 17 }}>Quiz</div>
                    <div style={{ fontSize: 12, color: C.muted }}>
                      Target {QUIZ_SET_SIZE} questions · subject-first · saved sessions supported
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={generateQuiz}
                      disabled={apiLoading}
                      style={{
                        padding: "10px 16px",
                        borderRadius: 10,
                        border: "none",
                        background: apiLoading ? C.border : C.accent,
                        color: apiLoading ? C.muted : "#fff",
                        fontWeight: 700,
                        cursor: apiLoading ? "not-allowed" : "pointer",
                      }}
                    >
                      {apiLoading ? "Generating..." : "Generate 20 Questions"}
                    </button>
                    <button
                      onClick={saveCurrentQuiz}
                      disabled={!quiz.length}
                      style={{
                        padding: "10px 16px",
                        borderRadius: 10,
                        border: `1px solid ${C.border}`,
                        background: quiz.length ? C.surface : C.border,
                        color: quiz.length ? C.text : C.muted,
                        fontWeight: 700,
                        cursor: quiz.length ? "pointer" : "not-allowed",
                      }}
                    >
                      Save Quiz
                    </button>
                  </div>
                </div>

                {!quizItem ? (
                  <div
                    style={{
                      border: `1px dashed ${C.border}`,
                      borderRadius: 20,
                      padding: "44px 24px",
                      textAlign: "center",
                      color: C.muted,
                      lineHeight: 1.7,
                    }}
                  >
                    Generate a quiz to load a 20-question session for this subject and topic focus.
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
                      style={{
                        background: "#FBFAF7",
                        borderRadius: 18,
                        padding: 22,
                        border: `1px solid ${C.border}`,
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
                      <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.5 }}>
                        {quizItem.prompt}
                      </div>
                    </div>

                    <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                      {quizItem.options.map((option) => {
                        const selected = quizItem.userAnswer === option;
                        const correct = normalize(option) === normalize(quizItem.correctAnswer);
                        const background = showFeedback && correct
                          ? "#ECFDF5"
                          : showFeedback && selected && !correct
                            ? "#FFF1F2"
                            : C.surface;
                        const borderColor = showFeedback && correct
                          ? "#10B981"
                          : showFeedback && selected && !correct
                            ? "#F43F5E"
                            : C.border;

                        return (
                          <button
                            key={option}
                            onClick={() => handleQuizAnswer(option)}
                            disabled={quizItem.userAnswer !== null}
                            style={{
                              textAlign: "left",
                              padding: "14px 16px",
                              borderRadius: 14,
                              border: `1px solid ${borderColor}`,
                              background,
                              cursor: quizItem.userAnswer !== null ? "not-allowed" : "pointer",
                              fontSize: 14,
                              lineHeight: 1.6,
                            }}
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>

                    {showFeedback && quizItem.userAnswer !== null ? (
                      <div
                        style={{
                          marginTop: 16,
                          borderRadius: 18,
                          padding: 18,
                          background: currentCorrect ? "#ECFDF5" : "#FFF1F2",
                          border: `1px solid ${currentCorrect ? "#10B981" : "#F43F5E"}`,
                        }}
                      >
                        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
                          {currentCorrect ? "Correct" : "Incorrect"}
                        </div>
                        <div style={{ fontSize: 14, lineHeight: 1.75 }}>
                          <div>
                            <strong>Your answer:</strong> {quizItem.userAnswer}
                          </div>
                          <div>
                            <strong>Correct answer:</strong> {quizItem.correctAnswer}
                          </div>
                          <div>
                            <strong>Rationale:</strong> {quizItem.rationale}
                          </div>
                          <div>
                            <strong>Memory tip:</strong> {quizItem.notes}
                          </div>
                        </div>
                        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            onClick={() => {
                              setShowFeedback(false);
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
                        </div>
                      </div>
                    ) : null}

                    {quizIdx === quiz.length - 1 && quizItem.userAnswer !== null ? (
                      <div
                        style={{
                          marginTop: 16,
                          borderRadius: 18,
                          padding: 18,
                          background: C.blueLight,
                          border: `1px solid #BFDBFE`,
                        }}
                      >
                        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
                          Quiz Summary
                        </div>
                        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 14 }}>
                          <div>Answered: <strong>{answeredCount}</strong></div>
                          <div>Correct: <strong>{correctCount}</strong></div>
                          <div>
                            Score: <strong>{quiz.length ? Math.round((correctCount / quiz.length) * 100) : 0}%</strong>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div style={{ marginTop: 20 }}>
                      <AIPanel
                        apiLoading={apiLoading}
                        aiResponse={aiResponse}
                        onGenerate={generateQuiz}
                        onAsk={askClaude}
                        question={question}
                        setQuestion={setQuestion}
                        buttonLabel="Refresh 20-Question Quiz"
                      />
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {mode === "notes" ? (
              <div style={panelStyle}>
                <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>Notes & Upload</div>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 18 }}>
                  Upload a reviewer, paste notes, then ask Claude for summary, flashcards, or a focused quiz.
                </div>

                <div
                  style={{
                    border: `2px dashed ${C.border}`,
                    borderRadius: 16,
                    padding: 22,
                    textAlign: "center",
                    background: "#FBFAF7",
                  }}
                >
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
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
                      accept=".txt,.md,.json"
                      onChange={handleFileUpload}
                      style={{ display: "none" }}
                    />
                  </label>
                  <div style={{ marginTop: 10, fontSize: 12, color: C.muted }}>
                    {uploadedFileName || "No file uploaded yet."}
                  </div>
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

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
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
                    Claude Summary
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
                    Claude Flashcards
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
                    Claude Quiz
                  </button>
                </div>

                <div
                  style={{
                    marginTop: 18,
                    background: "#FBFAF7",
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
              </div>
            ) : null}

            <div style={panelStyle}>
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>
                Saved Review Sessions
              </div>
              {savedQuizSessions.length ? (
                <div style={{ display: "grid", gap: 12 }}>
                  {savedQuizSessions.map((session) => (
                    <SavedSessionCard
                      key={session.id}
                      session={session}
                      onOpen={openSavedQuiz}
                      onDelete={deleteSavedQuiz}
                    />
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                  Save a quiz session and it will appear here for review later.
                </div>
              )}
            </div>
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
        CareDrop | NLE nursing board reviewer | subject-focused flashcards and quizzes with Claude support
      </footer>
    </div>
  );
}

