function average(values) {
  if (!values?.length) {
    return 0;
  }

  return values.reduce((total, value) => total + Number(value || 0), 0) / values.length;
}

function createPerformanceBucket(subject, topic = "") {
  return {
    subject,
    topic,
    attempts: 0,
    correct: 0,
    misses: 0,
    unsure: 0,
    totalResponseTime: 0,
    repeatedMisses: 0,
    modules: new Set(),
    scores: [],
    remediationScores: [],
  };
}

function getPerformanceKey(subject, topic = "") {
  return `${subject || "Mixed Review"}::${String(topic || "").trim().toLowerCase()}`;
}

function getOrCreatePerformanceBucket(bucketMap, subject, topic = "") {
  const key = getPerformanceKey(subject, topic);

  if (!bucketMap.has(key)) {
    bucketMap.set(key, createPerformanceBucket(subject, topic));
  }

  return bucketMap.get(key);
}

function recordPerformanceAttempt(
  bucketMap,
  {
    subject,
    topic,
    correct = false,
    unsure = false,
    responseTime = 0,
    module = "quiz",
    score = null,
    remediationScore = null,
  }
) {
  const bucket = getOrCreatePerformanceBucket(bucketMap, subject, topic);

  bucket.attempts += 1;
  bucket.correct += correct ? 1 : 0;
  bucket.misses += correct ? 0 : 1;
  bucket.unsure += unsure ? 1 : 0;
  bucket.totalResponseTime += Number(responseTime || 0);
  bucket.modules.add(module);

  if (!correct && bucket.misses > 1) {
    bucket.repeatedMisses += 1;
  }

  if (typeof score === "number") {
    bucket.scores.push(score);
  }

  if (typeof remediationScore === "number") {
    bucket.remediationScores.push(remediationScore);
  }
}

export function summarizePerformanceBuckets(reviewSessions) {
  const subjectBuckets = new Map();
  const topicBuckets = new Map();
  const subjectSessionScores = {};

  (reviewSessions || []).forEach((session) => {
    const sessionSubject = session.subject || "Mixed Review";
    const items = session.questions || session.cards || [];
    const responseTimes = session.responseTimes || {};
    const sessionScore = Number(session.score || 0);

    if (!subjectSessionScores[sessionSubject]) {
      subjectSessionScores[sessionSubject] = [];
    }

    subjectSessionScores[sessionSubject].push(sessionScore);

    items.forEach((item, index) => {
      const topic = item.topic || session.topic || "";
      const key = item.id || item.prompt || item.question || `${session.id}-${index}`;
      const responseTime = Number(responseTimes[key] || 0);
      const selected = item.selected;
      const correctOption = item.answer;
      const rating = item.rating;
      const correct =
        typeof item.correct === "boolean"
          ? item.correct
          : rating
            ? rating === "easy"
            : selected !== undefined && correctOption !== undefined
              ? selected === correctOption
              : false;
      const unsure = rating === "hard" || rating === "again";

      recordPerformanceAttempt(topicBuckets, {
        subject: sessionSubject,
        topic,
        correct,
        unsure,
        responseTime,
        module: session.mode || "review",
        score: sessionScore,
        remediationScore: session.mode === "remediation" ? sessionScore : null,
      });

      recordPerformanceAttempt(subjectBuckets, {
        subject: sessionSubject,
        topic: "",
        correct,
        unsure,
        responseTime,
        module: session.mode || "review",
        score: sessionScore,
        remediationScore: session.mode === "remediation" ? sessionScore : null,
      });
    });

    if (!items.length) {
      recordPerformanceAttempt(subjectBuckets, {
        subject: sessionSubject,
        topic: "",
        correct: sessionScore >= 70,
        responseTime: 0,
        module: session.mode || "review",
        score: sessionScore,
        remediationScore: session.mode === "remediation" ? sessionScore : null,
      });
    }
  });

  const toSummary = (bucket) => {
    const accuracy = bucket.attempts ? bucket.correct / bucket.attempts : 0;
    const averageResponseTime = bucket.attempts ? bucket.totalResponseTime / bucket.attempts : 0;
    const lowConfidenceRatio = bucket.attempts ? bucket.unsure / bucket.attempts : 0;
    const improvement =
      bucket.remediationScores.length > 1
        ? bucket.remediationScores[bucket.remediationScores.length - 1] - bucket.remediationScores[0]
        : 0;
    const focusScore = Math.round(
      ((1 - accuracy) * 45) +
        Math.min(bucket.repeatedMisses * 8, 20) +
        Math.min(lowConfidenceRatio * 20, 15) +
        Math.min(averageResponseTime / 8, 10) +
        (bucket.modules.size > 1 ? 10 : 0)
    );

    return {
      subject: bucket.subject,
      topic: bucket.topic,
      accuracy,
      attempts: bucket.attempts,
      misses: bucket.misses,
      repeatedMisses: bucket.repeatedMisses,
      averageResponseTime,
      lowConfidenceRatio,
      focusScore,
      modules: [...bucket.modules],
      improvement,
      latestScore: bucket.scores.length ? bucket.scores[bucket.scores.length - 1] : 0,
    };
  };

  const topicSummary = [...topicBuckets.values()].map(toSummary).sort((left, right) => right.focusScore - left.focusScore);
  const subjectSummary = [...subjectBuckets.values()].map(toSummary).sort((left, right) => right.focusScore - left.focusScore);

  const strongestSubject = [...subjectSummary]
    .filter((item) => item.attempts >= 2)
    .sort((left, right) => right.accuracy - left.accuracy)[0] || null;

  const mostImprovedSubject =
    Object.entries(subjectSessionScores)
      .map(([subject, scores]) => ({
        subject,
        improvement: scores.length > 1 ? scores[scores.length - 1] - scores[0] : 0,
      }))
      .sort((left, right) => right.improvement - left.improvement)[0] || null;

  const primaryTopicFocus = topicSummary.find((item) => item.attempts >= 2 && item.focusScore >= 35);
  const primarySubjectFocus = subjectSummary.find((item) => item.attempts >= 2 && item.focusScore >= 25);
  const primaryFocus = primaryTopicFocus || primarySubjectFocus || null;

  const recommendedAction = (() => {
    if (!primaryFocus) {
      return {
        type: "flashcard",
        label: "Start Focus Set",
        body: "You are in a good spot to keep building steady momentum with another short set.",
      };
    }

    if (primaryFocus.modules.includes("simulation") || primaryFocus.averageResponseTime > 25) {
      return {
        type: "simulation",
        label: "Retry Weak Topics",
        body: "A broader exam-style pass may help strengthen slower decision-making and cross-topic application.",
      };
    }

    if (primaryFocus.repeatedMisses >= 2 || primaryFocus.modules.includes("remediation")) {
      return {
        type: "remediation",
        label: "Start Remediation Quiz",
        body: "You may benefit from extra application-based practice around the items that are still pulling your score down.",
      };
    }

    return {
      type: "flashcard",
      label: "Start Focus Set",
      body: "This looks more recall-based right now, so a focused flashcard pass is the gentlest next step.",
    };
  })();

  return {
    primaryFocus,
    topicSummary,
    subjectSummary,
    strongestSubject,
    mostImprovedSubject,
    recommendedAction,
  };
}
