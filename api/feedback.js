import { sendJson, readJsonBody } from "./utils.js";
import { createFeedbackRequest, listFeedbackRequests } from "../server/feedback-utils.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const payload = await listFeedbackRequests();
      return sendJson(res, 200, { success: true, ...payload });
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const created = await createFeedbackRequest({
        type: String(body?.type || "General Feedback"),
        name: String(body?.name || "").trim(),
        message: String(body?.message || "").trim(),
        appContext: String(body?.appContext || "Submitted from CareDrop request modal."),
      });

      return sendJson(res, 200, {
        success: true,
        request: created,
      });
    }

    return sendJson(res, 405, { success: false, error: "Method not allowed." });
  } catch (error) {
    console.error("Feedback API error:", error);
    return sendJson(res, 500, {
      success: false,
      error: error.message || "Failed to process the feedback request.",
    });
  }
}

