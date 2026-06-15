export const STORAGE_KEY = "sumuquest:data:v1";

export function defaultState() {
  return {
    version: 1,
    settings: { marginCount: 5, allowedAdditionalHours: 2, businessDayStartHour: 4 },
    services: [
      { id: "svc_uber", name: "Uber", baseRewardPerDelivery: 550, deliveriesPerHour: 3.5, enabled: true },
      { id: "svc_demaekan", name: "出前館", baseRewardPerDelivery: 600, deliveriesPerHour: 3, enabled: true },
      { id: "svc_rocketnow", name: "ロケットナウ", baseRewardPerDelivery: 550, deliveriesPerHour: 3, enabled: true },
      { id: "svc_menu", name: "menu", baseRewardPerDelivery: 500, deliveriesPerHour: 2.8, enabled: true }
    ],
    quests: [],
    weeklyPlans: [createDefaultPlan()],
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
    return { state: normalizeState(parsed), recovered: false };
  } catch {
    storage.setItem(`${STORAGE_KEY}:corrupt:${Date.now()}`, raw);
    storage.setItem(STORAGE_KEY, JSON.stringify(fallback));
    return { state: fallback, recovered: true };
  }
}

export function saveState(state, storage = globalThis.localStorage) {
  if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function isValidRoot(value) {
  return value && value.version === 1 && Array.isArray(value.services) && Array.isArray(value.quests) && Array.isArray(value.weeklyPlans);
}

function normalizeState(value) {
  return {
    ...defaultState(),
    ...value,
    settings: { ...defaultState().settings, ...(value.settings || {}) },
    progress: Array.isArray(value.progress) ? value.progress : [],
    templates: Array.isArray(value.templates) ? value.templates : []
  };
}
