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
  (entry, subject) => `Which statement is most accurate about ${entry.topic} in ${subject}?`,
  (entry, subject) => `A patient scenario highlights ${entry.topic}. What should the nurse remember first in ${subject}?`,
  (entry, subject) => `What is the safest nursing takeaway for ${entry.topic} in ${subject}?`,
  (entry, subject) => `Which clue most strongly points to the correct response for ${entry.topic} in ${subject}?`,
  (entry, subject, difficulty) => `For a ${difficulty} ${subject} review item about ${entry.topic}, which response is best?`,
  (entry, subject) => `During review of ${subject}, what key principle should be tied to ${entry.topic}?`,
  (entry, subject) => `If ${entry.topic} appears in a ${subject} question stem, what answer should come to mind?`,
  (entry, subject) => `Which nursing judgment matters most when ${entry.topic} appears in ${subject}?`,
  (entry, subject, difficulty) => `A ${difficulty} board item on ${entry.topic} is testing which safe response in ${subject}?`,
  (entry, subject) => `What board-level reminder should stay attached to ${entry.topic} during ${subject} review?`
];
export const ANSWER_REMINDERS = [
  (entry, subject) => `Board focus: connect ${entry.topic} to the safest nursing priority in ${subject}.`,
  (entry, subject, difficulty) => `Review clue: this is the ${difficulty} takeaway the stem is pointing toward in ${subject}.`,
  (entry) => `Memory hook: if the item is really about ${entry.topic}, this is the answer to anchor first.`,
  (entry, subject) => `Clinical anchor: keep ${entry.topic} tied to the safest next nursing step in ${subject}.`,
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
