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
        "You create detailed PRC NLE nursing study summaries. Return plain text only. Organize the response with short headings and concise bullets. Include: 1) likely topic or subject, 2) 6 to 10 high-yield review points, 3) what to prioritize or monitor, 4) one short memory aid or recall cue, and 5) a brief board-exam takeaway. Use Philippine nursing terminology where appropriate. Prefer DOH-aligned guidance for community-health topics and PNDF-aware medication context when relevant. Do not invent country-specific rules, laws, or doses.",
      prompt: `Turn these uploaded nursing notes into a more detailed reviewer summary for a Philippine nursing board-review learner. Make it useful for someone who wants to understand the notes, not just skim them:\n\n${notes}`,
      maxOutputTokens: 1100,
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
