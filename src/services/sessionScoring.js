import { clamp } from "../caredrop/helpers";

export function calculateChoiceScore(item) {
  if (!item) {
    return 0;
  }

  if (typeof item.correct === "boolean") {
    return item.correct ? 1 : 0;
  }

  return item.selected !== undefined && item.answer !== undefined && item.selected === item.answer ? 1 : 0;
}

export function summarizeAnswerSet(items = []) {
  const answered = items.filter((item) => item.selected !== undefined || typeof item.correct === "boolean");
  const correctCount = answered.filter((item) => calculateChoiceScore(item) === 1).length;
  const total = items.length || 0;

  return {
    total,
    answeredCount: answered.length,
    correctCount,
    incorrectCount: Math.max(answered.length - correctCount, 0),
    score: total ? clamp(Math.round((correctCount / total) * 100), 0, 100) : 0,
  };
}

export function buildSubjectScoreBreakdown(items = []) {
  const buckets = new Map();

  items.forEach((item) => {
    const subject = item.subject || "Mixed Review";
    if (!buckets.has(subject)) {
      buckets.set(subject, { subject, total: 0, correct: 0 });
    }

    const bucket = buckets.get(subject);
    bucket.total += 1;
    bucket.correct += calculateChoiceScore(item);
  });

  return [...buckets.values()].map((bucket) => ({
    ...bucket,
    score: bucket.total ? clamp(Math.round((bucket.correct / bucket.total) * 100), 0, 100) : 0,
  }));
}
