import { normalize } from "../caredrop/helpers";
import { scoreQuestion } from "./questionTypes";

export function getTopicSearchTerms(topic) {
  const base = normalize(topic);
  if (!base) {
    return [];
  }

  const aliases = [];
  const aliasMap = {
    cardio: ["cardio", "cardiac", "cardiovascular", "heart", "coronary", "myocardial", "angina", "arrhythmia"],
    cardiac: ["cardio", "cardiac", "cardiovascular", "heart", "coronary", "myocardial", "angina", "arrhythmia"],
    cardiovascular: ["cardio", "cardiac", "cardiovascular", "heart", "coronary", "myocardial", "angina", "arrhythmia"],
    heart: ["cardio", "cardiac", "cardiovascular", "heart", "coronary", "myocardial", "angina", "arrhythmia", "heart failure"],
    pulm: ["pulmonary", "respiratory", "airway", "asthma", "copd", "oxygenation"],
    resp: ["pulmonary", "respiratory", "airway", "asthma", "copd", "oxygenation"],
    renal: ["renal", "kidney", "aki", "urine", "oliguria", "anuria"],
    neuro: ["neuro", "neurologic", "neurological", "stroke", "seizure", "icp", "brain"],
    gi: ["gi", "gastro", "gastrointestinal", "bowel", "appendicitis", "pancreatitis", "cirrhosis"],
    endo: ["endo", "endocrine", "diabetes", "thyroid", "dka", "glucose"],
    ob: ["maternal", "newborn", "ob", "postpartum", "labor", "fetal", "pregnancy"],
    pedia: ["pediatric", "pediatrics", "child", "infant", "newborn"],
    psych: ["psych", "psychiatric", "mental health", "hallucination", "suicidal", "bipolar"],
    chn: ["community health", "community", "barangay", "dengue", "tb", "dots", "public health"],
    pharma: ["pharma", "pharmacology", "drug", "medication", "anticoagulant", "insulin"],
  };

  Object.entries(aliasMap).forEach(([key, values]) => {
    if (base.includes(key) || values.some((value) => base.includes(normalize(value)))) {
      aliases.push(...values);
    }
  });

  return Array.from(new Set([base, ...base.split(/\s+/), ...aliases.map((value) => normalize(value))].filter(Boolean)));
}

export function collectIncorrectQuestions(sessions = []) {
  return (sessions || []).flatMap((session) =>
    (session.questions || [])
      .filter(
        (item) =>
          item &&
          ((item.options && scoreQuestion(item) === 0) ||
            (!item.options && item.userAnswer && normalize(item.userAnswer) !== normalize(item.correctAnswer)))
      )
      .map((item) => ({
        subject: item.subject || session.subject || "Mixed Review",
        topic: item.topic || session.topic || "",
        difficulty: item.difficulty || session.difficulty || "medium",
        prompt: item.prompt || "",
      }))
  );
}

export function buildRemediationEntries(sourceEntries, incorrectItems, weakSubject) {
  const targeted = sourceEntries.filter((entry) =>
    incorrectItems.some((item) => {
      const subjectMatch =
        !item.subject || item.subject === "Mixed Review" || item.subject === entry.subject;
      const topicTerms = getTopicSearchTerms(item.topic || item.prompt || "");
      const haystack = normalize(
        `${entry.subject || ""} ${entry.topic || ""} ${entry.q || entry.prompt || ""} ${entry.a || entry.answer || ""}`
      );
      const topicMatch = !topicTerms.length || topicTerms.some((term) => haystack.includes(term));
      return subjectMatch && topicMatch;
    })
  );

  if (targeted.length) {
    return targeted;
  }

  if (weakSubject) {
    const weakSubjectEntries = sourceEntries.filter((entry) => entry.subject === weakSubject);
    if (weakSubjectEntries.length) {
      return weakSubjectEntries;
    }
  }

  return sourceEntries;
}
