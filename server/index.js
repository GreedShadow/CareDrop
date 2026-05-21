import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";

import cors from "cors";
import express from "express";
import multer from "multer";
import { listAdminUsers } from "./admin-analytics.js";
import { buildStudyContext, fallbackModels, generateJson, generateText, model, requireClient } from "./ai-utils.js";
import { buildFallbackCards, buildFallbackQuestions, buildFallbackReviewHelp, buildFallbackSummary } from "./ai-fallbacks.js";
import { generateValidatedCards, generateValidatedQuestions, generateValidatedSummary } from "./ai-validation.js";
import { extractFileText, SUPPORTED_EXTENSIONS } from "./extract-utils.js";
import { createFeedbackRequest, listFeedbackRequests } from "./feedback-utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const port = Number(process.env.PORT || 3001);
const allowedOrigin = process.env.ALLOWED_ORIGIN?.split(",").map((value) => value.trim()).filter(Boolean);

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024,
  },
});

app.use(
  cors({
    origin: allowedOrigin?.length ? allowedOrigin : true,
  })
);
app.use(express.json({ limit: "3mb" }));

function jsonError(res, status, error, extra = {}) {
  return res.status(status).json({
    success: false,
    error,
    ...extra,
  });
}

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    ok: true,
    model,
    fallbackModels,
    configured: Boolean(process.env.GEMINI_API_KEY),
  });
});

app.get("/api/feedback", async (_req, res) => {
  try {
    const payload = await listFeedbackRequests();
    return res.json({
      success: true,
      ...payload,
    });
  } catch (error) {
    console.error("Feedback list error:", error);
    return jsonError(res, 500, error.message || "Failed to load feedback requests.");
  }
});

app.post("/api/feedback", async (req, res) => {
  try {
    const created = await createFeedbackRequest({
      type: String(req.body?.type || "General Feedback"),
      name: String(req.body?.name || "").trim(),
      message: String(req.body?.message || "").trim(),
      appContext: String(req.body?.appContext || "Submitted from CareDrop request modal."),
    });

    return res.json({
      success: true,
      request: created,
    });
  } catch (error) {
    console.error("Feedback create error:", error);
    return jsonError(res, 500, error.message || "Failed to submit the feedback request.");
  }
});

app.get("/api/admin/users", async (_req, res) => {
  try {
    const payload = await listAdminUsers();
    return res.json({
      success: true,
      ...payload,
    });
  } catch (error) {
    console.error("Admin users error:", error);
    return jsonError(res, 500, error.message || "Failed to load admin analytics.");
  }
});

app.post("/api/extract", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return jsonError(res, 400, "No file was uploaded.");
    }

    const extension = path.extname(req.file.originalname || "").toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      return jsonError(
        res,
        400,
        "Unsupported file type. Please upload a DOC, DOCX, PDF, JPG, JPEG, PNG, WEBP, or TXT file."
      );
    }

    const text = await extractFileText(req.file);
    if (!text) {
      return jsonError(
        res,
        422,
        "We could not read enough text from that file. Try a clearer image or a text-based document."
      );
    }

    return res.json({
      success: true,
      fileName: req.file.originalname,
      fileType: extension,
      text,
    });
  } catch (error) {
    console.error("Extract error:", error);
    return jsonError(res, 500, error.message || "Failed to extract readable content from the file.");
  }
});

app.post("/api/claude/summary", async (req, res) => {
  try {
    const notes = String(req.body?.notes || "").trim();
    if (!notes) {
      return jsonError(res, 400, "Notes are required.");
    }

    const client = requireClient();
    if (!client) {
      return res.json({
        success: true,
        fallback: true,
        warning: "Gemini is not configured on this server, so CareDrop prepared a structured reviewer summary from the available text.",
        summary: buildFallbackSummary(notes),
      });
    }

    const summary = await generateValidatedSummary({
      client,
      generateText,
      systemInstruction:
        "You create detailed PRC NLE nursing reviewer summaries from uploaded files. Return plain text only. Use the required section headings exactly and bullet points under every heading. If the material contains multiple topics or subtopics, break them down inside the section bullets instead of flattening them into one short summary. Preserve original constraints, conditions, warnings, contraindications, and limitations from the source. Do not add outside facts that are not supported by the uploaded material. Use Philippine nursing terminology where appropriate. Prefer DOH-aligned guidance for community-health topics and PNDF-aware medication context when relevant. Do not invent country-specific rules, laws, or doses.",
      prompt: `Turn these uploaded nursing notes into a detailed reviewer summary for a Philippine nursing board-review learner.

Requirements:
- audience: nursing student preparing for exams
- goal: understand the attached material clearly, not just shorten it
- approach: abstractive summary, but preserve key technical terms, constraints, conditions, warnings, and limitations from the source
- format: plain text headings with bullet points
- length: substantial reviewer, not a short recap

Use these exact section headings:
Key Concepts
Important Terms
Signs and Symptoms
Nursing Interventions
Patient Teaching
Safety Considerations
Exam Traps
High-Yield PNLE Points

Under each heading, use bullet points only.
If the source contains multiple topics, include topic labels inside the bullets so each topic is clearly separated.
Prioritize clinical reasoning, nursing assessment, intervention, safety, teaching, and board-style traps.

Verification rules:
- do not hallucinate
- do not add personal opinion
- do not remove important context such as "only if", "unless", warnings, or contraindications

Notes to summarize:
${notes}`,
      sourceText: notes,
      maxOutputTokens: 2600,
      attempts: Number(process.env.AI_VALIDATION_ATTEMPTS || 1),
      timeoutMs: Number(process.env.AI_GENERATION_TIMEOUT_MS || 16000),
      logger: console,
    });

    return res.json({ success: true, summary });
  } catch (error) {
    console.error("Gemini summary error:", error);
    return jsonError(res, 500, error.message || "Failed to generate Gemini summary.");
  }
});

app.post("/api/claude/cards", async (req, res) => {
  try {
    const notes = String(req.body?.notes || "").trim();
    const subject = String(req.body?.subject || "Mixed Review");
    const topic = String(req.body?.topic || "").trim();
    const difficulty = String(req.body?.difficulty || "medium");
    const count = Math.max(6, Math.min(24, Number(req.body?.count || 10)));
    const excludeQuestions = Array.isArray(req.body?.excludeQuestions) ? req.body.excludeQuestions.slice(0, 120) : [];
    const context = buildStudyContext({ notes, subject, topic });

    if (!context) {
      return jsonError(res, 400, "Provide notes, a subject, or a topic focus.");
    }

    const client = requireClient();
    if (!client) {
      return res.json({
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

    const systemInstruction =
      `You generate PRC NLE nursing flashcards from notes and topic requests. Create exactly ${count} concise, clinically meaningful, board-focused cards. Respect the requested subject, topic, and difficulty boundaries. Use Philippine nursing terminology where appropriate. When community health or public-health content appears, prefer DOH-aligned guidance. When medication context appears, make the card PNDF-aware when relevant. Do not invent Philippine-specific rules or drug doses when they are not clearly supported by the prompt. Each card must include: a front-side recall prompt only, a correct answer, a short rationale explaining why the answer matters clinically, and a separate key takeaway for board review.`;
    const prompt = [
        "Build nursing study cards for a learner preparing for the Philippine PRC Nurse Licensure Examination.",
        difficultyInstruction,
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
    return res.json({ success: true, cards });
  } catch (error) {
    console.error("Gemini cards error:", error);
    return jsonError(res, 500, error.message || "Failed to generate Gemini study cards.");
  }
});

app.post("/api/claude/quiz", async (req, res) => {
  try {
    const notes = String(req.body?.notes || "").trim();
    const subject = String(req.body?.subject || "Mixed Review");
    const topic = String(req.body?.topic || "").trim();
    const difficulty = String(req.body?.difficulty || "medium");
    const count = Math.max(6, Math.min(20, Number(req.body?.count || 10)));
    const examMode = Boolean(req.body?.examMode);
    const examLength = Math.max(count, Math.min(500, Number(req.body?.examLength || count)));
    const excludeQuestions = Array.isArray(req.body?.excludeQuestions) ? req.body.excludeQuestions.slice(0, 160) : [];
    const context = buildStudyContext({ notes, subject, topic });

    if (!context) {
      return jsonError(res, 400, "Provide notes, a subject, or a topic focus.");
    }

    const client = requireClient();
    if (!client) {
      return res.json({
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
      ? `These questions are one batch inside a ${examLength}-question simulation exam. Make them feel like a realistic long-form board review: broad subject coverage, clinically varied stems, strong prioritization, assessment, intervention, and delegation language, and no repetitive wording. Keep exam mode difficult and PNLE-like. Balance coverage across NP1, NP2, NP3, NP4, and NP5 when possible.`
      : "Make the set feel like a focused PNLE quiz batch with scenario-based stems whenever appropriate.";

    const systemInstruction =
      "You generate PRC NLE-style nursing quiz questions. Every item must be clinically accurate, PNLE-relevant, and structured as JSON only. Use scenario-based nursing stems whenever possible, with prioritization, assessment-vs-intervention, safety, delegation, or patient-teaching reasoning. Each item must have 4-5 distinct plausible options, one best answer for single_choice, and strong rationales. Most items should be single_choice. In simulation exam mode only, you may include a limited number of multiple_response (Select All That Apply) items when clinically appropriate. Respect the requested subject, topic, and difficulty boundaries. Use Philippine nursing terminology where appropriate. Prefer DOH-aligned guidance for community/public-health content and PNDF-aware medication context when drug knowledge is relevant. Do not invent country-specific rules, laws, or medication doses when they are not clearly supported.";
    const prompt = [
      `Generate ${count} nursing quiz questions for a Philippine board-review learner.`,
      difficultyInstruction,
      examInstruction,
      context,
      "Make the questions clinically clear, prioritization-aware, and useful for PRC NLE preparation.",
      "Question quality rules:",
      "- Use 4 plausible answer choices, or 5 only when a SATA item needs it",
      examMode
        ? "- Use mostly single_choice items, but you may include a limited number of multiple_response SATA items when clinically appropriate"
        : "- One best answer only",
      examMode
        ? "- For multiple_response items, set type=multiple_response and provide correctOptionIds for every correct choice. SATA must have at least 2 correct choices and cannot have every option correct"
        : "- Keep these as single_choice items only",
      examMode
        ? "- In simulation mode, spread the batch across the PNLE domains: NP1 foundations/professional practice, NP2 community/maternal/child/family health, and NP3-NP5 physiologic/psychosocial alterations"
        : "",
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
    return res.json({ success: true, questions });
  } catch (error) {
    console.error("Gemini quiz error:", error);
    return jsonError(res, 500, error.message || "Failed to generate Gemini quiz questions.");
  }
});

app.post("/api/claude/review-help", async (req, res) => {
  try {
    const userPrompt = String(req.body?.userPrompt || "").trim();
    const question = String(req.body?.question || "").trim();
    const selectedAnswer = String(req.body?.selectedAnswer || "").trim();
    const correctAnswer = String(req.body?.correctAnswer || "").trim();
    const rationale = String(req.body?.rationale || "").trim();
    const notes = String(req.body?.notes || "").trim();
    const subject = String(req.body?.subject || "Mixed Review");
    const topic = String(req.body?.topic || "").trim();
    const difficulty = String(req.body?.difficulty || "medium");

    if (!userPrompt || !question || !correctAnswer) {
      return jsonError(res, 400, "The wrong-answer review request is incomplete.");
    }

    const client = requireClient();
    if (!client) {
      return res.json({
        success: true,
        fallback: true,
        warning: "Gemini is not configured on this server, so CareDrop prepared a structured fallback explanation.",
        response: buildFallbackReviewHelp({ userPrompt, question, selectedAnswer, correctAnswer, rationale, topic }),
      });
    }

    const response = await generateText(
      client,
      {
        systemInstruction:
          "You are a PRC NLE nursing board exam coach. Answer only in the context of the missed question. First, directly answer the learner's exact typed question in 1 to 2 sentences. Then explain why the correct answer is best, why the learner's chosen answer is weaker, what clue in the question stem points to the right answer, and what high-yield board takeaway to remember. Keep the reply specific to the missed item, easy to understand, and aligned with Philippine nursing terminology where appropriate. Prefer DOH-aligned guidance for community health content and PNDF-aware medication context when relevant. Do not invent country-specific rules or doses.",
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
          "Frame the explanation for a Philippine nursing board-review learner.",
          "Format the answer with these short headings:",
          "1. Direct answer",
          "2. Why your answer was weaker",
          "3. Clue in the question",
          "4. What to remember for boards",
        ]
          .filter(Boolean)
          .join("\n\n"),
        maxOutputTokens: 900,
      },
      Number(process.env.AI_REVIEW_HELP_TIMEOUT_MS || 12000)
    );

    return res.json({
      success: true,
      response:
        response ||
        `Direct answer: ${correctAnswer} is the best answer for this item.\n\nWhy your answer was weaker: ${selectedAnswer || "Your chosen answer"} did not match the strongest nursing priority or teaching point.\n\nClue in the question: Focus on the part of the stem that points toward ${topic || "the core concept"}.\n\nWhat to remember for boards: ${rationale || notes || correctAnswer}`,
    });
  } catch (error) {
    console.error("Gemini review help error:", error);
    return res.json({
      success: true,
      fallback: true,
      warning: "Gemini was temporarily unavailable, so CareDrop prepared a structured fallback explanation.",
      response: buildFallbackReviewHelp({
        userPrompt: req.body?.userPrompt,
        question: req.body?.question,
        selectedAnswer: req.body?.selectedAnswer,
        correctAnswer: req.body?.correctAnswer,
        rationale: req.body?.rationale,
        topic: req.body?.topic,
      }),
    });
  }
});

app.use(express.static(distDir));

app.get("/api/*", (_req, res) => {
  return jsonError(res, 404, "API route not found.");
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }
  return res.sendFile(path.join(distDir, "index.html"));
});

app.use((error, req, res, _next) => {
  console.error("Unhandled server error:", error);

  if (req.path.startsWith("/api/")) {
    return jsonError(res, 500, error.message || "Unexpected server error.");
  }

  return res.status(500).send("Unexpected server error.");
});

app.listen(port, () => {
  console.log(`CareDrop server running on http://localhost:${port}`);
});
