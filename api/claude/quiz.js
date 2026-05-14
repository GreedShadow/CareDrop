import { sendJson, readJsonBody } from "../utils.js";
import {
  buildStudyContext,
  generateJson,
  requireClient,
} from "../../server/ai-utils.js";
import { generateValidatedQuestions } from "../../server/ai-validation.js";
import { buildFallbackQuestions } from "../../server/ai-fallbacks.js";

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
    const count = Math.max(6, Math.min(20, Number(body?.count || 10)));
    const examMode = Boolean(body?.examMode);
    const examLength = Math.max(count, Math.min(500, Number(body?.examLength || count)));
    const excludeQuestions = Array.isArray(body?.excludeQuestions) ? body.excludeQuestions.slice(0, 160) : [];
    const context = buildStudyContext({ notes, subject, topic });

    if (!context) {
      return sendJson(res, 400, { success: false, error: "Provide notes, a subject, or a topic focus." });
    }

    const client = requireClient();
    if (!client) {
      return sendJson(res, 200, {
        success: true,
        fallback: true,
        warning: "Gemini is not configured on this server, so CareDrop prepared a structured fallback quiz set.",
        questions: buildFallbackQuestions({ notes, subject, topic, difficulty, count, examMode }),
      });
    }

    const difficultyInstruction =
      difficulty === "mixed"
        ? "Use a balanced mix of easy, medium, and hard questions."
        : `Every question must be ${difficulty} difficulty only. Do not mix in other difficulties.`;
    const examInstruction = examMode
      ? `These questions are one batch inside a ${examLength}-question simulation exam. Make them feel like a realistic long-form board review: broad subject coverage, clinically varied stems, strong prioritization, assessment, intervention, and delegation language, and no repetitive wording. Keep exam mode difficult and PNLE-like.`
      : "Make the set feel like a focused PNLE quiz batch with scenario-based stems whenever appropriate.";
    const topicInstruction = topic
      ? `Hard topic boundary: every generated question, correct answer, rationale, and clinical scenario must stay centered on "${topic}". Do not drift to another topic just because the subject is broad. If using related terms, keep them clinically connected to "${topic}" and mention the focus topic or a direct synonym in the stem or rationale.`
      : "No specific topic focus was provided, so keep the set aligned to the requested subject and difficulty.";

    const systemInstruction =
      "You generate PRC NLE-style nursing quiz questions. Every item must be clinically accurate, PNLE-relevant, and structured as JSON only. Use scenario-based nursing stems whenever possible, with prioritization, assessment-vs-intervention, safety, delegation, or patient-teaching reasoning. Each item must have 4-5 distinct plausible options, one best answer for single_choice, and strong rationales. Most items should be single_choice. In simulation exam mode only, you may include a limited number of multiple_response (Select All That Apply) items when clinically appropriate. Respect the requested subject, topic, and difficulty boundaries as strict constraints. Use Philippine nursing terminology where appropriate. Prefer DOH-aligned guidance for community/public-health content and PNDF-aware medication context when drug knowledge is relevant. Do not invent country-specific rules, laws, or medication doses when they are not clearly supported.";
    const prompt = [
        `Generate ${count} nursing quiz questions for a Philippine board-review learner.`,
        difficultyInstruction,
        examInstruction,
        topicInstruction,
        context,
        "Make the questions clinically clear, prioritization-aware, and useful for PRC NLE preparation.",
        "Question quality rules:",
        "- Use 4 plausible answer choices, or 5 only when a SATA item needs it",
        examMode
          ? "- Use mostly single_choice items, but you may include a limited number of multiple_response SATA items when clinically appropriate"
          : "- One best answer only",
        examMode
          ? "- For multiple_response items, set type=multiple_response and provide correctOptionIds for every correct choice. SATA must have at least 2 correct choices and cannot have every option correct"
          : "- Keep these as single_choice items only.",
        "- Use option objects when possible: { id, text, rationale }",
        "- Avoid clue leakage from subject labels or obvious wording",
        "- Do not use All of the above, None of the above, always, never, joke, unrelated, or pattern-giveaway options",
        "- Distractors should be realistic but less appropriate than the correct answer",
        "- Rationales must use this exact structure: Correct Answer Explanation: ... Incorrect Options Explanation: ... Key Takeaway: ...",
        "- Incorrect Options Explanation must be specific to each wrong choice, not generic",
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
      attempts: Number(process.env.AI_VALIDATION_ATTEMPTS || 1),
      timeoutMs: Number(process.env.AI_GENERATION_TIMEOUT_MS || 14000),
      logger: console,
    });
    return sendJson(res, 200, { success: true, questions });
  } catch (error) {
    console.error("Vercel Gemini quiz error:", error);
    const count = Math.max(6, Math.min(20, Number(body?.count || 10)));
    return sendJson(res, 200, {
      success: true,
      fallback: true,
      warning: "Gemini was temporarily unavailable, so CareDrop prepared a structured fallback quiz set.",
      questions: buildFallbackQuestions({
        notes: body?.notes,
        subject: body?.subject,
        topic: body?.topic,
        difficulty: body?.difficulty,
        count,
        examMode: Boolean(body?.examMode),
      }),
    });
  }
}
