import { sendJson, readJsonBody } from "../utils.js";
import { generateText, model, requireClient } from "../../server/ai-utils.js";
import { generateValidatedSummary } from "../../server/ai-validation.js";
import { buildFallbackSummary } from "../../server/ai-fallbacks.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { success: false, error: "Method not allowed." });
  }

  let body = {};

  try {
    const client = requireClient();
    if (!client) {
      return sendJson(res, 500, { success: false, error: "Missing GEMINI_API_KEY in server environment." });
    }

    body = await readJsonBody(req);
    const notes = String(body?.notes || "").trim();

    if (!notes) {
      return sendJson(res, 400, { success: false, error: "Notes are required." });
    }

    const summary = await generateValidatedSummary({
      client,
      generateText,
      systemInstruction:
        "You create detailed PRC NLE nursing reviewer summaries from uploaded files. Return plain text only. Use the required section headings exactly and bullet points under every heading. If the material contains multiple topics or subtopics, break them down inside the section bullets instead of flattening them into one short summary. Preserve original constraints, conditions, warnings, contraindications, and limitations from the source. Do not add outside facts that are not supported by the uploaded material. Use Philippine nursing terminology where appropriate. Prefer DOH-aligned guidance for community-health topics and PNDF-aware medication context when relevant. Do not invent country-specific rules, laws, or doses.",
      prompt: `Turn these uploaded nursing notes into a detailed reviewer summary for a Philippine nursing board-review learner.

Requirements:
- audience: nursing student preparing for exams
- goal: understand the attached material clearly, not just shorten it
- approach: abstractive summary, but preserve key technical terms, constraints, conditions, warnings, and limitations from the source
- format: plain text headings with bullet points
- length: substantial reviewer, not a short recap

Use these exact section headings:
Key Concepts
Important Terms
Signs and Symptoms
Nursing Interventions
Patient Teaching
Safety Considerations
Exam Traps
High-Yield PNLE Points

Under each heading, use bullet points only.
If the source contains multiple topics, include topic labels inside the bullets so each topic is clearly separated.
Prioritize clinical reasoning, nursing assessment, intervention, safety, teaching, and board-style traps.

Verification rules:
- do not hallucinate
- do not add personal opinion
- do not remove important context such as "only if", "unless", warnings, or contraindications

Notes to summarize:
${notes}`,
      sourceText: notes,
      maxOutputTokens: 2600,
      logger: console,
    });

    return sendJson(res, 200, {
      success: true,
      summary,
    });
  } catch (error) {
    console.error("Vercel Gemini summary error:", error);
    return sendJson(res, 200, {
      success: true,
      fallback: true,
      warning: "Gemini was temporarily unavailable, so CareDrop prepared a structured reviewer summary from the available text.",
      summary: buildFallbackSummary(body?.notes || ""),
    });
  }
}
