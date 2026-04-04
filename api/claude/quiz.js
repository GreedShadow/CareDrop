import { sendJson, readJsonBody } from "../utils.js";
import {
  buildStudyContext,
  callClaude,
  extractTextContent,
  model,
  parseJsonResponse,
  requireClient,
} from "../../server/claude-utils.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { success: false, error: "Method not allowed." });
  }

  try {
    const client = requireClient();
    if (!client) {
      return sendJson(res, 500, { success: false, error: "Missing ANTHROPIC_API_KEY in server environment." });
    }

    const body = await readJsonBody(req);
    const notes = String(body?.notes || "").trim();
    const subject = String(body?.subject || "Mixed Review");
    const topic = String(body?.topic || "").trim();
    const difficulty = String(body?.difficulty || "medium");
    const count = Math.max(6, Math.min(20, Number(body?.count || 10)));
    const excludeQuestions = Array.isArray(body?.excludeQuestions) ? body.excludeQuestions.slice(0, 160) : [];
    const context = buildStudyContext({ notes, subject, topic });

    if (!context) {
      return sendJson(res, 400, { success: false, error: "Provide notes, a subject, or a topic focus." });
    }

    const difficultyInstruction =
      difficulty === "mixed"
        ? "Use a balanced mix of easy, medium, and hard questions."
        : `Every question must be ${difficulty} difficulty only. Do not mix in other difficulties.`;

    const response = await callClaude(client, {
      model,
      max_tokens: 3600,
      system:
        'You generate nursing multiple-choice quizzes. Return only valid JSON matching this shape: {"questions":[{"subject":"string","difficulty":"easy|medium|hard","topic":"string","prompt":"string","correctAnswer":"string","options":["string","string","string","string"],"rationale":"string","notes":"string"}]}. Each question must have four distinct options, one clearly best answer, and board-style rationale. Respect the requested subject, topic, and difficulty boundaries.',
      messages: [
        {
          role: "user",
          content: [
            `Generate ${count} nursing quiz questions.`,
            difficultyInstruction,
            context,
            excludeQuestions.length
              ? `Do not repeat or closely paraphrase any of these previous questions:\n- ${excludeQuestions.join("\n- ")}`
              : "Make the questions fresh and not repetitive.",
          ].join("\n\n"),
        },
      ],
    });

    const parsed = parseJsonResponse(extractTextContent(response.content));
    const questions = Array.isArray(parsed?.questions) ? parsed.questions.slice(0, count) : [];
    return sendJson(res, 200, { success: true, questions });
  } catch (error) {
    console.error("Vercel Claude quiz error:", error);
    return sendJson(res, 500, {
      success: false,
      error: error.message || "Failed to generate Claude quiz questions.",
    });
  }
}
