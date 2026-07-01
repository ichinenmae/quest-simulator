export const STORAGE_KEY = "sumuquest:data:v1";
export const HISTORY_WEEKS = 5;
export const CORRUPT_BACKUPS_LIMIT = 3;

export function defaultState() {
  const activeWeekStartDate = mondayOf();
  return {
    version: 1,
    activeWeekStartDate,
    settings: { marginCount: 5, allowedAdditionalHours: 2, businessDayStartHour: 4 },
    services: [
      { id: "svc_uber", name: "Uber", baseRewardPerDelivery: 550, deliveriesPerHour: 3.5, enabled: true },
      { id: "svc_demaekan", name: "出前館", baseRewardPerDelivery: 600, deliveriesPerHour: 3, enabled: true },
      { id: "svc_rocketnow", name: "ロケットナウ", baseRewardPerDelivery: 550, deliveriesPerHour: 3, enabled: true },
      { id: "svc_menu", name: "menu", baseRewardPerDelivery: 500, deliveriesPerHour: 2.8, enabled: true }
    ],
    quests: [],
    weeklyPlans: [createDefaultPlan(activeWeekStartDate)],
    progress: [],
    templates: []
  };
}

export function mondayOf(date = new Date()) {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = local.getDay() || 7;
  local.setDate(local.getDate() - day + 1);
  return formatDate(local);
}

export function createDefaultPlan(weekStartDate = mondayOf(), serviceId = "svc_uber") {
  return {
    id: `plan_${weekStartDate}`,
    weekStartDate,
    serviceId,
    workSlots: ["mon","tue","wed","thu","fri","sat","sun"].map(day => ({ day, enabled: day !== "wed", slots: day === "wed" ? [] : [{ start: "10:00", end: "15:00" }], manualDeliveryCount: null }))
  };
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function loadState(storage = globalThis.localStorage) {
  const fallback = defaultState();
  if (!storage) return { state: fallback, recovered: false };
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return { state: fallback, recovered: false };
  try {
    const parsed = JSON.parse(raw);
    if (!isValidRoot(parsed)) throw new Error("Invalid root data");
    return { state: pruneState(normalizeState(parsed)), recovered: false };
  } catch {
    backupCorruptData(raw, storage);
    safeSetItem(STORAGE_KEY, JSON.stringify(fallback), storage);
    return { state: fallback, recovered: true };
  }
}

export function saveState(state, storage = globalThis.localStorage) {
  const result = safeSetItem(STORAGE_KEY, JSON.stringify(pruneState(normalizeState(state))), storage);
  if (!result.ok) return result;
  return { ok: true };
}

export function resetState(storage = globalThis.localStorage) {
  if (!storage) return;
  Object.keys(storage)
    .filter(key => key === STORAGE_KEY || key.startsWith(`${STORAGE_KEY}:corrupt:`))
    .forEach(key => storage.removeItem(key));
}

function isValidRoot(value) {
  return value && value.version === 1 && Array.isArray(value.services) && Array.isArray(value.quests) && Array.isArray(value.weeklyPlans);
}

function normalizeState(value) {
  const base = defaultState();
  const weeklyPlans = normalizePlans(value.weeklyPlans, value.activeWeekStartDate);
  const activeWeekStartDate = value.activeWeekStartDate || weeklyPlans[0]?.weekStartDate || base.activeWeekStartDate;
  return {
    ...base,
    ...value,
    activeWeekStartDate,
    settings: { ...base.settings, ...(value.settings || {}) },
    quests: Array.isArray(value.quests) ? value.quests.map(normalizeQuest) : [],
    weeklyPlans,
    progress: Array.isArray(value.progress) ? value.progress : [],
    templates: Array.isArray(value.templates) ? value.templates : []
  };
}

function normalizePlans(plans, activeWeekStartDate) {
  const basePlan = createDefaultPlan(activeWeekStartDate || mondayOf());
  const source = Array.isArray(plans) && plans.length ? plans : [basePlan];
  const byWeek = new Map();
  source.forEach(plan => {
    if (!plan?.weekStartDate) return;
    byWeek.set(plan.weekStartDate, {
      ...createDefaultPlan(plan.weekStartDate, plan.serviceId || basePlan.serviceId),
      ...plan,
      id: `plan_${plan.weekStartDate}`,
      workSlots: Array.isArray(plan.workSlots) ? plan.workSlots : createDefaultPlan(plan.weekStartDate, plan.serviceId).workSlots
    });
  });
  if (!byWeek.size) byWeek.set(basePlan.weekStartDate, basePlan);
  return [...byWeek.values()].sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));
}

function normalizeQuest(quest) {
  const week = quest.sourceWeekStartDate || weekFromQuest(quest);
  return {
    selectedGoalCount: null,
    selectedGoalConfirmedAt: null,
    createdAt: new Date().toISOString(),
    sourceWeekStartDate: week,
    lastSeenWeekStartDate: week,
    ...quest
  };
}

function pruneState(state) {
  const weeks = retainedWeeks(state);
  const keep = new Set(weeks);
  return {
    ...state,
    weeklyPlans: state.weeklyPlans
      .filter(plan => keep.has(plan.weekStartDate))
      .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate)),
    quests: state.quests.filter(quest => keep.has(quest.sourceWeekStartDate || quest.lastSeenWeekStartDate || weekFromQuest(quest)))
  };
}

function retainedWeeks(state) {
  const weeks = new Set([state.activeWeekStartDate]);
  state.weeklyPlans.forEach(plan => weeks.add(plan.weekStartDate));
  state.quests.forEach(quest => weeks.add(quest.sourceWeekStartDate || quest.lastSeenWeekStartDate || weekFromQuest(quest)));
  return [...weeks].filter(Boolean).sort((a, b) => b.localeCompare(a)).slice(0, HISTORY_WEEKS);
}

function weekFromQuest(quest) {
  return quest?.startDate ? mondayOf(parseLocalDate(quest.startDate) || new Date()) : mondayOf();
}

function parseLocalDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function safeSetItem(key, value, storage) {
  if (!storage) return { ok: true };
  try {
    storage.setItem(key, value);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

function backupCorruptData(raw, storage) {
  safeSetItem(`${STORAGE_KEY}:corrupt:${Date.now()}`, raw, storage);
  const keys = Object.keys(storage)
    .filter(key => key.startsWith(`${STORAGE_KEY}:corrupt:`))
    .sort()
    .reverse();
  keys.slice(CORRUPT_BACKUPS_LIMIT).forEach(key => storage.removeItem(key));
}
