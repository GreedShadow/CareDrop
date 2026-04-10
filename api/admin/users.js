import { sendJson } from "../utils.js";
import { listAdminUsers } from "../../server/admin-analytics.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { success: false, error: "Method not allowed." });
  }

  try {
    const payload = await listAdminUsers();
    return sendJson(res, 200, {
      success: true,
      ...payload,
    });
  } catch (error) {
    console.error("Admin users API error:", error);
    return sendJson(res, 500, {
      success: false,
      error: error.message || "Failed to load admin user analytics.",
    });
  }
}
