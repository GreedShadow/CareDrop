import fs from "fs/promises";
import os from "os";
import path from "path";
import { generateMultipartText, requireClient, withTimeout } from "./ai-utils.js";

export const SUPPORTED_EXTENSIONS = new Set([".doc", ".docx", ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".txt"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

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
    const { default: WordExtractor } = await import("word-extractor");
    const extractor = new WordExtractor();
    const document = await extractor.extract(tempPath);
    return document.getBody();
  } finally {
    await fs.unlink(tempPath).catch(() => {});
  }
}

async function extractWithGemini(file, instruction) {
  const client = requireClient();
  if (!client) {
    return "";
  }

  return withTimeout(
    generateMultipartText(client, {
      systemInstruction:
        "You extract readable study content from uploaded nursing review files. Return only clean plain text. Preserve medical meaning, headings, and key bullet points. Do not add commentary.",
      parts: [
        { text: instruction },
        {
          inlineData: {
            mimeType: file.mimetype || "application/octet-stream",
            data: file.buffer.toString("base64"),
          },
        },
      ],
      maxOutputTokens: 4096,
    }, 120000),
    125000,
    "File extraction timed out."
  );
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
    const { default: mammoth } = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    const text = normalizeExtractedText(result.value);
    return text || normalizeExtractedText(await extractWithGemini(file, "Extract the text from this DOCX file."));
  }

  if (extension === ".doc") {
    const value = await extractDocText(file.buffer);
    const text = normalizeExtractedText(value);
    return text || normalizeExtractedText(await extractWithGemini(file, "Extract the text from this DOC file."));
  }

  if (extension === ".pdf") {
    const geminiText = normalizeExtractedText(
      await extractWithGemini(
        file,
        "Extract the readable content from this PDF for nursing review. Return plain text only."
      )
    );

    if (geminiText) {
      return geminiText;
    }

    try {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: file.buffer });

      try {
        const result = await parser.getText();
        return normalizeExtractedText(result.text);
      } finally {
        await parser.destroy();
      }
    } catch (error) {
      if (String(error?.message || "").includes("DOMMatrix")) {
        throw new Error(
          "The PDF parser is unavailable in this environment right now. Add GEMINI_API_KEY so PDF extraction can use Gemini instead."
        );
      }
      throw error;
    }
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    const geminiText = normalizeExtractedText(
      await extractWithGemini(
        file,
        "Extract the readable study text from this image. Return plain text only."
      )
    );

    if (geminiText) {
      return geminiText;
    }

    const { default: Tesseract } = await import("tesseract.js");
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
