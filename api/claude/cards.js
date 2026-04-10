import { sendJson, readJsonBody } from "../utils.js";
import {
  buildStudyContext,
  generateJson,
  requireClient,
} from "../../server/ai-utils.js";
import { generateValidatedCards } from "../../server/ai-validation.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { success: false, error: "Method not allowed." });
  }

  try {
    const client = requireClient();
    if (!client) {
      return sendJson(res, 500, { success: false, error: "Missing GEMINI_API_KEY in server environment." });
    }

    const body = await readJsonBody(req);
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

    const difficultyInstruction =
      difficulty === "mixed"
        ? "Use a balanced mix of easy, medium, and hard flashcards."
        : `Every flashcard must be ${difficulty} difficulty only. Do not mix in other difficulties.`;

    const systemInstruction =
      `You generate PRC NLE nursing flashcards from notes and topic requests. Create exactly ${count} concise, board-focused cards. Respect the requested subject, topic, and difficulty boundaries. Use Philippine nursing terminology where appropriate. When community health or public-health content appears, prefer DOH-aligned guidance. When medication context appears, make the card PNDF-aware when relevant. Do not invent Philippine-specific rules or drug doses when they are not clearly supported by the prompt.`;
    const prompt = [
        "Build nursing study cards for a learner preparing for the Philippine PRC Nurse Licensure Examination.",
        difficultyInstruction,
        context,
        "Keep the cards practical, safety-focused, and framed for board-review recall in the Philippines.",
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
      logger: console,
    });
    return sendJson(res, 200, { success: true, cards });
  } catch (error) {
    console.error("Vercel Gemini cards error:", error);
    return sendJson(res, 500, {
      success: false,
      error: error.message || "Failed to generate Gemini study cards.",
    });
  }
}
