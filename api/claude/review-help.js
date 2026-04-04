import { sendJson, readJsonBody } from "../utils.js";
import { generateText, requireClient } from "../../server/ai-utils.js";

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

    const response = await generateText(client, {
      systemInstruction:
        "You are a nursing board exam coach. Answer only in the context of the missed question. First, directly answer the learner's exact typed question in 1 to 2 sentences. Then explain why the correct answer is best, why the learner's chosen answer is weaker, what clue in the question stem points to the right answer, and what high-yield board takeaway to remember. Do not give a generic explanation. Keep the reply specific to the missed item and easy to understand.",
      prompt: [
        `Subject: ${subject}`,
        `Topic: ${topic || "General review"}`,
        `Difficulty: ${difficulty}`,
        `Question: ${question}`,
        `Chosen answer: ${selectedAnswer || "No answer recorded"}`,
        `Correct answer: ${correctAnswer}`,
        `Rationale: ${rationale || "None provided."}`,
        notes ? `Memory tip: ${notes}` : "",
        `Learner's exact question to answer first: ${userPrompt}`,
        "Format the answer with these short headings:",
        "1. Direct answer",
        "2. Why your answer was weaker",
        "3. Clue in the question",
        "4. What to remember for boards",
      ]
        .filter(Boolean)
        .join("\n\n"),
      maxOutputTokens: 900,
    });

    return sendJson(res, 200, {
      success: true,
      response:
        response ||
        `Direct answer: ${correctAnswer} is the best answer for this item.\n\nWhy your answer was weaker: ${selectedAnswer || "Your chosen answer"} did not match the strongest nursing priority or teaching point.\n\nClue in the question: Focus on the part of the stem that points toward ${topic || "the core concept"}.\n\nWhat to remember for boards: ${rationale || notes || correctAnswer}`,
    });
  } catch (error) {
    console.error("Vercel Gemini review help error:", error);
    return sendJson(res, 500, {
      success: false,
      error: error.message || "Failed to generate the AI explanation.",
    });
  }
}
