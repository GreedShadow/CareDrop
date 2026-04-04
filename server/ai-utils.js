import { GoogleGenAI } from "@google/genai";
import { jsonrepair } from "jsonrepair";

export const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

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

export async function generateText(client, { systemInstruction, prompt, maxOutputTokens = 2048 }, timeoutMs = 45000) {
  const response = await withTimeout(
    client.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        maxOutputTokens,
      },
    }),
    timeoutMs,
    "The AI request timed out. Please try again."
  );

  return String(response.text || "").trim();
}

export async function generateMultipartText(
  client,
  { systemInstruction, parts, maxOutputTokens = 2048 },
  timeoutMs = 45000
) {
  const response = await withTimeout(
    client.models.generateContent({
      model,
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
    timeoutMs,
    "The AI request timed out. Please try again."
  );

  return String(response.text || "").trim();
}

export async function generateJson(
  client,
  { systemInstruction, prompt, schema, maxOutputTokens = 3072 },
  timeoutMs = 45000
) {
  const response = await withTimeout(
    client.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        maxOutputTokens,
        responseMimeType: "application/json",
        responseJsonSchema: schema,
      },
    }),
    timeoutMs,
    "The AI request timed out. Please try again."
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
