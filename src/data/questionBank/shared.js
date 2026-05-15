export const BANK_ITEMS_PER_BUCKET = 42;
export const BUCKET_DIFFICULTIES = [
  "easy",
  "medium",
  "hard"
];
export const QUESTION_LEAD_INS = [
  "Board recall:",
  "Focused review:",
  "Nursing priority check:",
  "PRC NLE review:",
  "Clinical decision point:",
  "Exam coaching prompt:"
];
export const QUESTION_TEMPLATES = [
  (entry) => entry.q,
  (entry) => `A client scenario involves ${entry.topic}. Clinical cue: ${entry.q} Which option is the best answer?`,
  (entry) => `The nurse is reviewing a client-care cue related to ${entry.topic}. Clinical cue: ${entry.q} Which answer best matches the nursing priority?`,
  (entry) => `During board review, connect this ${entry.topic} cue to the safest response: ${entry.q} What is the best answer?`,
  (entry) => `A learner is practicing questions about ${entry.topic}. Clinical cue: ${entry.q} Which choice is most appropriate?`,
  (entry, subject, difficulty) => `For a ${difficulty} PNLE review item, use this ${entry.topic} stem: ${entry.q} Which response is best?`,
  (entry, subject) => `The client-care cue is tied to ${entry.topic}. Stem: ${entry.q} Which nursing judgment should guide the answer?`,
  (entry) => `The question is testing ${entry.topic}. Stem: ${entry.q} Which option should the nurse choose?`,
  (entry, subject) => `A board-style item gives this ${entry.topic} cue: ${entry.q} Which nursing response is the safest?`,
  (entry, subject, difficulty) => `A ${difficulty} review question asks about ${entry.topic}: ${entry.q} Which answer is most accurate?`,
  (entry) => `Use this clinical cue for ${entry.topic}: ${entry.q} Which answer best fits the stem?`
];
export const ANSWER_REMINDERS = [
  (entry) => `Board focus: connect ${entry.topic} to the safest nursing priority.`,
  (entry, subject, difficulty) => `Review clue: this is the ${difficulty} takeaway the stem is pointing toward.`,
  (entry) => `Memory hook: if the item is really about ${entry.topic}, this is the answer to anchor first.`,
  (entry) => `Clinical anchor: keep ${entry.topic} tied to the safest next nursing step.`,
  (entry) => `Review note: this concept is meant to feel automatic by the time you sit for boards.`
];
export const FLASHCARD_RATING_POINTS = {
  "easy": 1,
  "hard": 0.45,
  "again": 0
};
export const SLOW_RESPONSE_THRESHOLDS_MS = {
  "flashcard": 12000,
  "quiz": 25000,
  "remediation": 22000,
  "simulation": 30000
};
