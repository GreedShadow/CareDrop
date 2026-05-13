import { getProgressStorageKey } from "../caredrop/app-utils";
import { coerceDate } from "../caredrop/planning";

export function buildProgressSnapshot(state) {
  return {
    subject: state.subject,
    difficulty: state.difficulty,
    topicFilter: state.topicFilter,
    mode: state.mode,
    ratings: state.ratings,
    sessions: state.sessions,
    reviewSessions: state.reviewSessions,
    flashcards: state.flashcards,
    cardIdx: state.cardIdx,
    cardSchedule: state.cardSchedule,
    flashcardSessionRatings: state.flashcardSessionRatings,
    flashcardResponseTimes: state.flashcardResponseTimes,
    flashcardSessionSubmitted: state.flashcardSessionSubmitted,
    quiz: state.quiz,
    quizIdx: state.quizIdx,
    quizResponseTimes: state.quizResponseTimes,
    quizSubmitted: state.quizSubmitted,
    simulationQuestions: state.simulationQuestions,
    simulationIdx: state.simulationIdx,
    simulationResponseTimes: state.simulationResponseTimes,
    simulationSubmitted: state.simulationSubmitted,
    simulationSize: state.simulationSize,
    simulationUsedAi: state.simulationUsedAi,
    timerSettings: state.timerSettings,
    activeTimer: state.activeTimer,
    remediationContext: state.remediationContext,
    usedFlashcardIds: state.usedFlashcardIds,
    usedFlashcardQuestions: state.usedFlashcardQuestions,
    usedQuizPrompts: state.usedQuizPrompts,
    recentFlashcardIds: state.recentFlashcardIds,
    recentQuizPrompts: state.recentQuizPrompts,
    noteText: state.noteText,
    uploadedText: state.uploadedText,
    uploadedFileName: state.uploadedFileName,
    summaryText: state.summaryText,
    filterWeakOnly: state.filterWeakOnly,
    calendarMonth: coerceDate(state.calendarMonth).toISOString(),
    calendarSelectedDate: state.calendarSelectedDate,
    calendarEvents: state.calendarEvents,
    plannerItems: state.plannerItems,
    adminView: state.adminView,
  };
}

export function persistLocalSnapshot(userId, snapshot, storage = globalThis?.window?.localStorage) {
  if (!userId || !storage) {
    return;
  }

  storage.setItem(getProgressStorageKey(userId), JSON.stringify(snapshot));
}

export async function loadRemoteSnapshot(supabase, userId) {
  const { data, error } = await supabase
    .from("user_progress")
    .select("payload")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    payload: data?.payload ?? null,
    error: error ?? null,
  };
}

export async function saveRemoteSnapshot(supabase, userId, snapshot) {
  const { error } = await supabase
    .from("user_progress")
    .upsert(
      {
        user_id: userId,
        payload: snapshot,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  return {
    ok: !error,
    error: error ?? null,
  };
}

export function buildStructuredProgressRecords({ userId, snapshot, recommendation = null }) {
  const reviewSessions = snapshot.reviewSessions || [];

  return {
    planner_items: (snapshot.plannerItems || []).map((item) => ({
      user_id: userId,
      planner_id: item.id,
      title: item.title,
      subject: item.subject || null,
      mode: item.mode || null,
      due_date: item.dueDate || null,
      completed: Boolean(item.completed),
      notes: item.notes || null,
      created_at: item.createdAt || null,
      updated_at: new Date().toISOString(),
    })),
    calendar_events: (snapshot.calendarEvents || []).map((event) => ({
      user_id: userId,
      event_id: event.id,
      date_key: event.dateKey,
      title: event.title,
      type: event.type || null,
      subject: event.subject || null,
      note: event.note || null,
      created_at: event.createdAt || null,
      updated_at: new Date().toISOString(),
    })),
    review_sessions: reviewSessions.map((session) => ({
      user_id: userId,
      session_id: session.id,
      mode: session.mode || null,
      subject: session.subject || null,
      topic: session.topic || null,
      score: typeof session.score === "number" ? session.score : null,
      item_count: Array.isArray(session.questions)
        ? session.questions.length
        : Array.isArray(session.cards)
          ? session.cards.length
          : 0,
      created_at: session.createdAt || null,
      updated_at: new Date().toISOString(),
    })),
    recommendation_snapshots: recommendation
      ? [
          {
            user_id: userId,
            recommended_subject: recommendation.primaryFocus?.subject || null,
            recommended_topic: recommendation.primaryFocus?.topic || null,
            recommended_action: recommendation.recommendedAction?.type || null,
            focus_score: recommendation.primaryFocus?.focusScore ?? null,
            reason: recommendation.recommendationReasons?.join(" ") || null,
            strongest_subject: recommendation.strongestSubject?.subject || null,
            most_improved_subject: recommendation.mostImprovedSubject?.subject || null,
            created_at: new Date().toISOString(),
          },
        ]
      : [],
  };
}
