export const PLANNER_EVENT_TYPES = ["Study", "Quiz", "Simulation", "Reminder", "Note"];

export const PLANNER_MODE_OPTIONS = [
  { value: "flashcard", label: "Flashcards" },
  { value: "quiz", label: "Quiz" },
  { value: "simulation", label: "Simulation" },
  { value: "mixed", label: "Mixed Review" },
];

export function getDateInputValue(value = new Date()) {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function formatDateKey(value) {
  return getDateInputValue(value);
}

export function getMonthLabel(value) {
  return new Date(value).toLocaleString([], {
    month: "long",
    year: "numeric",
  });
}

export function shiftMonth(value, delta) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

export function startOfMonth(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function buildCalendarDays(monthValue, events = []) {
  const monthStart = startOfMonth(monthValue);
  const monthIndex = monthStart.getMonth();
  const startDay = new Date(monthStart);
  startDay.setDate(monthStart.getDate() - monthStart.getDay());
  const eventMap = events.reduce((accumulator, event) => {
    const key = formatDateKey(event.date || event.dateKey || event.createdAt || new Date());
    accumulator[key] = accumulator[key] || [];
    accumulator[key].push(event);
    return accumulator;
  }, {});

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDay);
    date.setDate(startDay.getDate() + index);
    const key = formatDateKey(date);
    return {
      key,
      date,
      inMonth: date.getMonth() === monthIndex,
      events: eventMap[key] || [],
    };
  });
}

export function sortByDateAsc(items = [], key = "date") {
  return [...items].sort((left, right) => {
    const leftValue = new Date(left[key] || left.dateKey || left.createdAt || 0).getTime();
    const rightValue = new Date(right[key] || right.dateKey || right.createdAt || 0).getTime();
    return leftValue - rightValue;
  });
}

export function sortByDateDesc(items = [], key = "date") {
  return sortByDateAsc(items, key).reverse();
}

export function getUpcomingEvents(events = [], limit = 5, today = new Date()) {
  const todayKey = formatDateKey(today);
  return sortByDateAsc(events)
    .filter((event) => formatDateKey(event.date || event.dateKey || event.createdAt || today) >= todayKey)
    .slice(0, limit);
}

export function getOverduePlannerItems(items = [], today = new Date()) {
  const todayKey = formatDateKey(today);
  return items.filter((item) => !item.completed && item.dueDate && item.dueDate < todayKey);
}

export function getPlannerCompletionRate(items = []) {
  if (!items.length) {
    return 0;
  }

  const completed = items.filter((item) => item.completed).length;
  return Math.round((completed / items.length) * 100);
}
