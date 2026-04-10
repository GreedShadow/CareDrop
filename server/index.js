import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";

import cors from "cors";
import express from "express";
import multer from "multer";
import { listAdminUsers } from "./admin-analytics.js";
import { buildStudyContext, generateJson, generateText, model, requireClient } from "./ai-utils.js";
import { generateValidatedCards, generateValidatedQuestions } from "./ai-validation.js";
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
    const client = requireClient();
    if (!client) {
      return jsonError(res, 500, "Missing GEMINI_API_KEY in server environment.");
    }

    const notes = String(req.body?.notes || "").trim();
    if (!notes) {
      return jsonError(res, 400, "Notes are required.");
    }

    const summary = await generateText(client, {
      systemInstruction:
        "You create highly detailed PRC NLE nursing reviewer summaries from uploaded files. Return plain text only and do not use markdown symbols like #, ##, ###, *, or **. If the material contains multiple topics or subtopics, break them down into separate topic sections instead of flattening them into one short summary. Use clear section labels, keep each paragraph or bullet focused on one idea, lead with the main point, and preserve original constraints, conditions, warnings, contraindications, and limitations from the source. Do not add outside facts that are not supported by the uploaded material. Use Philippine nursing terminology where appropriate. Prefer DOH-aligned guidance for community-health topics and PNDF-aware medication context when relevant. Do not invent country-specific rules, laws, or doses.",
      prompt: `Turn these uploaded nursing notes into a detailed reviewer summary for a Philippine nursing board-review learner.

Requirements:
- audience: nursing student preparing for exams
- goal: understand the attached material clearly, not just shorten it
- approach: abstractive summary, but preserve key technical terms, constraints, conditions, warnings, and limitations from the source
- format: plain text with headings
- length: substantial reviewer, not a short recap

If the source contains multiple topics, create a separate detailed section for each topic.
Each topic section should include:
- overview
- key review details
- what to assess or monitor
- what to do or prioritize
- conditions, cautions, or limits
- board-style takeaway

Use this structure:
1. Main point
2. Likely subject
3. Topics found
4. Topic-by-topic reviewer sections
5. Final review note

Verification rules:
- do not hallucinate
- do not add personal opinion
- do not remove important context such as "only if", "unless", warnings, or contraindications

Notes to summarize:
${notes}`,
      maxOutputTokens: 2200,
    });

    return res.json({ success: true, summary });
  } catch (error) {
    console.error("Gemini summary error:", error);
    return jsonError(res, 500, error.message || "Failed to generate Gemini summary.");
  }
});

app.post("/api/claude/cards", async (req, res) => {
  try {
    const client = requireClient();
    if (!client) {
      return jsonError(res, 500, "Missing GEMINI_API_KEY in server environment.");
    }

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
    return res.json({ success: true, cards });
  } catch (error) {
    console.error("Gemini cards error:", error);
    return jsonError(res, 500, error.message || "Failed to generate Gemini study cards.");
  }
});

app.post("/api/claude/quiz", async (req, res) => {
  try {
    const client = requireClient();
    if (!client) {
      return jsonError(res, 500, "Missing GEMINI_API_KEY in server environment.");
    }

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

    const difficultyInstruction =
      difficulty === "mixed"
        ? "Use a balanced mix of easy, medium, and hard questions."
        : `Every question must be ${difficulty} difficulty only. Do not mix in other difficulties.`;
    const examInstruction = examMode
      ? `These questions are one batch inside a ${examLength}-question simulation exam. Make them feel like a realistic long-form board review: broad subject coverage, clinically varied stems, strong prioritization language, and no repetitive wording.`
      : "Make the set feel like a focused quiz batch.";

    const systemInstruction =
      "You generate PRC NLE-style nursing multiple-choice quizzes. Each question must have four distinct options, one clearly best answer, and a board-style rationale. Respect the requested subject, topic, and difficulty boundaries. Use Philippine nursing terminology where appropriate. Prefer DOH-aligned guidance for community/public-health content and PNDF-aware medication context when drug knowledge is relevant. Do not invent country-specific rules, laws, or medication doses when they are not clearly supported.";
    const prompt = [
        `Generate ${count} nursing quiz questions for a Philippine board-review learner.`,
        difficultyInstruction,
        examInstruction,
        context,
        "Make the questions clinically clear, prioritization-aware, and useful for PRC NLE preparation.",
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
    return res.json({ success: true, questions });
  } catch (error) {
    console.error("Gemini quiz error:", error);
    return jsonError(res, 500, error.message || "Failed to generate Gemini quiz questions.");
  }
});

app.post("/api/claude/review-help", async (req, res) => {
  try {
    const client = requireClient();
    if (!client) {
      return jsonError(res, 500, "Missing GEMINI_API_KEY in server environment.");
    }

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

    const response = await generateText(client, {
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
    });

    return res.json({
      success: true,
      response:
        response ||
        `Direct answer: ${correctAnswer} is the best answer for this item.\n\nWhy your answer was weaker: ${selectedAnswer || "Your chosen answer"} did not match the strongest nursing priority or teaching point.\n\nClue in the question: Focus on the part of the stem that points toward ${topic || "the core concept"}.\n\nWhat to remember for boards: ${rationale || notes || correctAnswer}`,
    });
  } catch (error) {
    console.error("Gemini review help error:", error);
    return jsonError(res, 500, error.message || "Failed to generate the AI explanation.");
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
