import path from "path";

import multer from "multer";

import { extractFileText, SUPPORTED_EXTENSIONS } from "../server/extract-utils.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024,
  },
});

function runMiddleware(req, res, middleware) {
  return new Promise((resolve, reject) => {
    middleware(req, res, (result) => {
      if (result instanceof Error) {
        reject(result);
        return;
      }
      resolve(result);
    });
  });
}

function sendJson(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, {
      success: false,
      error: "Method not allowed.",
    });
  }

  try {
    await runMiddleware(req, res, upload.single("file"));

    if (!req.file) {
      return sendJson(res, 400, {
        success: false,
        error: "No file was uploaded.",
      });
    }

    const extension = path.extname(req.file.originalname || "").toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      return sendJson(res, 400, {
        success: false,
        error: "Unsupported file type. Please upload a DOC, DOCX, PDF, JPG, JPEG, PNG, WEBP, or TXT file.",
      });
    }

    const text = await extractFileText(req.file);
    if (!text) {
      return sendJson(res, 422, {
        success: false,
        error: "We could not read enough text from that file. Try a clearer image or a text-based document.",
      });
    }

    return sendJson(res, 200, {
      success: true,
      fileName: req.file.originalname,
      fileType: extension,
      text,
    });
  } catch (error) {
    console.error("Vercel extract error:", error);
    return sendJson(res, 500, {
      success: false,
      error: error.message || "Failed to extract readable content from the file.",
    });
  }
}
