import { sendJson, readJsonBody } from "../utils.js";
import { callClaude, extractTextContent, model, requireClient } from "../../server/claude-utils.js";

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
    const userPrompt = String(body?.userPrompt || "").trim();
    const question = String(body?.question || "").trim();
    const selectedAnswer = String(body?.selectedAnswer || "").trim();
    const correctAnswer = String(body?.correctAnswer || "").trim();
    const rationale = String(body?.rationale || "").trim();
    const notes = String(body?.notes || "").trim();
    const subject = String(body?.subject || "Mixed Review");
    const topic = String(body?.topic || "").trim();
    const difficulty = String(body?.difficulty || "medium");

    if (!userPrompt || !question || !correctAnswer) {
      return sendJson(res, 400, { success: false, error: "The wrong-answer review request is incomplete." });
    }

    const response = await callClaude(client, {
      model,
      max_tokens: 900,
      system:
        "You are a nursing board exam coach. Answer only in the context of the missed question. Be clear, accurate, exam-focused, and supportive. Explain why the correct answer is best, why the chosen answer is weaker, what clue in the stem matters most, and what the learner should remember for the board exam. Keep the reply specific to the missed item.",
      messages: [
        {
          role: "user",
          content: [
            `Subject: ${subject}`,
            `Topic: ${topic || "General review"}`,
            `Difficulty: ${difficulty}`,
            `Question: ${question}`,
            `Chosen answer: ${selectedAnswer || "No answer recorded"}`,
            `Correct answer: ${correctAnswer}`,
            `Rationale: ${rationale || "None provided."}`,
            notes ? `Memory tip: ${notes}` : "",
            `Learner question: ${userPrompt}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    });

    return sendJson(res, 200, { success: true, response: extractTextContent(response.content) });
  } catch (error) {
    console.error("Vercel Claude review help error:", error);
    return sendJson(res, 500, {
      success: false,
      error: error.message || "Failed to generate the AI explanation.",
    });
  }
}
