import { sendJson, readJsonBody } from "../utils.js";
import {
  buildStudyContext,
  generateJson,
  requireClient,
} from "../../server/ai-utils.js";
import { generateValidatedCards } from "../../server/ai-validation.js";
import { buildFallbackCards } from "../../server/ai-fallbacks.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { success: false, error: "Method not allowed." });
  }

  let body = {};

  try {
    body = await readJsonBody(req);
    const notes = String(body?.notes || "").trim();
    const subject = String(body?.subject || "Mixed Review");
    const topic = String(body?.topic || "").trim();
    const difficulty = String(body?.difficulty || "medium");
    const count = Math.max(6, Math.min(24, Number(body?.count || 10)));
    const excludeQuestions = Array.isArray(body?.excludeQuestions) ? body.excludeQuestions.slice(0, 120) : [];
    const context = buildStudyContext({ notes, subject, topic });

    if (!context) {
      return sendJson(res, 400, { success: false, error: "Provide notes, a subject, or a topic focus." });
    }

    const client = requireClient();
    if (!client) {
      return sendJson(res, 200, {
        success: true,
        fallback: true,
        warning: "Gemini is not configured on this server, so CareDrop prepared a structured fallback flashcard set.",
        cards: buildFallbackCards({ notes, subject, topic, difficulty, count }),
      });
    }

    const difficultyInstruction =
      difficulty === "mixed"
        ? "Use a balanced mix of easy, medium, and hard flashcards."
        : `Every flashcard must be ${difficulty} difficulty only. Do not mix in other difficulties.`;
    const topicInstruction = topic
      ? `Hard topic boundary: every flashcard question, answer, rationale, and takeaway must stay centered on "${topic}". Do not drift to unrelated content. If using related clinical terms, keep them directly connected to "${topic}" and mention the focus topic or a direct synonym in the card.`
      : "No specific topic focus was provided, so keep the cards aligned to the requested subject and difficulty.";

    const systemInstruction =
      `You generate PRC NLE nursing flashcards from notes and topic requests. Create exactly ${count} concise, clinically meaningful, board-focused cards. Respect the requested subject, topic, and difficulty boundaries as strict constraints. Use Philippine nursing terminology where appropriate. When community health or public-health content appears, prefer DOH-aligned guidance. When medication context appears, make the card PNDF-aware when relevant. Do not invent Philippine-specific rules or drug doses when they are not clearly supported by the prompt. Each card must include: a front-side recall prompt only, a correct answer, a short rationale explaining why the answer matters clinically, and a separate key takeaway for board review.`;
    const prompt = [
        "Build nursing study cards for a learner preparing for the Philippine PRC Nurse Licensure Examination.",
        difficultyInstruction,
        topicInstruction,
        context,
        "Keep the cards practical, safety-focused, and framed for board-review recall in the Philippines.",
        "Flashcard structure rules:",
        "- Question side: recall-based prompt only",
        "- Do not leak the answer through the question or topic phrasing",
        "- Back side answer: one correct answer",
        "- Rationale: include Correct Answer Explanation and why the answer matters clinically",
        "- Notes/key takeaway: one board-review takeaway or nursing priority reminder",
        excludeQuestions.length
          ? `Do not repeat or closely paraphrase any of these previous questions:\n- ${excludeQuestions.join("\n- ")}`
          : "Make the cards fresh and distinct.",
      ].join("\n\n");

    const cards = await generateValidatedCards({
      client,
      generateJson,
      systemInstruction,
      prompt,
      count,
      difficulty,
      maxOutputTokens: 2200,
      attempts: Number(process.env.AI_VALIDATION_ATTEMPTS || 1),
      timeoutMs: Number(process.env.AI_GENERATION_TIMEOUT_MS || 12000),
      logger: console,
    });
    return sendJson(res, 200, { success: true, cards });
  } catch (error) {
    console.error("Vercel Gemini cards error:", error);
    const count = Math.max(6, Math.min(24, Number(body?.count || 10)));
    return sendJson(res, 200, {
      success: true,
      fallback: true,
      warning: "Gemini was temporarily unavailable, so CareDrop prepared a structured fallback flashcard set.",
      cards: buildFallbackCards({
        notes: body?.notes,
        subject: body?.subject,
        topic: body?.topic,
        difficulty: body?.difficulty,
        count,
      }),
    });
  }
}
