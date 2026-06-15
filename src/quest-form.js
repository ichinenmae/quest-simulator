export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS = { mon:"月", tue:"火", wed:"水", thu:"木", fri:"金", sat:"土", sun:"日" };

export function defaultTimesForKind(kind) {
  if (kind === "period") return { startTime:"04:00", endTime:"03:59" };
  if (kind === "time") return { startTime:"10:00", endTime:"15:30" };
  return { startTime:"", endTime:"" };
}

export function daysFromDateRange(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end || end < start) return [];
  const days = new Set();
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    days.add(DAY_KEYS[(cursor.getDay() + 6) % 7]);
  }
  return DAY_KEYS.filter(day => days.has(day));
}

export function dateRangeFromDays(days, weekStartDate) {
  const selectedIndexes = DAY_KEYS.map((day, index) => days.includes(day) ? index : -1).filter(index => index >= 0);
  const monday = parseDate(weekStartDate);
  if (!monday || !selectedIndexes.length) return { startDate:"", endDate:"" };
  return {
    startDate: addDays(monday, Math.min(...selectedIndexes)),
    endDate: addDays(monday, Math.max(...selectedIndexes))
  };
}

export function automaticQuestTitle(kind, days = []) {
  if (kind === "weather") return "荒天クエスト";
  if (kind === "daily") return "終日クエスト";
  if (kind === "other") return "その他クエスト";
  const suffix = kind === "time" ? "時間帯クエスト" : "期間クエスト";
  const indexes = DAY_KEYS.map((day, index) => days.includes(day) ? index : -1).filter(index => index >= 0);
  if (!indexes.length) return suffix;
  const first = DAY_LABELS[DAY_KEYS[Math.min(...indexes)]];
  const last = DAY_LABELS[DAY_KEYS[Math.max(...indexes)]];
  return `${first}${first === last ? "" : `～${last}`}${suffix}`;
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  const year = result.getFullYear();
  const month = String(result.getMonth() + 1).padStart(2, "0");
  const day = String(result.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
