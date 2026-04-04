import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";

import Anthropic from "@anthropic-ai/sdk";
import cors from "cors";
import express from "express";
import multer from "multer";
import { extractFileText, SUPPORTED_EXTENSIONS, withTimeout } from "./extract-utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const port = Number(process.env.PORT || 3001);
const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
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

function requireClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  return apiKey ? new Anthropic({ apiKey }) : null;
}

function jsonError(res, status, error, extra = {}) {
  return res.status(status).json({
    success: false,
    error,
    ...extra,
  });
}

function extractTextContent(content) {
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block?.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function parseJsonResponse(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }
    return JSON.parse(match[0]);
  }
}

function buildStudyContext({ notes, subject, topic }) {
  const parts = [];

  if (subject && subject !== "Mixed Review") {
    parts.push(`Subject focus: ${subject}`);
  }
  if (topic) {
    parts.push(`Topic focus: ${topic}`);
  }
  if (notes) {
    parts.push(`Use these uploaded notes as the primary study source:\n${notes}`);
  }

  return parts.join("\n\n").trim();
}

async function callClaude(client, options, timeoutMs = 45000) {
  return withTimeout(client.messages.create(options), timeoutMs, "The AI request timed out. Please try again.");
}

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    ok: true,
    model,
    configured: Boolean(process.env.ANTHROPIC_API_KEY),
  });
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
      return jsonError(res, 500, "Missing ANTHROPIC_API_KEY in server environment.");
    }

    const notes = String(req.body?.notes || "").trim();
    if (!notes) {
      return jsonError(res, 400, "Notes are required.");
    }

    const response = await callClaude(client, {
      model,
      max_tokens: 700,
      system:
        "You create concise nursing study summaries. Return plain text only. Use 5 to 8 numbered lines. Focus on safety, prioritization, assessment, and high-yield recall points.",
      messages: [
        {
          role: "user",
          content: `Summarize these nursing notes into a quick reviewer:\n\n${notes}`,
        },
      ],
    });

    return res.json({ success: true, summary: extractTextContent(response.content) });
  } catch (error) {
    console.error("Claude summary error:", error);
    return jsonError(res, 500, error.message || "Failed to generate Claude summary.");
  }
});

app.post("/api/claude/cards", async (req, res) => {
  try {
    const client = requireClient();
    if (!client) {
      return jsonError(res, 500, "Missing ANTHROPIC_API_KEY in server environment.");
    }

    const notes = String(req.body?.notes || "").trim();
    const subject = String(req.body?.subject || "Mixed Review");
    const topic = String(req.body?.topic || "").trim();
    const count = Math.max(6, Math.min(24, Number(req.body?.count || 10)));
    const excludeQuestions = Array.isArray(req.body?.excludeQuestions) ? req.body.excludeQuestions.slice(0, 120) : [];
    const context = buildStudyContext({ notes, subject, topic });

    if (!context) {
      return jsonError(res, 400, "Provide notes, a subject, or a topic focus.");
    }

    const response = await callClaude(client, {
      model,
      max_tokens: 2200,
      system:
        `You generate nursing flashcards from notes. Return only valid JSON matching this shape: {"cards":[{"subject":"string","difficulty":"easy|medium|hard","question":"string","answer":"string","rationale":"string","notes":"string","topic":"string"}]}. Create exactly ${count} concise, board-focused cards.`,
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
    return res.json({ success: true, cards });
  } catch (error) {
    console.error("Claude cards error:", error);
    return jsonError(res, 500, error.message || "Failed to generate Claude study cards.");
  }
});

app.post("/api/claude/quiz", async (req, res) => {
  try {
    const client = requireClient();
    if (!client) {
      return jsonError(res, 500, "Missing ANTHROPIC_API_KEY in server environment.");
    }

    const notes = String(req.body?.notes || "").trim();
    const subject = String(req.body?.subject || "Mixed Review");
    const topic = String(req.body?.topic || "").trim();
    const difficulty = String(req.body?.difficulty || "medium");
    const count = Math.max(6, Math.min(20, Number(req.body?.count || 10)));
    const excludeQuestions = Array.isArray(req.body?.excludeQuestions) ? req.body.excludeQuestions.slice(0, 160) : [];
    const context = buildStudyContext({ notes, subject, topic });

    if (!context) {
      return jsonError(res, 400, "Provide notes, a subject, or a topic focus.");
    }

    const difficultyInstruction =
      difficulty === "mixed"
        ? "Use a balanced mix of easy, medium, and hard questions."
        : `Every question must be ${difficulty} difficulty only. Do not mix in other difficulties.`;

    const response = await callClaude(client, {
      model,
      max_tokens: 3600,
      system:
        'You generate nursing multiple-choice quizzes. Return only valid JSON matching this shape: {"questions":[{"subject":"string","difficulty":"easy|medium|hard","topic":"string","prompt":"string","correctAnswer":"string","options":["string","string","string","string"],"rationale":"string","notes":"string"}]}. Each question must have four distinct options, one clearly best answer, and board-style rationale.',
      messages: [
        {
          role: "user",
          content: [
            `Generate ${count} nursing quiz questions.`,
            difficultyInstruction,
            context,
            excludeQuestions.length
              ? `Do not repeat or closely paraphrase any of these previous questions:\n- ${excludeQuestions.join("\n- ")}`
              : "Make the questions fresh and not repetitive.",
          ].join("\n\n"),
        },
      ],
    });

    const parsed = parseJsonResponse(extractTextContent(response.content));
    const questions = Array.isArray(parsed?.questions) ? parsed.questions.slice(0, count) : [];
    return res.json({ success: true, questions });
  } catch (error) {
    console.error("Claude quiz error:", error);
    return jsonError(res, 500, error.message || "Failed to generate Claude quiz questions.");
  }
});

app.post("/api/claude/review-help", async (req, res) => {
  try {
    const client = requireClient();
    if (!client) {
      return jsonError(res, 500, "Missing ANTHROPIC_API_KEY in server environment.");
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

    const response = await callClaude(client, {
      model,
      max_tokens: 900,
      system:
        "You are a nursing board exam coach. Answer only in the context of the missed question. Be clear, accurate, exam-focused, and supportive. Explain why the correct answer is best and why the chosen answer is weaker when relevant. Keep the reply concise but helpful.",
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

    return res.json({ success: true, response: extractTextContent(response.content) });
  } catch (error) {
    console.error("Claude review help error:", error);
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
