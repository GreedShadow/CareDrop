import { GoogleGenAI } from "@google/genai";
import { jsonrepair } from "jsonrepair";

export const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
export const fallbackModels = String(process.env.GEMINI_FALLBACK_MODELS || "gemini-2.5-flash-lite")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean)
  .filter((item) => item !== model);

export function requireClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  return apiKey ? new GoogleGenAI({ apiKey }) : null;
}

export function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableAiError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("503") ||
    message.includes("unavailable") ||
    message.includes("high demand") ||
    message.includes("overloaded") ||
    message.includes("rate limit") ||
    message.includes("quota") ||
    message.includes("timed out") ||
    message.includes("timeout")
  );
}

function normalizeAiError(error) {
  const message = String(error?.message || error || "").trim();
  if (!message) {
    return "The AI service is temporarily unavailable. Please try again.";
  }

  try {
    const parsed = JSON.parse(message);
    return parsed?.error?.message || parsed?.message || message;
  } catch {
    return message;
  }
}

async function generateWithModelFallback(run, timeoutMs) {
  const candidates = [model, ...fallbackModels];
  let lastError = null;
  const attemptsPerModel = Math.max(1, Math.min(2, Number(process.env.AI_MODEL_ATTEMPTS || 1)));

  for (const candidate of candidates) {
    for (let attempt = 0; attempt < attemptsPerModel; attempt += 1) {
      try {
        return await withTimeout(
          run(candidate),
          timeoutMs,
          `The AI request timed out while using ${candidate}. Please try again.`
        );
      } catch (error) {
        lastError = error;
        if (!isRetryableAiError(error)) {
          throw error;
        }

        if (attempt + 1 < attemptsPerModel) {
          await sleep(500);
        }
      }
    }
  }

  throw new Error(normalizeAiError(lastError));
}

export async function generateText(client, { systemInstruction, prompt, maxOutputTokens = 2048 }, timeoutMs = 45000) {
  const response = await generateWithModelFallback(
    (candidateModel) => client.models.generateContent({
      model: candidateModel,
      contents: prompt,
      config: {
        systemInstruction,
        maxOutputTokens,
      },
    }),
    timeoutMs
  );

  return String(response.text || "").trim();
}

export async function generateMultipartText(
  client,
  { systemInstruction, parts, maxOutputTokens = 2048 },
  timeoutMs = 45000
) {
  const response = await generateWithModelFallback(
    (candidateModel) => client.models.generateContent({
      model: candidateModel,
      contents: [
        {
          role: "user",
          parts,
        },
      ],
      config: {
        systemInstruction,
        maxOutputTokens,
      },
    }),
    timeoutMs
  );

  return String(response.text || "").trim();
}

export async function generateJson(
  client,
  { systemInstruction, prompt, schema, maxOutputTokens = 3072 },
  timeoutMs = 45000
) {
  const response = await generateWithModelFallback(
    (candidateModel) => client.models.generateContent({
      model: candidateModel,
      contents: prompt,
      config: {
        systemInstruction,
        maxOutputTokens,
        responseMimeType: "application/json",
        responseJsonSchema: schema,
      },
    }),
    timeoutMs
  );

  const parsed = parseJsonResponse(response.text);
  if (parsed) {
    return parsed;
  }

  const repaired = await generateText(
    client,
    {
      systemInstruction:
        "You repair malformed JSON. Return only valid JSON. Do not add commentary, markdown, or code fences.",
      prompt: `Repair this JSON so it becomes valid JSON and preserves the same structure:\n\n${String(response.text || "").trim()}`,
      maxOutputTokens,
    },
    timeoutMs
  );

  return parseJsonResponse(repaired);
}

export function parseJsonResponse(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    try {
      return JSON.parse(jsonrepair(trimmed));
    } catch {
      const match = trimmed.match(/\{[\s\S]*\}/);
      if (!match) {
        return null;
      }

      try {
        return JSON.parse(match[0]);
      } catch {
        try {
          return JSON.parse(jsonrepair(match[0]));
        } catch {
          return null;
        }
      }
    }
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
