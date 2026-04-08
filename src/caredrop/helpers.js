export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function normalize(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

export function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function formatTopicHeading(value) {
  return String(value || "General Review")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
