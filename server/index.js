import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const port = Number(process.env.PORT || 3001);
const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

const app = express();
app.use(express.json({ limit: "2mb" }));

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  return apiKey ? new Anthropic({ apiKey }) : null;
}

function getText(content) {
  return Array.isArray(content)
    ? content.filter((block) => block?.type === "text").map((block) => block.text).join("\n").trim()
    : "";
}

function parseJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}

function buildContext({ notes, subject, topic }) {
  const parts = [];
  if (subject && subject !== "Mixed Review") parts.push(`Subject focus: ${subject}`);
  if (topic) parts.push(`Topic focus: ${topic}`);
  if (notes) parts.push(`Use these uploaded notes as the primary study source:\n${notes}`);
  return parts.join("\n\n").trim();
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model, configured: Boolean(process.env.ANTHROPIC_API_KEY) });
});

app.post("/api/claude/summary", async (req, res) => {
  try {
    const client = getClient();
    const notes = String(req.body?.notes || "").trim();
    if (!client) return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY in server environment." });
    if (!notes) return res.status(400).json({ error: "Notes are required." });

    const response = await client.messages.create({
      model,
      max_tokens: 700,
      system: "You create concise nursing study summaries. Return plain text only. Use 5 to 8 numbered lines. Focus on safety, prioritization, assessment, and high-yield recall points.",
      messages: [{ role: "user", content: `Summarize these nursing notes into a quick reviewer:\n\n${notes}` }],
    });

    res.json({ summary: getText(response.content) });
  } catch (error) {
    console.error("Claude summary error:", error);
    res.status(500).json({ error: "Failed to generate Claude summary." });
  }
});

app.post("/api/claude/cards", async (req, res) => {
  try {
    const client = getClient();
    if (!client) return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY in server environment." });

    const notes = String(req.body?.notes || "").trim();
    const subject = String(req.body?.subject || "Mixed Review");
    const topic = String(req.body?.topic || "").trim();
    const excludeQuestions = Array.isArray(req.body?.excludeQuestions) ? req.body.excludeQuestions.slice(0, 80) : [];
    const context = buildContext({ notes, subject, topic });
    if (!context) return res.status(400).json({ error: "Provide notes, a subject, or a topic focus." });

    const response = await client.messages.create({
      model,
      max_tokens: 1800,
      system: "You generate nursing flashcards from notes. Return only valid JSON matching this shape: {\"cards\":[{\"subject\":\"string\",\"difficulty\":\"easy|medium|hard\",\"question\":\"string\",\"answer\":\"string\",\"rationale\":\"string\",\"notes\":\"string\"}]}. Create 6 to 10 concise, study-useful cards.",
      messages: [{
        role: "user",
        content: [
          "Build nursing study cards for a learner.",
          context,
          excludeQuestions.length ? `Do not repeat or closely paraphrase these questions:\n- ${excludeQuestions.join("\n- ")}` : "Make the cards fresh and distinct."
        ].join("\n\n")
      }],
    });

    const parsed = parseJson(getText(response.content));
    res.json({ cards: Array.isArray(parsed?.cards) ? parsed.cards : [] });
  } catch (error) {
    console.error("Claude cards error:", error);
    res.status(500).json({ error: "Failed to generate Claude study cards." });
  }
});

app.post("/api/claude/quiz", async (req, res) => {
  try {
    const client = getClient();
    if (!client) return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY in server environment." });

    const notes = String(req.body?.notes || "").trim();
    const subject = String(req.body?.subject || "Mixed Review");
    const topic = String(req.body?.topic || "").trim();
    const difficulty = String(req.body?.difficulty || "medium");
    const count = Math.max(5, Math.min(20, Number(req.body?.count || 20)));
    const excludeQuestions = Array.isArray(req.body?.excludeQuestions) ? req.body.excludeQuestions.slice(0, 120) : [];
    const context = buildContext({ notes, subject, topic });
    if (!context) return res.status(400).json({ error: "Provide notes, a subject, or a topic focus." });

    const response = await client.messages.create({
      model,
      max_tokens: 3200,
      system: "You generate nursing multiple-choice quizzes. Return only valid JSON matching this shape: {\"questions\":[{\"subject\":\"string\",\"difficulty\":\"easy|medium|hard\",\"prompt\":\"string\",\"correctAnswer\":\"string\",\"options\":[\"string\",\"string\",\"string\",\"string\"],\"rationale\":\"string\",\"notes\":\"string\"}]}. Generate exactly the requested number of high-yield questions. Each question must have four distinct options and one clearly best answer.",
      messages: [{
        role: "user",
        content: [
          `Generate ${count} ${difficulty}-difficulty nursing quiz questions.`,
          context,
          excludeQuestions.length ? `Do not repeat or closely paraphrase these questions:\n- ${excludeQuestions.join("\n- ")}` : "Make the questions fresh and not repetitive."
        ].join("\n\n")
      }],
    });

    const parsed = parseJson(getText(response.content));
    res.json({ questions: Array.isArray(parsed?.questions) ? parsed.questions : [] });
  } catch (error) {
    console.error("Claude quiz error:", error);
    res.status(500).json({ error: "Failed to generate Claude quiz questions." });
  }
});

app.use(express.static(distDir));
app.get("*", (req, res, next) => (req.path.startsWith("/api/") ? next() : res.sendFile(path.join(distDir, "index.html"))));
app.listen(port, () => console.log(`CareDrop server running on http://localhost:${port}`));
