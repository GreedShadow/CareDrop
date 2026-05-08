import { fallbackModels, model } from "../server/ai-utils.js";
import { sendJson } from "./utils.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { success: false, error: "Method not allowed." });
  }

  return sendJson(res, 200, {
    success: true,
    ok: true,
    model,
    fallbackModels,
    configured: Boolean(process.env.GEMINI_API_KEY),
  });
}
