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
        "You create detailed PRC NLE nursing study summaries for learners who need comprehension, not just compression. Return plain text only. Use clear headings and keep each bullet or paragraph focused on one idea. Lead with the main point of the material instead of burying it. Use explicit transitions where helpful, such as However, Consequently, or In contrast, so the relationship between ideas stays clear. Preserve original constraints, conditions, warnings, and limitations from the source. Do not add outside facts that are not supported by the uploaded material. Use Philippine nursing terminology where appropriate. Prefer DOH-aligned guidance for community-health topics and PNDF-aware medication context when relevant. Do not invent country-specific rules, laws, or doses.",
      prompt: `Turn these uploaded nursing notes into a detailed reviewer summary for a Philippine nursing board-review learner.

Requirements:
- audience: nursing student preparing for exams
- goal: understand the attached material clearly, not just shorten it
- approach: abstractive summary, but preserve key technical terms, constraints, conditions, warnings, and limitations from the source
- format: plain text with headings
- length: substantial reviewer, not a short recap

Use this structure:
1. Main point
2. Likely subject or topic
3. Detailed review points (8 to 12 bullets)
4. What to prioritize, assess, or monitor
5. Conditions, cautions, and limits that should not be dropped
6. Board-style takeaway

Verification rules:
- do not hallucinate
- do not add personal opinion
- do not remove important context such as "only if", "unless", warnings, or contraindications

Notes to summarize:
${notes}`,
      maxOutputTokens: 1400,
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
