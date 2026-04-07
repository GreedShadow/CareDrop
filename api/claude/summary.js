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
