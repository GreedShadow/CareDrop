import { useEffect, useState } from "react";
import {
  ACCOUNT_STORAGE_KEY,
  ADMIN_EMAILS,
  API_BASE_URL,
  AUTH_SESSION_KEY,
  AUTH_SESSION_MAX_AGE_MS,
  REQUEST_STORAGE_KEY,
  STORAGE_KEY,
} from "./constants";
import { normalize, uniqueBy } from "./helpers";

export function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

export function useWindowWidth() {
  const [width, setWidth] = useState(typeof window === "undefined" ? 1200 : window.innerWidth);

  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      if (frame) {
        return;
      }

      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setWidth(window.innerWidth);
      });
    };

    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, []);

  return width;
}

export function getDateKey(value) {
  const date = value ? new Date(value) : new Date();
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function getStudyStreak(sessions) {
  const uniqueDays = uniqueBy(
    (sessions || [])
      .map((session) => getDateKey(session.createdAt))
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime()),
    (value) => value
  );

  if (!uniqueDays.length) {
    return 0;
  }

  let streak = 0;
  let cursor = new Date();

  while (true) {
    const key = getDateKey(cursor);
    if (!uniqueDays.includes(key)) {
      if (!streak) {
        cursor.setDate(cursor.getDate() - 1);
        const yesterdayKey = getDateKey(cursor);
        if (!uniqueDays.includes(yesterdayKey)) {
          return 0;
        }
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      break;
    }

    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export function getLocalDateLabel(value) {
  if (!value) {
    return "No session yet";
  }

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function getAuthRedirectUrl() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.location.origin;
}

export function normalizeAuthErrorMessage(error, context = "auth") {
  const message = String(error?.message || error || "").toLowerCase();

  if (message.includes("email rate limit exceeded") || message.includes("rate limit")) {
    return context === "reset"
      ? "Too many reset emails were requested recently. Wait a few minutes, then try again once."
      : "Too many verification emails were requested recently. Wait a few minutes before creating another account, then use only the newest email link.";
  }

  if (message.includes("otp_expired") || message.includes("email link is invalid or has expired")) {
    return "That email link is no longer valid. Request a fresh email and open the newest link only once.";
  }

  return error?.message || String(error || "");
}

export function normalizeAiErrorMessage(error) {
  const message = String(error?.message || error || "");
  const lowered = message.toLowerCase();

  if (
    lowered.includes("currently experiencing high demand") ||
    lowered.includes("\"status\":\"unavailable\"") ||
    lowered.includes("\"code\":503") ||
    lowered.includes("service unavailable")
  ) {
    return "Gemini is busy right now. CareDrop will keep using the local review bank while the AI service recovers.";
  }

  return message;
}

export function isAdminEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  return normalized ? ADMIN_EMAILS.includes(normalized) : false;
}

export function buildStudyText(noteText, uploadedText) {
  return [uploadedText, noteText].filter(Boolean).join("\n\n").trim();
}

export function getProgressStorageKey(userId) {
  return userId ? `${STORAGE_KEY}-${userId}` : STORAGE_KEY;
}

export function loadPersisted(userId) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getProgressStorageKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function loadAuthSession() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    if (!parsed) {
      return null;
    }

    const lastAuthenticatedAt = Number(parsed.lastAuthenticatedAt || 0);

    if (lastAuthenticatedAt && Date.now() - lastAuthenticatedAt > AUTH_SESSION_MAX_AGE_MS) {
      clearAuthSession();
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function saveAuthSession(user) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    AUTH_SESSION_KEY,
    JSON.stringify({
      ...user,
      lastAuthenticatedAt: Date.now(),
    })
  );
}

export function clearAuthSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(AUTH_SESSION_KEY);
}

export function loadAccounts() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(ACCOUNT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveAccounts(accounts) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(accounts));
}

export async function hashSecret(value) {
  const encoder = new TextEncoder();
  const digest = await window.crypto.subtle.digest("SHA-256", encoder.encode(String(value || "")));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function getGreeting(name) {
  const hour = new Date().getHours();
  const firstName = String(name || "Nurse").trim().split(/\s+/)[0] || "Nurse";

  if (hour < 12) {
    return `Good morning, ${firstName}.`;
  }

  if (hour < 18) {
    return `Good afternoon, ${firstName}.`;
  }

  return `Good evening, ${firstName}.`;
}

export function mapSupabaseUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Nurse",
    email: user.email || "",
    provider: "supabase",
  };
}

export function loadRequestPersisted() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(REQUEST_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function postJson(path, payload) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 45000);
  let response;

  try {
    response = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    window.clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error("The request timed out. Please try again.");
    }
    throw new Error("Network error. Check the backend connection and try again.");
  }

  window.clearTimeout(timeoutId);

  const rawText = await response.text();
  let data;

  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(
      rawText.includes("<!DOCTYPE") || rawText.startsWith("The page")
        ? "AI server is not returning JSON. If you deployed only the frontend, move the Express backend to Render or set VITE_API_BASE_URL to the live API."
        : "AI returned an invalid response. Please try again."
    );
  }

  if (!response.ok) {
    const errorMessage =
      data?.error?.message ||
      data?.message ||
      data?.error ||
      "AI request failed.";
    throw new Error(normalizeAiErrorMessage(errorMessage));
  }

  return data;
}

export async function getJson(path) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 45000);
  let response;

  try {
    response = await fetch(apiUrl(path), {
      method: "GET",
      signal: controller.signal,
    });
  } catch (error) {
    window.clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error("The request timed out. Please try again.");
    }
    throw new Error("Network error. Check the backend connection and try again.");
  }

  window.clearTimeout(timeoutId);
  const rawText = await response.text();
  let data;

  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error("Server returned an invalid response.");
  }

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

export async function uploadFileForExtraction(file) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 120000);
  const formData = new FormData();
  formData.append("file", file);

  let response;

  try {
    response = await fetch(apiUrl("/api/extract"), {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
  } catch (error) {
    window.clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error("Upload timed out. Please try again.");
    }
    throw new Error("Upload failed. Please check your connection and try again.");
  }

  window.clearTimeout(timeoutId);
  const rawText = await response.text();
  let data;

  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(
      rawText.includes("FUNCTION_INVOCATION_FAILED")
        ? "The upload service crashed on the server. Please retry after the latest deployment finishes."
        : rawText.includes("<!DOCTYPE") || rawText.startsWith("The page")
        ? "Upload service is not returning JSON. Refresh after the new deployment finishes, or confirm /api/extract is deployed."
        : `The upload service returned an invalid response.${rawText ? ` (${rawText.slice(0, 120)})` : ""}`
    );
  }

  if (!response.ok) {
    throw new Error(data.error || "Upload failed.");
  }

  return data;
}

export async function readTextFileLocally(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(String(event.target?.result || ""));
    reader.onerror = () => reject(new Error("The text file could not be read locally."));
    reader.readAsText(file);
  });
}
