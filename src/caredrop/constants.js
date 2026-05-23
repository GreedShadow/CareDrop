export const STORAGE_KEY = "caredrop-dashboard-v2";
export const REQUEST_STORAGE_KEY = "caredrop-feedback-v1";
export const AUTH_SESSION_KEY = "caredrop-auth-session-v1";
export const ACCOUNT_STORAGE_KEY = "caredrop-auth-accounts-v1";
export const AUTH_SESSION_MAX_AGE_MS = 1000 * 60 * 10;
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
export const ADMIN_EMAILS = String(import.meta.env.VITE_ADMIN_EMAILS || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
export const FLASHCARD_SET_SIZE = 10;
export const QUIZ_SET_SIZE = 10;
export const SIMULATION_BATCH_SIZE = 20;
export const SIMULATION_FULL_SIZE = 500;
export const SIMULATION_BLOCK_SIZE = 100;
export const SIMULATION_DURATION_MINUTES = 180;
export const RECENT_MEMORY_LIMIT = 12;
export const SUPPORTED_UPLOAD_EXTENSIONS = [".doc", ".docx", ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".txt"];
export const LOGO_SRC = "/favicon.svg";
