import { sendJson, readJsonBody } from "../utils.js";
import {
  buildStudyContext,
  generateJson,
  model,
  requireClient,
} from "../../server/ai-utils.js";

const cardSchema = {
  type: "object",
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          subject: { type: "string" },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          question: { type: "string" },
          answer: { type: "string" },
          rationale: { type: "string" },
          notes: { type: "string" },
          topic: { type: "string" },
        },
        required: ["subject", "difficulty", "question", "answer", "rationale", "notes", "topic"],
      },
    },
  },
  required: ["cards"],
};

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

    const parsed = await generateJson(client, {
      systemInstruction:
        `You generate nursing flashcards from notes. Create exactly ${count} concise, board-focused cards. Respect the requested subject, topic, and difficulty boundaries.`,
      prompt: [
        "Build nursing study cards for a learner.",
        difficultyInstruction,
        context,
        excludeQuestions.length
          ? `Do not repeat or closely paraphrase any of these previous questions:\n- ${excludeQuestions.join("\n- ")}`
          : "Make the cards fresh and distinct.",
      ].join("\n\n"),
      schema: cardSchema,
      maxOutputTokens: 2200,
    });

    const cards = Array.isArray(parsed?.cards) ? parsed.cards.slice(0, count) : [];
    return sendJson(res, 200, { success: true, cards });
  } catch (error) {
    console.error("Vercel Gemini cards error:", error);
    return sendJson(res, 500, {
      success: false,
      error: error.message || "Failed to generate Gemini study cards.",
    });
  }
}
