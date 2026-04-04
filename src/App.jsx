import { useEffect, useMemo, useRef, useState } from "react";
import MagicBento from "./MagicBento";

const STORAGE_KEY = "caredrop-dashboard-v2";
const REQUEST_STORAGE_KEY = "caredrop-feedback-v1";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const FLASHCARD_SET_SIZE = 10;
const QUIZ_SET_SIZE = 10;
const RECENT_MEMORY_LIMIT = 12;
const SUPPORTED_UPLOAD_EXTENSIONS = [".doc", ".docx", ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".txt"];
const LOGO_SRC = "/favicon.svg";

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
  panelNeutral: "#F7F4EE",
  panelNeutralDark: "#D9D2C7",
  panelNeutralAlt: "#FBF8F3",
};

const SEED_QUESTION_BANK = {
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
    { q: "A patient develops sudden stridor after a procedure. What is the nurse's priority response?", a: "Treat it as an airway emergency, call for immediate help, support oxygenation, and prepare for rapid airway intervention.", difficulty: "hard", topic: "airway emergency" },
    { q: "Which finding most strongly suggests sepsis is progressing to instability?", a: "Worsening mental status, hypotension, tachycardia, and poor perfusion together suggest possible septic shock and need urgent escalation.", difficulty: "hard", topic: "sepsis recognition" },
    { q: "During triage, which patient should be assessed first: chest pain, fever, or stable post-op discomfort?", a: "The patient with possible life-threatening compromise such as chest pain suggestive of acute coronary syndrome should be assessed first.", difficulty: "hard", topic: "triage priority" },
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

const BANK_ITEMS_PER_BUCKET = 21;
const BUCKET_DIFFICULTIES = ["easy", "medium", "hard"];
const QUESTION_LEAD_INS = [
  "Board recall:",
  "Focused review:",
  "Nursing priority check:",
];
const QUESTION_TEMPLATES = [
  (entry) => entry.q,
  (entry, subject) => `Which statement is most accurate about ${entry.topic} in ${subject}?`,
  (entry, subject) => `A patient scenario highlights ${entry.topic}. What should the nurse remember first in ${subject}?`,
  (entry, subject) => `What is the safest nursing takeaway for ${entry.topic} in ${subject}?`,
  (entry, subject) => `Which clue most strongly points to the correct response for ${entry.topic} in ${subject}?`,
  (entry, subject, difficulty) => `For a ${difficulty} ${subject} review item about ${entry.topic}, which response is best?`,
  (entry, subject) => `During review of ${subject}, what key principle should be tied to ${entry.topic}?`,
  (entry, subject) => `If ${entry.topic} appears in a ${subject} question stem, what answer should come to mind?`,
];
const ANSWER_REMINDERS = [
  (entry, subject) => `Board focus: connect ${entry.topic} to the safest nursing priority in ${subject}.`,
  (entry, subject, difficulty) => `Review clue: this is the ${difficulty} takeaway the stem is pointing toward in ${subject}.`,
  (entry) => `Memory hook: if the item is really about ${entry.topic}, this is the answer to anchor first.`,
];

function normalizeSeedKey(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

function buildExpandedQuestion(entry, subject, difficulty, variantIndex) {
  const leadIn = QUESTION_LEAD_INS[Math.floor(variantIndex / QUESTION_TEMPLATES.length) % QUESTION_LEAD_INS.length];
  const template = QUESTION_TEMPLATES[variantIndex % QUESTION_TEMPLATES.length];
  return `${leadIn} ${template(entry, subject, difficulty)}`.trim();
}

function buildExpandedAnswer(entry, subject, difficulty, variantIndex) {
  const reminder = ANSWER_REMINDERS[variantIndex % ANSWER_REMINDERS.length];
  return `${entry.a} ${reminder(entry, subject, difficulty)}`.trim();
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
      while (bucket.length < targetPerBucket && variantIndex < targetPerBucket * 12) {
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
  const matchesSubject = subject === "Mixed Review" ? true : entry.subject === subject;
  const matchesDifficulty = difficulty === "All" ? true : entry.difficulty === difficulty;
  const matchesTopic = topic
    ? `${entry.topic || ""} ${entry.q || entry.prompt || ""} ${entry.a || entry.answer || ""} ${entry.rationale || ""}`
        .toLowerCase()
        .includes(topic.toLowerCase())
    : true;

  return matchesSubject && matchesDifficulty && matchesTopic;
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

function getExactEntries(sourceEntries, subject, difficulty, topic) {
  return sourceEntries.filter((entry) => matchesStudyFilter(entry, subject, difficulty, topic));
}

function buildFlashcardVariants(entry) {
  const subject = entry.subject;
  const baseId = `${subject}-${normalize(entry.q)}`;
  const topic = entry.topic || "general review";
  const answer = entry.a;
  const rationale = entry.a;
  const notes = `Focus area: ${topic}.`;
  const prompts = [
    entry.q,
    `In ${subject}, what should you remember about ${topic}?`,
    `Board recall: what is the safest nursing takeaway for ${topic}?`,
    `What clue from ${subject} review points to ${topic}?`,
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
    {
      prompt: `Which clue best supports the correct nursing action for ${entry.topic} in ${entry.subject}?`,
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

function buildLocalQuizFallback(sourceEntries, subject, difficulty, topic, count, usedPrompts = []) {
  const prioritized = shuffle(getExactEntries(sourceEntries, subject, difficulty, topic));
  const distractorPool = prioritized.length ? prioritized : getExactEntries(sourceEntries, subject, difficulty, topic);

  const questions = [];

  for (const entry of prioritized) {
    for (const variant of shuffle(buildQuizVariants(entry))) {
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
        options: buildDistractors(entry.a, distractorPool),
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

function sanitizeFlashcards(cards, subject, difficulty, topic, usedIds, allowRepeat) {
  return uniqueBy(
    (Array.isArray(cards) ? cards : []).map((card) => {
      const nextSubject = card.subject || subject || "Mixed Review";
      const question = String(card.question || card.prompt || "").trim();
      const answer = String(card.answer || "").trim();
      return {
        id: `${nextSubject}-${normalize(question)}`,
        subject: nextSubject,
        difficulty: ["easy", "medium", "hard"].includes(card.difficulty) ? card.difficulty : "medium",
        topic: topic || card.topic || "ai review",
        question,
        answer,
        rationale: String(card.rationale || answer || "Generated by Gemini."),
        notes: String(card.notes || `Topic focus: ${topic || card.topic || "general review"}.`),
      };
    }),
    (card) => card.id
  ).filter(
    (card) =>
      card.question &&
      card.answer &&
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
      (allowRepeat ? true : !usedIds.includes(card.id))
  );
}

function sanitizeQuizQuestions(questions, subject, difficulty, topic, usedPrompts, allowRepeat) {
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
          answer: item.correctAnswer,
          rationale: item.rationale,
        },
        subject,
        difficulty,
        topic
      )
    );
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

function loadRequestPersisted() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(REQUEST_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function postJson(path, payload) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 45000);
  let response;

  try {
    response = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    window.clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error("The request timed out. Please try again.");
    }
    throw new Error("Network error. Check the backend connection and try again.");
  }

  window.clearTimeout(timeoutId);

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

async function uploadFileForExtraction(file) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 120000);
  const formData = new FormData();
  formData.append("file", file);

  let response;

  try {
    response = await fetch(apiUrl("/api/extract"), {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
  } catch (error) {
    window.clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error("Upload timed out. Please try again.");
    }
    throw new Error("Upload failed. Please check your connection and try again.");
  }

  window.clearTimeout(timeoutId);
  const rawText = await response.text();
  let data;

  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(
      rawText.includes("FUNCTION_INVOCATION_FAILED")
        ? "The upload service crashed on the server. Please retry after the latest deployment finishes."
        : rawText.includes("<!DOCTYPE") || rawText.startsWith("The page")
        ? "Upload service is not returning JSON. Refresh after the new deployment finishes, or confirm /api/extract is deployed."
        : `The upload service returned an invalid response.${rawText ? ` (${rawText.slice(0, 120)})` : ""}`
    );
  }

  if (!response.ok) {
    throw new Error(data.error || "Upload failed.");
  }

  return data;
}

async function readTextFileLocally(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(String(event.target?.result || ""));
    reader.onerror = () => reject(new Error("The text file could not be read locally."));
    reader.readAsText(file);
  });
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
  const [flipLocked, setFlipLocked] = useState(false);
  const prevCardId = useRef(card?.id);

  useEffect(() => {
    if (prevCardId.current !== card?.id) {
      setFlipped(false);
      setFlipLocked(false);
      prevCardId.current = card?.id;
    }
  }, [card?.id]);

  if (!card) {
    return null;
  }

  const diffColor =
    card.difficulty === "hard" ? "red" : card.difficulty === "medium" ? "amber" : "green";

  function handleFlip() {
    if (flipLocked) {
      return;
    }

    setFlipLocked(true);
    setFlipped((value) => !value);
    window.setTimeout(() => setFlipLocked(false), 420);
  }

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

      <div style={{ perspective: 1400 }}>
        <button
          type="button"
          onClick={handleFlip}
          style={{
            cursor: flipLocked ? "default" : "pointer",
            minHeight: 280,
            width: "100%",
            background: "transparent",
            border: "none",
            padding: 0,
            userSelect: "none",
          }}
        >
          <div
            style={{
              position: "relative",
              minHeight: 280,
              transformStyle: "preserve-3d",
              transition: "transform 0.42s cubic-bezier(0.2, 0.7, 0.2, 1)",
              transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            }}
          >
            {[
              {
                side: "front",
                heading: "Question",
                body: card.question,
                footer: "Tap to reveal answer",
                background: C.panelNeutralAlt,
                borderColor: C.panelNeutralDark,
                accentColor: "#85796A",
                extra: null,
              },
              {
                side: "back",
                heading: "Answer",
                body: card.answer,
                footer: null,
                background: `linear-gradient(135deg, ${C.panelNeutral} 0%, #fff 100%)`,
                borderColor: "#CFC5B7",
                accentColor: "#6C6255",
                extra: (
                  <div
                    style={{
                      marginTop: 16,
                      padding: 14,
                      borderRadius: 14,
                      background: "#FFFFFF",
                      border: `1.5px solid ${C.panelNeutralDark}`,
                      fontSize: 13,
                      lineHeight: 1.65,
                      color: C.muted,
                    }}
                  >
                    {card.notes}
                  </div>
                ),
              },
            ].map((face) => (
              <div
                key={face.side}
                style={{
                  position: "absolute",
                  inset: 0,
                  minHeight: 280,
                  background: face.background,
                  border: `1.5px solid ${face.borderColor}`,
                  borderRadius: 22,
                  padding: "28px 28px 24px",
                  boxShadow: "0 12px 24px rgba(15, 23, 42, 0.05)",
                  backfaceVisibility: "hidden",
                  transform: face.side === "back" ? "rotateY(180deg)" : "rotateY(0deg)",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                  <Badge label={card.subject} color="blue" />
                  <Badge label={card.topic} color="gray" />
                  <Badge label={card.difficulty} color={diffColor} />
                  {face.side === "back" ? <Badge label="Answer" color="green" /> : null}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: face.accentColor,
                    fontWeight: 700,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    marginBottom: 10,
                  }}
                >
                  {face.heading}
                </div>
                <div style={{ fontSize: face.side === "front" ? 19 : 15, fontWeight: 700, color: C.text, lineHeight: 1.65 }}>
                  {face.body}
                </div>
                {face.footer ? (
                  <div style={{ marginTop: 20, fontSize: 12, color: C.faint, textAlign: "center" }}>
                    {face.footer}
                  </div>
                ) : null}
                {face.extra}
              </div>
            ))}
          </div>
        </button>
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
          placeholder="Ask Gemini about a nursing concept..."
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
            Gemini's Response
          </div>
          {aiResponse}
        </div>
      ) : null}
    </div>
  );
}

function RequestModal({
  open,
  onClose,
  requestType,
  setRequestType,
  requestName,
  setRequestName,
  requestMessage,
  setRequestMessage,
  onSubmit,
  requestHistory,
  requestStatus,
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26, 26, 26, 0.36)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
        zIndex: 120,
      }}
    >
      <div
        style={{
          width: "min(560px, 100%)",
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 22,
          boxShadow: "0 20px 50px rgba(15, 23, 42, 0.18)",
          padding: 22,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Report or Request</div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginTop: 4 }}>
              Send a bug report, topic request, or fix request. Right now this is saved inside the app so you can keep track of what was submitted.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: `1px solid ${C.border}`,
              background: C.surface,
              borderRadius: 10,
              padding: "8px 10px",
              cursor: "pointer",
              fontWeight: 700,
              color: C.muted,
            }}
          >
            Close
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: C.muted, fontWeight: 700, display: "block", marginBottom: 6 }}>
              Request Type
            </label>
            <select
              value={requestType}
              onChange={(event) => setRequestType(event.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: "#FBFAF7",
                fontSize: 13,
                outline: "none",
              }}
            >
              {["Bug Report", "Topic Request", "Feature Request", "Content Fix", "General Feedback"].map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: C.muted, fontWeight: 700, display: "block", marginBottom: 6 }}>
              Name
            </label>
            <input
              value={requestName}
              onChange={(event) => setRequestName(event.target.value)}
              placeholder="Optional name"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: "#FBFAF7",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, color: C.muted, fontWeight: 700, display: "block", marginBottom: 6 }}>
            Message
          </label>
          <textarea
            value={requestMessage}
            onChange={(event) => setRequestMessage(event.target.value)}
            placeholder="Describe what should be added, fixed, or improved..."
            style={{
              width: "100%",
              minHeight: 130,
              padding: "12px 14px",
              borderRadius: 14,
              border: `1px solid ${C.border}`,
              background: "#FBFAF7",
              fontSize: 14,
              lineHeight: 1.65,
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {requestStatus ? (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              background: C.accentLight,
              border: `1px solid ${C.accentMid}`,
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {requestStatus}
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: C.muted }}>
            Recent requests saved here: <strong>{requestHistory.length}</strong>
          </div>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!requestMessage.trim()}
            style={{
              padding: "10px 16px",
              borderRadius: 12,
              border: "none",
              background: requestMessage.trim() ? C.accent : C.border,
              color: requestMessage.trim() ? "#fff" : C.muted,
              fontWeight: 700,
              cursor: requestMessage.trim() ? "pointer" : "not-allowed",
            }}
          >
            Submit Request
          </button>
        </div>

        {requestHistory.length ? (
          <div
            style={{
              borderTop: `1px solid ${C.border}`,
              paddingTop: 14,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: C.muted }}>Recent Request History</div>
            {requestHistory.slice(0, 3).map((entry) => (
              <div
                key={entry.id}
                style={{
                  border: `1px solid ${C.border}`,
                  background: "#FBFAF7",
                  borderRadius: 14,
                  padding: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{entry.type}</div>
                  <div style={{ fontSize: 11, color: C.faint }}>{new Date(entry.createdAt).toLocaleString()}</div>
                </div>
                <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>{entry.message}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SavedSessionCard({ session, onOpen, onDelete }) {
  const itemCount = session.questions?.length || session.cards?.length || 0;

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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {session.saved ? <Badge label="saved" color="green" /> : null}
          <Badge label={`${itemCount} items`} color="blue" />
        </div>
      </div>
      <div style={{ fontSize: 12, color: C.muted }}>{session.sourceLabel}</div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: C.muted }}>
        <div>Score: <strong>{session.score ?? 0}%</strong></div>
        <div>Answered: <strong>{session.answeredCount ?? 0}</strong></div>
        <div>Difficulty: <strong>{session.difficulty}</strong></div>
        <div>Mode: <strong>{session.mode}</strong></div>
      </div>
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
          Review
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
  const legacySavedSessions = persisted?.savedQuizSessions || [];
  const persistedRequests = loadRequestPersisted();
  const [subject, setSubject] = useState(persisted?.subject || "Pharmacology");
  const [difficulty, setDifficulty] = useState(persisted?.difficulty || "All");
  const [topicFilter, setTopicFilter] = useState(persisted?.topicFilter || "");
  const [mode, setMode] = useState(persisted?.mode || "flashcard");
  const [flashcards, setFlashcards] = useState([]);
  const [cardIdx, setCardIdx] = useState(0);
  const [flashcardSessionRatings, setFlashcardSessionRatings] = useState({});
  const [flashcardSessionSubmitted, setFlashcardSessionSubmitted] = useState(false);
  const [quiz, setQuiz] = useState([]);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [ratings, setRatings] = useState(persisted?.ratings || {});
  const [sessions, setSessions] = useState(persisted?.sessions || 0);
  const [reviewSessions, setReviewSessions] = useState(persisted?.reviewSessions || legacySavedSessions);
  const [usedFlashcardIds, setUsedFlashcardIds] = useState(persisted?.usedFlashcardIds || []);
  const [usedFlashcardQuestions, setUsedFlashcardQuestions] = useState(persisted?.usedFlashcardQuestions || []);
  const [usedQuizPrompts, setUsedQuizPrompts] = useState(persisted?.usedQuizPrompts || []);
  const [recentFlashcardIds, setRecentFlashcardIds] = useState(persisted?.recentFlashcardIds || []);
  const [recentQuizPrompts, setRecentQuizPrompts] = useState(persisted?.recentQuizPrompts || []);
  const [apiLoading, setApiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState("");
  const [apiError, setApiError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [question, setQuestion] = useState("");
  const [gentlePush, setGentlePush] = useState(ENCOURAGEMENTS[0]);
  const [noteText, setNoteText] = useState(persisted?.noteText || "");
  const [uploadedText, setUploadedText] = useState(persisted?.uploadedText || "");
  const [uploadedFileName, setUploadedFileName] = useState(persisted?.uploadedFileName || "");
  const [uploadState, setUploadState] = useState("idle");
  const [uploadError, setUploadError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [summaryText, setSummaryText] = useState(
    persisted?.summaryText || "Paste notes or upload a document to generate a reviewer summary."
  );
  const [filterWeakOnly, setFilterWeakOnly] = useState(persisted?.filterWeakOnly || false);
  const [metricHover, setMetricHover] = useState("");
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestType, setRequestType] = useState("Bug Report");
  const [requestName, setRequestName] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [requestStatus, setRequestStatus] = useState("");
  const [requestHistory, setRequestHistory] = useState(persistedRequests);

  const usedFlashcardIdsRef = useRef(usedFlashcardIds);
  const usedFlashcardQuestionsRef = useRef(usedFlashcardQuestions);
  const usedQuizPromptsRef = useRef(usedQuizPrompts);
  const recentFlashcardIdsRef = useRef(recentFlashcardIds);
  const recentQuizPromptsRef = useRef(recentQuizPrompts);

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
        reviewSessions,
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
      })
    );
  }, [
    subject,
    difficulty,
    topicFilter,
    mode,
    ratings,
    sessions,
    reviewSessions,
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
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(REQUEST_STORAGE_KEY, JSON.stringify(requestHistory));
  }, [requestHistory]);

  const studyText = buildStudyText(noteText, uploadedText);
  const hasCustomSource = Boolean(studyText);
  const customEntries = useMemo(
    () => (hasCustomSource ? buildCustomEntries(studyText, subject) : []),
    [hasCustomSource, studyText, subject]
  );
  const activeEntries = customEntries.length ? customEntries : getAllEntries();

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

  useEffect(() => {
    setAiResponse("");
    setQuestion("");
  }, [quizIdx, quiz.length]);

  function clearMessages() {
    setApiError("");
    setStatusMessage("");
    setUploadError("");
  }

  function markFlashcardsAsUsed(deck) {
    setUsedFlashcardIds((prev) => uniqueBy([...prev, ...deck.map((card) => card.id)], (value) => value));
    setUsedFlashcardQuestions((prev) =>
      uniqueBy([...prev, ...deck.map((card) => normalize(card.question))], (value) => value)
    );
    setRecentFlashcardIds((prev) => [...prev, ...deck.map((card) => card.id)].slice(-RECENT_MEMORY_LIMIT));
  }

  function buildLocalFlashcardSet() {
    let candidates = uniqueBy(
      getExactEntries(activeEntries, subject, difficulty, topicFilter).flatMap((entry) => buildFlashcardVariants(entry)),
      (card) => card.id
    );

    if (filterWeakOnly) {
      candidates = candidates.filter((card) => weakCardIds.includes(card.id));
    }

    return selectSessionItems(
      candidates,
      FLASHCARD_SET_SIZE,
      hasCustomSource ? [] : usedFlashcardIdsRef.current,
      recentFlashcardIdsRef.current,
      (card) => card.id
    );
  }

  function loadLocalFlashcardSet(message) {
    const deck = buildLocalFlashcardSet();
    setFlashcards(deck);
    setCardIdx(0);
    setFlashcardSessionRatings({});
    setFlashcardSessionSubmitted(false);
    markFlashcardsAsUsed(deck);

    if (message) {
      setStatusMessage(
        deck.length
          ? message
          : "No card data exists for this exact filter yet. Try another subject or upload a document."
      );
    }
  }

  useEffect(() => {
    loadLocalFlashcardSet("");
  }, [subject, difficulty, topicFilter, filterWeakOnly]);

  async function generateClaudeFlashcards() {
    clearMessages();
    setApiLoading(true);

    try {
      const data = await postJson("/api/claude/cards", {
        notes: studyText,
        subject,
        topic: topicFilter,
        difficulty: difficulty === "All" ? "mixed" : difficulty,
        count: FLASHCARD_SET_SIZE,
        excludeQuestions: hasCustomSource
          ? []
          : usedFlashcardQuestionsRef.current,
      });

      const aiCards = sanitizeFlashcards(
        data.cards,
        subject,
        difficulty,
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
      setMode("flashcard");
      setFlashcardSessionRatings({});
      setFlashcardSessionSubmitted(false);
      markFlashcardsAsUsed(deck);
      setStatusMessage(
        deck.length >= FLASHCARD_SET_SIZE
          ? topicFilter
            ? `Gemini generated another ${FLASHCARD_SET_SIZE}-card focus set for ${topicFilter}.`
            : "Gemini generated a fresh 10-card flashcard set."
          : `Gemini returned ${deck.length} cards for this focus.`
      );
    } catch (error) {
      setApiError(error.message || "Gemini flashcards failed. Using local cards instead.");
      loadLocalFlashcardSet("Gemini flashcards were unavailable, so the local deck was loaded.");
    } finally {
      setApiLoading(false);
    }
  }

  async function generateQuiz() {
    clearMessages();
    setApiLoading(true);
    setShowFeedback(false);
    setQuizSubmitted(false);

    try {
      const data = await postJson("/api/claude/quiz", {
        notes: studyText,
        subject,
        topic: topicFilter,
        difficulty: difficulty === "All" ? "mixed" : difficulty,
        count: QUIZ_SET_SIZE,
        excludeQuestions: hasCustomSource ? [] : usedQuizPromptsRef.current,
      });

      const aiQuestions = sanitizeQuizQuestions(data.questions, subject, difficulty, topicFilter, [], true);
      const fallback = buildLocalQuizFallback(
        activeEntries,
        subject,
        difficulty,
        topicFilter,
        QUIZ_SET_SIZE - aiQuestions.length,
        []
      );
      const questions = selectSessionItems(
        [...aiQuestions, ...fallback],
        QUIZ_SET_SIZE,
        hasCustomSource ? [] : usedQuizPromptsRef.current,
        recentQuizPromptsRef.current,
        (item) => normalize(item.prompt)
      );

      setQuiz(questions);
      setQuizIdx(0);
      setMode("quiz");
      setStatusMessage(
        questions.length >= QUIZ_SET_SIZE
          ? topicFilter
            ? `Gemini generated another ${QUIZ_SET_SIZE}-question focus quiz for ${topicFilter}.`
            : "A fresh 10-question quiz is ready for review."
          : `Loaded ${questions.length} questions for this focus.`
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
      const fallbackPool = buildLocalQuizFallback(
        activeEntries,
        subject,
        difficulty,
        topicFilter,
        QUIZ_SET_SIZE,
        []
      );
      const fallback = selectSessionItems(
        fallbackPool,
        QUIZ_SET_SIZE,
        hasCustomSource ? [] : usedQuizPromptsRef.current,
        recentQuizPromptsRef.current,
        (item) => normalize(item.prompt)
      );
      setQuiz(fallback);
      setQuizIdx(0);
      setMode("quiz");
      setApiError(
        error.message || "Gemini quiz generation failed. A local 10-question backup quiz has been loaded."
      );
      if (!hasCustomSource) {
        setUsedQuizPrompts((prev) =>
          uniqueBy(
            [...prev, ...fallback.map((item) => normalize(item.prompt))],
            (value) => value
          )
        );
        setRecentQuizPrompts((prev) =>
          [...prev, ...fallback.map((item) => normalize(item.prompt))].slice(-RECENT_MEMORY_LIMIT)
        );
      }
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

    clearMessages();
    setApiLoading(true);

    try {
      const data = await postJson("/api/claude/summary", { notes });
      setSummaryText(data.summary || buildLocalSummary(notes));
      setStatusMessage("Gemini generated a reviewer summary from your notes.");
    } catch (error) {
      setSummaryText(buildLocalSummary(notes));
      setApiError(error.message || "Gemini summary failed. A local reviewer summary was generated instead.");
    } finally {
      setApiLoading(false);
    }
  }

  async function askClaude() {
    if (!question.trim() || !quizItem || currentCorrect || quizItem.userAnswer === null) {
      return;
    }

    clearMessages();
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
      sourceLabel: hasCustomSource
        ? uploadedFileName || "Focused notes session"
        : "Generated from CareDrop subject bank",
      cards: flashcards,
      currentIndex: cardIdx,
      cardRatings: flashcardSessionRatings,
      score: flashcards.length ? Math.round((flashcardStrongCount / flashcards.length) * 100) : 0,
      answeredCount: flashcardCompletedCount,
      correctCount: flashcardStrongCount,
      weakCount: flashcardNeedsReviewCount,
    };

    recordReviewSession(session);
    setFlashcardSessionSubmitted(true);
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
      mode: "quiz",
      subject,
      difficulty,
      topic: topicFilter,
      sourceLabel: hasCustomSource
        ? uploadedFileName || "Focused notes session"
        : "Generated from CareDrop subject bank",
      questions: quiz,
      currentIndex: quizIdx,
      score: quiz.length ? Math.round((correctCount / quiz.length) * 100) : 0,
      answeredCount,
      correctCount,
    };

    recordReviewSession(session);
    setQuizSubmitted(true);
    setSessions((value) => value + 1);
    setStatusMessage("Quiz session submitted and added to your review history.");
  }

  function handleRate(key) {
    if (!currentCard) {
      return;
    }

    setFlashcardSessionRatings((prev) => ({
      ...prev,
      [currentCard.id]: key,
    }));
    setRatings((prev) => ({
      ...prev,
      [currentCard.id]: key,
    }));

    if (cardIdx < flashcards.length - 1) {
      setCardIdx((value) => value + 1);
      return;
    }
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
      score,
      answeredCount,
      saved: true,
    };

    setReviewSessions((prev) => [session, ...prev].slice(0, 18));
    setStatusMessage("Quiz session saved. You can reopen it from Review History.");
  }

  function openSavedQuiz(session) {
    if (session.mode === "flashcard") {
      setFlashcards(session.cards || []);
      setCardIdx(clamp(session.currentIndex || 0, 0, Math.max((session.cards || []).length - 1, 0)));
      setFlashcardSessionRatings(session.cardRatings || {});
      setFlashcardSessionSubmitted(true);
      setMode("flashcard");
      setStatusMessage(`Loaded review session: ${buildSessionLabel(session)}.`);
      return;
    }

    setQuiz(session.questions || []);
    setQuizIdx(clamp(session.currentIndex || 0, 0, Math.max((session.questions || []).length - 1, 0)));
    setShowFeedback(false);
    setQuizSubmitted(true);
    setMode("quiz");
    setStatusMessage(`Loaded saved session: ${buildSessionLabel(session)}.`);
  }

  function deleteSavedQuiz(sessionId) {
    setReviewSessions((prev) => prev.filter((session) => session.id !== sessionId));
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
    setUploadState("uploading");

    try {
      const data = await uploadFileForExtraction(file);
      setUploadedFileName(data.fileName || file.name);
      setUploadedText(data.text || "");
      setSummaryText(buildLocalSummary(data.text || ""));
      setUploadState("success");
      setStatusMessage(`${file.name} uploaded and extracted successfully.`);
    } catch (error) {
      if (extension === ".txt") {
        try {
          const localText = await readTextFileLocally(file);
          setUploadedFileName(file.name);
          setUploadedText(localText);
          setSummaryText(buildLocalSummary(localText));
          setUploadState("success");
          setStatusMessage(`${file.name} loaded locally while the upload service was unavailable.`);
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

  function submitRequest() {
    if (!requestMessage.trim()) {
      return;
    }

    const entry = {
      id: uid(),
      type: requestType,
      name: requestName.trim(),
      message: requestMessage.trim(),
      createdAt: new Date().toISOString(),
    };

    setRequestHistory((prev) => [entry, ...prev].slice(0, 20));
    setRequestStatus("Request saved in the app. You can keep tracking recent submissions from this panel.");
    setRequestName("");
    setRequestMessage("");
    setRequestType("Bug Report");
  }

  const bentoItems = [
    {
      title: String(totalCards),
      description: "Total Cards",
      icon: "POOL",
      status: "local high-yield bank",
      hoverText: `${flashcards.length} cards currently loaded in this session`,
      actionLabel: "Open flashcards",
      onClick: () => setMode("flashcard"),
      tags: ["Study"],
      colSpan: 1,
    },
    {
      title: `${accuracy}%`,
      description: "Accuracy",
      icon: "AC",
      status: Object.keys(ratings).length ? `${Object.keys(ratings).length} cards rated` : "start reviewing",
      hoverText: `${Object.values(ratings).filter((value) => value === "easy").length} strong, ${weakCardIds.length} weak`,
      actionLabel: metricHover === "accuracy" ? "Tap again to close detail" : "Tap for rating detail",
      onClick: () => setMetricHover(metricHover === "accuracy" ? "" : "accuracy"),
      tags: ["Progress"],
      colSpan: 1,
    },
    {
      title: String(weakCardIds.length),
      description: "Weak Cards",
      icon: "WK",
      status: weakCardIds.length ? "needs another pass" : "looking good",
      hoverText: weakCardIds.length ? "Click to open weak-card review" : "No weak cards right now",
      actionLabel: weakCardIds.length ? "Open weak review" : "",
      onClick: () => {
        setFilterWeakOnly(true);
        setMode("flashcard");
      },
      tags: ["Review"],
      colSpan: 1,
    },
    {
      title: String(reviewSessions.length),
      description: "Review Sessions",
      icon: "SAVE",
      status: reviewSessions.length ? `${reviewSessionAverage}% average score` : "nothing reviewed yet",
      hoverText: reviewSessions.length
        ? `${reviewSessions[0].subject} latest review | ${reviewSessions[0].score || 0}%`
        : "Submit a session to start tracking progress",
      actionLabel: reviewSessions.length ? "Open review history" : "",
      onClick: () => setMetricHover(metricHover === "sessions" ? "" : "sessions"),
      tags: ["Sessions"],
      colSpan: 1,
    },
    {
      title: "Daily Boost",
      description: gentlePush,
      icon: "GO",
      status: hasCustomSource ? "focused source mode" : "standard subject mode",
      tags: ["Encouragement"],
      colSpan: 2,
      interactive: false,
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
              overflow: "hidden",
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

        <style>
          {`
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

        <MagicBento items={bentoItems} />
        {metricHover === "accuracy" ? (
          <div
            style={{
              ...panelStyle,
              padding: 16,
              background: "#FBFAF7",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, marginBottom: 8 }}>
              Accuracy Detail
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, lineHeight: 1.7 }}>
              <div>Rated: <strong>{Object.keys(ratings).length}</strong></div>
              <div>Strong: <strong>{Object.values(ratings).filter((value) => value === "easy").length}</strong></div>
              <div>Needs work: <strong>{weakCardIds.length}</strong></div>
            </div>
          </div>
        ) : null}
        {metricHover === "sessions" ? (
          <div
            style={{
              ...panelStyle,
              padding: 16,
              background: "#FBFAF7",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, marginBottom: 8 }}>
              Session Progress
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, lineHeight: 1.7 }}>
              <div>Submitted: <strong>{reviewSessions.length}</strong></div>
              <div>Average score: <strong>{reviewSessionAverage}%</strong></div>
              <div>
                Last session: <strong>{reviewSessions[0] ? buildSessionLabel(reviewSessions[0]) : "None yet"}</strong>
              </div>
            </div>
          </div>
        ) : null}

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
                      {subject} | {difficulty === "All" ? "all difficulties" : difficulty} | {topicFilter || "all topics"} | target {FLASHCARD_SET_SIZE} cards per set
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
                      {apiLoading ? "Loading..." : topicFilter || hasCustomSource ? "Generate More with Gemini" : "Gemini Focus Set"}
                    </button>
                  </div>
                </div>

                {currentCard ? (
                  <>
                    <Flashcard
                      card={currentCard}
                      idx={cardIdx}
                      total={flashcards.length}
                      onRate={handleRate}
                    />
                    <div
                      style={{
                        marginTop: 16,
                        borderRadius: 18,
                        padding: 18,
                        background: "#FBFAF7",
                        border: `1.5px solid ${C.border}`,
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, marginBottom: 10 }}>
                        Flashcard Session Progress
                      </div>
                      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 14, lineHeight: 1.7 }}>
                        <div>Reviewed: <strong>{flashcardCompletedCount} / {flashcards.length}</strong></div>
                        <div>Strong: <strong>{flashcardStrongCount}</strong></div>
                        <div>Needs work: <strong>{flashcardNeedsReviewCount}</strong></div>
                        <div>Progress: <strong>{flashcardProgressPercent}%</strong></div>
                      </div>
                      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
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
                            onClick={() => loadLocalFlashcardSet("A new 10-card flashcard set is ready.")}
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
                            Start Another Set
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
                      padding: "44px 24px",
                      textAlign: "center",
                      color: C.muted,
                      lineHeight: 1.7,
                    }}
                  >
                    No card data exists for this exact filter yet. Try another focus or upload a document to build more cards.
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
                      Target {QUIZ_SET_SIZE} questions | strict difficulty filter | saved sessions supported
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
                      {apiLoading ? "Generating..." : topicFilter || hasCustomSource ? "Generate Another 10" : "Generate 10 Questions"}
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
                    Generate a quiz to load a 10-question session for this subject and topic focus.
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
                        padding: 22,
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
                      <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.5 }}>
                        {quizItem.prompt}
                      </div>
                    </div>

                    <div key={`${quizItem.id}-options`} style={{ marginTop: 16, display: "grid", gap: 10, animation: "caredropFadeSlide 0.24s ease" }}>
                      {quizItem.options.map((option) => {
                        const selected = quizItem.userAnswer === option;
                        const correct = normalize(option) === normalize(quizItem.correctAnswer);
                        const background = showFeedback && correct
                          ? "#ECFDF5"
                          : showFeedback && selected && !correct
                            ? "#FFF1F2"
                            : C.panelNeutralAlt;
                        const borderColor = showFeedback && correct
                          ? "#10B981"
                          : showFeedback && selected && !correct
                            ? "#F43F5E"
                            : C.panelNeutralDark;

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
                              transition: "transform 0.18s ease, border-color 0.18s ease, background 0.18s ease",
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
                          background: currentCorrect ? "#F3FBF6" : "#FFF6F6",
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
                          {!currentCorrect ? (
                            <div>
                              <strong>Why your answer is weaker:</strong> It does not match the best nursing priority or review principle as closely as the correct answer.
                            </div>
                          ) : null}
                        </div>
                        {!currentCorrect ? (
                          <div
                            style={{
                              marginTop: 14,
                              padding: 14,
                              borderRadius: 14,
                              background: "#FFFFFF",
                              border: `1px solid ${C.panelNeutralDark}`,
                            }}
                          >
                            <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, marginBottom: 8 }}>
                              AI Review Help
                            </div>
                            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 10 }}>
                              Ask anything about this missed item. You can ask for a mnemonic, a simpler explanation, or another example.
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <input
                                value={question}
                                onChange={(event) => setQuestion(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    askClaude();
                                  }
                                }}
                                placeholder="Why is this correct? Explain it simply. Give me a mnemonic..."
                                style={{
                                  flex: 1,
                                  minWidth: 220,
                                  padding: "10px 12px",
                                  borderRadius: 10,
                                  border: `1px solid ${C.border}`,
                                  background: "#FBFAF7",
                                  fontSize: 13,
                                  outline: "none",
                                }}
                              />
                              <button
                                onClick={askClaude}
                                disabled={apiLoading || !question.trim()}
                                style={{
                                  padding: "10px 14px",
                                  borderRadius: 10,
                                  border: "none",
                                  background: apiLoading || !question.trim() ? C.border : C.accent,
                                  color: apiLoading || !question.trim() ? C.muted : "#fff",
                                  fontWeight: 700,
                                  cursor: apiLoading || !question.trim() ? "not-allowed" : "pointer",
                                }}
                              >
                                {apiLoading ? "Thinking..." : "Ask AI"}
                              </button>
                            </div>
                            {aiResponse ? (
                              <div
                                style={{
                                  marginTop: 10,
                                  padding: 12,
                                  borderRadius: 12,
                                  background: C.accentLight,
                                  border: `1px solid ${C.accentMid}`,
                                  fontSize: 13,
                                  lineHeight: 1.7,
                                  whiteSpace: "pre-wrap",
                                }}
                              >
                                {aiResponse}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            onClick={() => {
                              setShowFeedback(false);
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
                        </div>
                      </div>
                    ) : null}

                    {quizIdx === quiz.length - 1 && quizItem.userAnswer !== null ? (
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
                          Quiz Summary
                        </div>
                        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 14 }}>
                          <div>Answered: <strong>{answeredCount}</strong></div>
                          <div>Correct: <strong>{correctCount}</strong></div>
                          <div>
                            Score: <strong>{quiz.length ? Math.round((correctCount / quiz.length) * 100) : 0}%</strong>
                          </div>
                        </div>
                        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button
                            onClick={submitQuizSession}
                            disabled={answeredCount < quiz.length || quizSubmitted}
                            style={{
                              padding: "10px 16px",
                              borderRadius: 10,
                              border: "none",
                              background: answeredCount < quiz.length || quizSubmitted ? C.border : C.accent,
                              color: answeredCount < quiz.length || quizSubmitted ? C.muted : "#fff",
                              fontWeight: 700,
                              cursor: answeredCount < quiz.length || quizSubmitted ? "not-allowed" : "pointer",
                            }}
                          >
                            {quizSubmitted ? "Quiz Session Submitted" : "Submit Quiz Session"}
                          </button>
                          {quizSubmitted ? (
                            <button
                              onClick={generateQuiz}
                              disabled={apiLoading}
                              style={{
                                padding: "10px 16px",
                                borderRadius: 10,
                                border: `1px solid ${C.border}`,
                                background: C.surface,
                                color: C.text,
                                fontWeight: 700,
                                cursor: apiLoading ? "not-allowed" : "pointer",
                              }}
                            >
                              Generate Another Set
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {mode === "notes" ? (
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
                    background: dragActive ? C.accentLight : "#FBFAF7",
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
                {uploadedText ? (
                  <div
                    style={{
                      marginTop: 16,
                      background: "#FBFAF7",
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
            ) : null}

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
                    />
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                  Submit a flashcard or quiz session and it will appear here for review later.
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
        CareDrop | subject-focused flashcards and quizzes with Gemini support
      </footer>

      <button
        type="button"
        onClick={() => {
          setRequestStatus("");
          setRequestModalOpen(true);
        }}
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          zIndex: 90,
          border: "none",
          borderRadius: 999,
          background: C.accent,
          color: "#fff",
          padding: "12px 16px",
          fontWeight: 800,
          boxShadow: "0 14px 26px rgba(45, 106, 79, 0.28)",
          cursor: "pointer",
        }}
      >
        Request or Report
      </button>

      <RequestModal
        open={requestModalOpen}
        onClose={() => setRequestModalOpen(false)}
        requestType={requestType}
        setRequestType={setRequestType}
        requestName={requestName}
        setRequestName={setRequestName}
        requestMessage={requestMessage}
        setRequestMessage={setRequestMessage}
        onSubmit={submitRequest}
        requestHistory={requestHistory}
        requestStatus={requestStatus}
      />
    </div>
  );
}


