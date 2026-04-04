import { sendJson, readJsonBody } from "../utils.js";
import { callClaude, extractTextContent, model, requireClient } from "../../server/claude-utils.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { success: false, error: "Method not allowed." });
  }

  try {
    const client = requireClient();
    if (!client) {
      return sendJson(res, 500, { success: false, error: "Missing ANTHROPIC_API_KEY in server environment." });
    }

    const body = await readJsonBody(req);
    const notes = String(body?.notes || "").trim();

    if (!notes) {
      return sendJson(res, 400, { success: false, error: "Notes are required." });
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

    return sendJson(res, 200, {
      success: true,
      summary: extractTextContent(response.content),
    });
  } catch (error) {
    console.error("Vercel Claude summary error:", error);
    return sendJson(res, 500, {
      success: false,
      error: error.message || "Failed to generate Claude summary.",
    });
  }
}
