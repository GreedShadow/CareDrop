import { sendJson, readJsonBody } from "../utils.js";
import {
  buildStudyContext,
  generateJson,
  requireClient,
} from "../../server/ai-utils.js";
import { generateValidatedQuestions } from "../../server/ai-validation.js";

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
    const count = Math.max(6, Math.min(20, Number(body?.count || 10)));
    const examMode = Boolean(body?.examMode);
    const examLength = Math.max(count, Math.min(500, Number(body?.examLength || count)));
    const excludeQuestions = Array.isArray(body?.excludeQuestions) ? body.excludeQuestions.slice(0, 160) : [];
    const context = buildStudyContext({ notes, subject, topic });

    if (!context) {
      return sendJson(res, 400, { success: false, error: "Provide notes, a subject, or a topic focus." });
    }

    const difficultyInstruction =
      difficulty === "mixed"
        ? "Use a balanced mix of easy, medium, and hard questions."
        : `Every question must be ${difficulty} difficulty only. Do not mix in other difficulties.`;
    const examInstruction = examMode
      ? `These questions are one batch inside a ${examLength}-question simulation exam. Make them feel like a realistic long-form board review: broad subject coverage, clinically varied stems, strong prioritization, assessment, intervention, and delegation language, and no repetitive wording. Keep exam mode difficult and PNLE-like.`
      : "Make the set feel like a focused PNLE quiz batch with scenario-based stems whenever appropriate.";

    const systemInstruction =
      "You generate PRC NLE-style nursing quiz questions. Every item must have four distinct, believable options and a board-style rationale. Most items should be single_choice with one clearly best answer. In simulation exam mode only, you may include a limited number of multiple_response (Select All That Apply) items when clinically appropriate. Respect the requested subject, topic, and difficulty boundaries. Use Philippine nursing terminology where appropriate. Prefer DOH-aligned guidance for community/public-health content and PNDF-aware medication context when drug knowledge is relevant. Do not invent country-specific rules, laws, or medication doses when they are not clearly supported.";
    const prompt = [
        `Generate ${count} nursing quiz questions for a Philippine board-review learner.`,
        difficultyInstruction,
        examInstruction,
        context,
        "Make the questions clinically clear, prioritization-aware, and useful for PRC NLE preparation.",
        "Question quality rules:",
        "- Use 4 plausible answer choices",
        examMode
          ? "- Use mostly single_choice items, but you may include a limited number of multiple_response SATA items when clinically appropriate"
          : "- One best answer only",
        examMode
          ? "- For multiple_response items, set type=multiple_response and provide correctOptionIds for every correct choice while still keeping exactly 4 options"
          : "- Keep these as single_choice items only.",
        "- Avoid clue leakage from subject labels or obvious wording",
        "- Distractors should be realistic but less appropriate than the correct answer",
        "- Rationales must explain why the best answer is correct and why the other options are less appropriate",
        "- Do not reveal hints inside the stem or choices",
        excludeQuestions.length
          ? `Do not repeat or closely paraphrase any of these previous questions:\n- ${excludeQuestions.join("\n- ")}`
          : "Make the questions fresh and not repetitive.",
      ].join("\n\n");

    const questions = await generateValidatedQuestions({
      client,
      generateJson,
      systemInstruction,
      prompt,
      count,
      difficulty,
      maxOutputTokens: 3600,
      logger: console,
    });
    return sendJson(res, 200, { success: true, questions });
  } catch (error) {
    console.error("Vercel Gemini quiz error:", error);
    return sendJson(res, 500, {
      success: false,
      error: error.message || "Failed to generate Gemini quiz questions.",
    });
  }
}
