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
    const count = Math.max(6, Math.min(24, Number(body?.count || 10)));
    const excludeQuestions = Array.isArray(body?.excludeQuestions) ? body.excludeQuestions.slice(0, 120) : [];
    const context = buildStudyContext({ notes, subject, topic });

    if (!context) {
      return sendJson(res, 400, { success: false, error: "Provide notes, a subject, or a topic focus." });
    }

    const response = await callClaude(client, {
      model,
      max_tokens: 2200,
      system:
        `You generate nursing flashcards from notes. Return only valid JSON matching this shape: {"cards":[{"subject":"string","difficulty":"easy|medium|hard","question":"string","answer":"string","rationale":"string","notes":"string","topic":"string"}]}. Create exactly ${count} concise, board-focused cards. Respect the requested subject, topic, and difficulty boundaries.`,
      messages: [
        {
          role: "user",
          content: [
            "Build nursing study cards for a learner.",
            context,
            excludeQuestions.length
              ? `Do not repeat or closely paraphrase any of these previous questions:\n- ${excludeQuestions.join("\n- ")}`
              : "Make the cards fresh and distinct.",
          ].join("\n\n"),
        },
      ],
    });

    const parsed = parseJsonResponse(extractTextContent(response.content));
    const cards = Array.isArray(parsed?.cards) ? parsed.cards.slice(0, count) : [];
    return sendJson(res, 200, { success: true, cards });
  } catch (error) {
    console.error("Vercel Claude cards error:", error);
    return sendJson(res, 500, {
      success: false,
      error: error.message || "Failed to generate Claude study cards.",
    });
  }
}
