import { useEffect, useRef } from "react";

import { AUTH_SESSION_MAX_AGE_MS } from "../caredrop/constants";

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function safeString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function safeMode(value, fallback = "flashcard") {
  if (value === "calendar") {
    return "dashboard";
  }

  return ["dashboard", "flashcard", "quiz", "simulation", "planner", "notes", "history", "admin"].includes(value)
    ? value
    : fallback;
}

export function useInactivityTimeout({ currentUser, clearAuthSession, saveAuthSession, signOutProvider, onExpire }) {
  const inactivityTimeoutRef = useRef(null);
  const lastActivityAtRef = useRef(Date.now());
  const lastActivityPersistedAtRef = useRef(0);
  const signingOutRef = useRef(false);

  useEffect(() => {
    if (!currentUser) {
      signingOutRef.current = false;
      return undefined;
    }

    const expireSession = async () => {
      if (signingOutRef.current) {
        return;
      }

      signingOutRef.current = true;
      await signOutProvider?.();
      clearAuthSession();

      if (inactivityTimeoutRef.current) {
        window.clearTimeout(inactivityTimeoutRef.current);
        inactivityTimeoutRef.current = null;
      }

      onExpire?.();
    };

    const scheduleExpiryCheck = () => {
      if (inactivityTimeoutRef.current) {
        window.clearTimeout(inactivityTimeoutRef.current);
      }

      inactivityTimeoutRef.current = window.setTimeout(() => {
        void expireSession();
      }, AUTH_SESSION_MAX_AGE_MS);
    };

    const markActivity = () => {
      const now = Date.now();
      lastActivityAtRef.current = now;

      if (now - lastActivityPersistedAtRef.current > 10000) {
        saveAuthSession(currentUser);
        lastActivityPersistedAtRef.current = now;
      }

      scheduleExpiryCheck();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        return;
      }

      if (Date.now() - lastActivityAtRef.current >= AUTH_SESSION_MAX_AGE_MS) {
        void expireSession();
        return;
      }

      markActivity();
    };

    const handlePageHide = () => {
      clearAuthSession();
    };

    const activityEvents = ["mousemove", "keydown", "click", "scroll", "touchstart", "mousedown", "focus"];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, markActivity, { passive: true }));
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    markActivity();

    return () => {
      if (inactivityTimeoutRef.current) {
        window.clearTimeout(inactivityTimeoutRef.current);
        inactivityTimeoutRef.current = null;
      }

      activityEvents.forEach((eventName) => window.removeEventListener(eventName, markActivity));
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, [clearAuthSession, currentUser, onExpire, saveAuthSession, signOutProvider]);
}
