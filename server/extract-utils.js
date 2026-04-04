import fs from "fs/promises";
import os from "os";
import path from "path";

import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import Tesseract from "tesseract.js";
import WordExtractor from "word-extractor";

const extractor = new WordExtractor();

export const SUPPORTED_EXTENSIONS = new Set([".doc", ".docx", ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".txt"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

export function normalizeExtractedText(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractDocText(buffer) {
  const tempPath = path.join(os.tmpdir(), `caredrop-${Date.now()}-${Math.random().toString(36).slice(2)}.doc`);
  await fs.writeFile(tempPath, buffer);

  try {
    const document = await extractor.extract(tempPath);
    return document.getBody();
  } finally {
    await fs.unlink(tempPath).catch(() => {});
  }
}

export async function extractFileText(file) {
  const extension = path.extname(file.originalname || "").toLowerCase();

  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error("Unsupported file type. Upload a DOC, DOCX, PDF, JPG, JPEG, PNG, WEBP, or TXT file.");
  }

  if (extension === ".txt") {
    return normalizeExtractedText(file.buffer.toString("utf8"));
  }

  if (extension === ".docx") {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return normalizeExtractedText(result.value);
  }

  if (extension === ".doc") {
    const value = await extractDocText(file.buffer);
    return normalizeExtractedText(value);
  }

  if (extension === ".pdf") {
    const parser = new PDFParse({ data: file.buffer });

    try {
      const result = await parser.getText();
      return normalizeExtractedText(result.text);
    } finally {
      await parser.destroy();
    }
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    const result = await withTimeout(
      Tesseract.recognize(file.buffer, "eng", {
        logger: () => {},
      }),
      120000,
      "Image text extraction timed out."
    );

    return normalizeExtractedText(result?.data?.text || "");
  }

  throw new Error("Unsupported file type.");
}
