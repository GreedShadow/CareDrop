import { createClient } from "@supabase/supabase-js";

function summarizeUserReviewSessions(reviewSessions = []) {
  const sessions = Array.isArray(reviewSessions) ? reviewSessions : [];
  const scoredSessions = sessions.filter((session) => typeof session?.score === "number");
  const averageScore = scoredSessions.length
    ? Math.round(scoredSessions.reduce((total, session) => total + Number(session.score || 0), 0) / scoredSessions.length)
    : 0;

  const subjectMisses = sessions.reduce((accumulator, session) => {
    const subject = session.subject || "Mixed Review";
    const wrongCount =
      Number(session.weakCount || 0) ||
      Math.max(
        Number(session.answeredCount || 0) - Number(session.correctCount || 0),
        0
      );

    accumulator[subject] = (accumulator[subject] || 0) + wrongCount;
    return accumulator;
  }, {});

  const weakSubject = Object.entries(subjectMisses).sort((left, right) => Number(right[1]) - Number(left[1]))[0]?.[0] || "";
  const lastSession = sessions[0] || null;

  return {
    totalSessions: sessions.length,
    flashcardSessions: sessions.filter((session) => session.mode === "flashcard").length,
    quizSessions: sessions.filter((session) => session.mode === "quiz").length,
    simulationSessions: sessions.filter((session) => session.mode === "simulation").length,
    remediationSessions: sessions.filter((session) => session.mode === "remediation" || session.isRemediation).length,
    averageScore,
    weakSubject,
    lastActiveAt: lastSession?.createdAt || null,
  };
}

function getAdminClient() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function listAdminUsers() {
  const adminClient = getAdminClient();

  if (!adminClient) {
    return {
      configured: false,
      users: [],
      error: "Admin analytics needs SUPABASE_SERVICE_ROLE_KEY on the server.",
    };
  }

  const [{ data: authData, error: authError }, { data: progressRows, error: progressError }] = await Promise.all([
    adminClient.auth.admin.listUsers(),
    adminClient.from("user_progress").select("user_id,payload,updated_at").limit(200),
  ]);

  if (authError) {
    throw new Error(authError.message || "Failed to load users for admin analytics.");
  }

  if (progressError) {
    throw new Error(progressError.message || "Failed to load user progress for admin analytics.");
  }

  const progressMap = new Map(
    (progressRows || []).map((row) => [row.user_id, row])
  );

  const users = (authData?.users || []).map((user) => {
    const progress = progressMap.get(user.id);
    const payload = progress?.payload && typeof progress.payload === "object" ? progress.payload : {};
    const reviewSessions = Array.isArray(payload.reviewSessions) ? payload.reviewSessions : [];
    const summary = summarizeUserReviewSessions(reviewSessions);

    return {
      id: user.id,
      email: user.email || "",
      name: user.user_metadata?.full_name || user.user_metadata?.name || "",
      createdAt: user.created_at || null,
      lastSignInAt: user.last_sign_in_at || null,
      lastProgressSyncAt: progress?.updated_at || null,
      ...summary,
    };
  });

  return {
    configured: true,
    users: users.sort((left, right) => new Date(right.lastActiveAt || right.lastProgressSyncAt || 0).getTime() - new Date(left.lastActiveAt || left.lastProgressSyncAt || 0).getTime()),
  };
}
