import { sendJson, readJsonBody } from "../utils.js";
import { generateText, model, requireClient } from "../../server/ai-utils.js";

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

    if (!notes) {
      return sendJson(res, 400, { success: false, error: "Notes are required." });
    }

    const summary = await generateText(client, {
      systemInstruction:
        "You create concise PRC NLE nursing study summaries. Return plain text only. Use 5 to 8 numbered lines. Focus on safety, prioritization, assessment, and high-yield recall points. Use Philippine nursing terminology where appropriate. Prefer DOH-aligned guidance for community-health topics and PNDF-aware medication context when relevant. Do not invent country-specific rules or doses.",
      prompt: `Summarize these nursing notes into a quick reviewer for a Philippine nursing board-review learner:\n\n${notes}`,
      maxOutputTokens: 700,
    });

    return sendJson(res, 200, {
      success: true,
      summary,
    });
  } catch (error) {
    console.error("Vercel Gemini summary error:", error);
    return sendJson(res, 500, {
      success: false,
      error: error.message || "Failed to generate Gemini summary.",
    });
  }
}
