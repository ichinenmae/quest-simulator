export const BUSINESS_DAY_START_HOUR = 4;

export function parseTime(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value || "")) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function businessMinute(value, boundaryHour = BUSINESS_DAY_START_HOUR) {
  const minute = parseTime(value);
  if (minute === null) return null;
  const boundary = boundaryHour * 60;
  return minute < boundary ? minute + 1440 - boundary : minute - boundary;
}

export function slotDurationHours(slot, boundaryHour = BUSINESS_DAY_START_HOUR) {
  const start = businessMinute(slot.start, boundaryHour);
  const end = businessMinute(slot.end, boundaryHour);
  if (start === null || end === null || start === end) return NaN;
  if (end <= start) return NaN;
  return (end - start) / 60;
}

export function validateSlots(slots, boundaryHour = BUSINESS_DAY_START_HOUR) {
  const errors = [];
  const ranges = [];
  slots.forEach((slot, index) => {
    const start = businessMinute(slot.start, boundaryHour);
    const end = businessMinute(slot.end, boundaryHour);
    if (start === null || end === null) errors.push(`${index + 1}枠目の時刻形式が不正です。`);
    else if (end <= start) errors.push(`${index + 1}枠目は営業日04:00を越えるか、終了が開始以前です。`);
    else ranges.push({ start, end, index });
  });
  ranges.sort((a, b) => a.start - b.start);
  for (let i = 1; i < ranges.length; i += 1) if (ranges[i].start < ranges[i - 1].end) errors.push(`${ranges[i - 1].index + 1}枠目と${ranges[i].index + 1}枠目が重複しています。`);
  return errors;
}

export function slotOverlapHours(slot, window, boundaryHour = BUSINESS_DAY_START_HOUR) {
  const slotStart = businessMinute(slot.start, boundaryHour);
  const slotEnd = businessMinute(slot.end, boundaryHour);
  const windowStart = businessMinute(window.start, boundaryHour);
  const windowEnd = businessMinute(window.end, boundaryHour);
  if ([slotStart, slotEnd, windowStart, windowEnd].some(value => value === null) || slotEnd <= slotStart || windowEnd <= windowStart) return 0;
  return Math.max(0, Math.min(slotEnd, windowEnd) - Math.max(slotStart, windowStart)) / 60;
}

export function businessDayFor(date, boundaryHour = BUSINESS_DAY_START_HOUR) {
  const result = new Date(date);
  if (result.getHours() < boundaryHour) result.setDate(result.getDate() - 1);
  return result;
}

export function dayPlanStats(dayPlan, service) {
  if (!dayPlan?.enabled) return { hours: 0, deliveries: 0, errors: [] };
  const errors = validateSlots(dayPlan.slots || []);
  const hours = errors.length ? 0 : (dayPlan.slots || []).reduce((sum, slot) => sum + slotDurationHours(slot), 0);
  const automatic = hours * Number(service?.deliveriesPerHour || 0);
  const deliveries = dayPlan.manualDeliveryCount === null || dayPlan.manualDeliveryCount === "" ? automatic : Number(dayPlan.manualDeliveryCount);
  return { hours, deliveries: Number.isFinite(deliveries) ? deliveries : 0, errors };
}

export function planStats(plan, service) {
  const days = (plan?.workSlots || []).map(day => ({ day: day.day, ...dayPlanStats(day, service) }));
  return { days, hours: days.reduce((s, d) => s + d.hours, 0), deliveries: days.reduce((s, d) => s + d.deliveries, 0), valid: days.every(d => !d.errors.length) };
}

export function predictedQuestDeliveries(quest, plan, service) {
  const rate = Number(service?.deliveriesPerHour || 0);
  return (plan?.workSlots || []).filter(day => day.enabled && (!quest.daysOfWeek?.length || quest.daysOfWeek.includes(day.day))).reduce((total, day) => {
    const stats = dayPlanStats(day, service);
    if (!quest.startTime || !quest.endTime) return total + stats.deliveries;
    const overlapHours = (day.slots || []).reduce((sum, slot) => sum + slotOverlapHours(slot, { start:quest.startTime, end:quest.endTime }), 0);
    if (day.manualDeliveryCount === null || day.manualDeliveryCount === "" || stats.hours <= 0) return total + overlapHours * rate;
    return total + stats.deliveries * (overlapHours / stats.hours);
  }, 0);
}

export function milestoneReward(count, milestones = [], repeatBonus = null) {
  const sorted = [...milestones].sort((a, b) => a.count - b.count);
  let reward = 0;
  for (const item of sorted) if (count >= item.count) reward = item.reward;
  if (repeatBonus && count >= repeatBonus.startCount) {
    const base = sorted.filter(item => item.count < repeatBonus.startCount).at(-1)?.reward || 0;
    const capped = Math.min(Math.floor(count), repeatBonus.endCount);
    reward = Math.max(reward, base + (capped - repeatBonus.startCount + 1) * repeatBonus.bonusPerDelivery);
  }
  return reward;
}

export function questMatchesDay(quest, day) {
  return !quest.daysOfWeek?.length || quest.daysOfWeek.includes(day);
}

export function periodGoalRows(quest, predictedDeliveries, service, relatedQuests = [], settings = {}) {
  const rate = Number(service?.deliveriesPerHour || 0);
  const base = Number(service?.baseRewardPerDelivery || 0);
  return [...(quest?.milestones || [])].sort((a,b) => a.count - b.count).map(goal => {
    const requiredHours = rate ? goal.count / rate : Infinity;
    const additionalDeliveries = Math.max(0, goal.count - predictedDeliveries);
    const additionalHours = rate ? additionalDeliveries / rate : Infinity;
    const relatedReward = relatedQuests.reduce((sum, item) => sum + milestoneReward(Number(item.predictedCount || 0), item.milestones, item.repeatBonus), 0);
    const revenue = goal.count * base + goal.reward + relatedReward;
    const hourly = Number.isFinite(requiredHours) && requiredHours > 0 ? revenue / requiredHours : 0;
    let judgement = "×";
    if (predictedDeliveries >= goal.count + Number(settings.marginCount ?? 5)) judgement = "◎";
    else if (predictedDeliveries >= goal.count) judgement = "○";
    else if (additionalHours <= Number(settings.allowedAdditionalHours ?? 2)) judgement = "△";
    return { ...goal, requiredHours, predictedDeliveries, additionalDeliveries, additionalHours, revenue, hourly, judgement };
  });
}

export function recommendGoal(rows) {
  const safe = rows.filter(row => ["◎", "○"].includes(row.judgement));
  if (safe.length) return { row: safe.at(-1), level: "recommended" };
  const stretch = rows.filter(row => row.judgement === "△").sort((a,b) => a.additionalHours - b.additionalHours || b.count - a.count);
  if (stretch.length) return { row: stretch[0], level: "stretch" };
  const fallback = [...rows].sort((a,b) => a.additionalHours - b.additionalHours || a.count - b.count)[0];
  return fallback ? { row: fallback, level: "reference" } : null;
}

export function formatCurrency(value) { return `${Math.round(value || 0).toLocaleString("ja-JP")}円`; }
export function formatNumber(value, digits = 1) { return Number(value || 0).toLocaleString("ja-JP", { maximumFractionDigits: digits }); }
