import Anthropic from "@anthropic-ai/sdk";

export const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

export function requireClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  return apiKey ? new Anthropic({ apiKey }) : null;
}

export function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

export async function callClaude(client, options, timeoutMs = 45000) {
  return withTimeout(client.messages.create(options), timeoutMs, "The AI request timed out. Please try again.");
}

export function extractTextContent(content) {
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block?.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export function parseJsonResponse(text) {
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

export function buildStudyContext({ notes, subject, topic }) {
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
