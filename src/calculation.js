export const BUSINESS_DAY_START_HOUR = 4;

export function parseTime(value) {
  const text = String(value || "").trim().replace("：", ":");
  let hour;
  let minute;
  const colon = text.match(/^(\d{1,2}):([0-5]\d)$/);
  const compact = text.match(/^(\d{3,4})$/);
  const hourOnly = text.match(/^(\d{1,2})$/);
  if (colon) [, hour, minute] = colon;
  else if (compact) {
    hour = text.slice(0, -2);
    minute = text.slice(-2);
  } else if (hourOnly) {
    hour = hourOnly[1];
    minute = "00";
  } else return null;
  hour = Number(hour);
  minute = Number(minute);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function businessMinute(value, boundaryHour = BUSINESS_DAY_START_HOUR, isEnd = false) {
  const minute = parseTime(value);
  if (minute === null) return null;
  const boundary = boundaryHour * 60;
  if (isEnd && minute === boundary) return 1440;
  return minute < boundary ? minute + 1440 - boundary : minute - boundary;
}

export function slotDurationHours(slot, boundaryHour = BUSINESS_DAY_START_HOUR) {
  const start = businessMinute(slot.start, boundaryHour);
  const end = businessMinute(slot.end, boundaryHour, true);
  if (start === null || end === null || start === end) return NaN;
  if (end <= start) return NaN;
  return (end - start) / 60;
}

export function validateSlots(slots, boundaryHour = BUSINESS_DAY_START_HOUR) {
  const errors = [];
  const ranges = [];
  slots.forEach((slot, index) => {
    const start = businessMinute(slot.start, boundaryHour);
    const end = businessMinute(slot.end, boundaryHour, true);
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
  const slotEnd = businessMinute(slot.end, boundaryHour, true);
  const windowStart = businessMinute(window.start, boundaryHour);
  const windowEnd = businessMinute(window.end, boundaryHour, true);
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

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function predictedQuestDeliveries(quest, plan, service, scopeQuest = null) {
  const rate = Number(service?.deliveriesPerHour || 0);
  return (plan?.workSlots || []).reduce((total, day) => total + predictedQuestDeliveriesForDay(quest, plan, day, service, scopeQuest, rate), 0);
}

export function predictedQuestDeliveriesForDay(quest, plan, day, service, scopeQuest = null, rate = Number(service?.deliveriesPerHour || 0)) {
  if (!day?.enabled || !questIncludesPlanDay(quest, plan, day.day) || (scopeQuest && !questIncludesPlanDay(scopeQuest, plan, day.day))) return 0;
  const stats = dayPlanStats(day, service);
  if (!quest.startTime || !quest.endTime) return stats.deliveries;
  const overlapHours = (day.slots || []).reduce((sum, slot) => sum + slotOverlapHours(slot, { start:quest.startTime, end:quest.endTime }), 0);
  if (day.manualDeliveryCount === null || day.manualDeliveryCount === "" || stats.hours <= 0) return overlapHours * rate;
  return stats.deliveries * (overlapHours / stats.hours);
}

export function questIncludesPlanDay(quest, plan, dayKey) {
  if (quest?.daysOfWeek?.length && !quest.daysOfWeek.includes(dayKey)) return false;
  if (!quest?.startDate && !quest?.endDate) return true;
  const index = DAY_KEYS.indexOf(dayKey);
  const planMonday = parseLocalDate(plan?.weekStartDate);
  if (index < 0 || !planMonday) return false;
  const date = addDays(planMonday, index);
  const start = parseLocalDate(quest.startDate);
  const end = parseLocalDate(quest.endDate);
  return (!start || date >= start) && (!end || date <= end);
}

export function questAppliesToPlanWeek(quest, plan) {
  return DAY_KEYS.some(dayKey => questIncludesPlanDay(quest, plan, dayKey));
}

export function milestoneReward(count, milestones = [], repeatBonus = null) {
  const sorted = [...milestones].sort((a, b) => a.count - b.count);
  let reward = 0;
  for (const item of sorted) if (count >= item.count) reward = item.reward;
  if (repeatBonus && count >= repeatBonus.startCount) {
    const base = sorted.filter(item => item.count < repeatBonus.startCount).at(-1)?.reward || 0;
    const capped = repeatBonus.endCount == null ? Math.floor(count) : Math.min(Math.floor(count), repeatBonus.endCount);
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
    const achievementDeliveries = Math.max(goal.count, predictedDeliveries);
    const requiredHours = rate ? achievementDeliveries / rate : Infinity;
    const additionalDeliveries = Math.max(0, goal.count - predictedDeliveries);
    const additionalHours = rate ? additionalDeliveries / rate : Infinity;
    const relatedRewards = relatedQuests.map(item => ({
      id: item.id,
      title: item.title || "名称未設定",
      reward: milestoneReward(Number(item.predictedCount || 0), item.milestones, item.repeatBonus)
    })).filter(item => item.reward > 0);
    const relatedReward = relatedRewards.reduce((sum, item) => sum + item.reward, 0);
    const revenue = achievementDeliveries * base + goal.reward;
    const totalRevenue = revenue + relatedReward;
    const hourly = Number.isFinite(requiredHours) && requiredHours > 0 ? revenue / requiredHours : 0;
    const totalHourly = Number.isFinite(requiredHours) && requiredHours > 0 ? totalRevenue / requiredHours : 0;
    let judgement = "×";
    if (predictedDeliveries >= goal.count + Number(settings.marginCount ?? 5)) judgement = "◎";
    else if (predictedDeliveries >= goal.count) judgement = "○";
    else if (additionalHours <= Number(settings.allowedAdditionalHours ?? 2)) judgement = "△";
    return { ...goal, achievementDeliveries, requiredHours, predictedDeliveries, additionalDeliveries, additionalHours, revenue, relatedRewards, relatedReward, totalRevenue, hourly, totalHourly, judgement };
  });
}

export function periodGoalBasis(quest, rows) {
  const confirmed = rows.find(row => row.count === Number(quest?.selectedGoalCount));
  if (confirmed) return { row: confirmed, source: "confirmed" };
  const recommended = recommendGoal(rows);
  return recommended ? { row: recommended.row, source: "recommended", level: recommended.level } : null;
}

export function projectedPeriodReward(quest, predictedDeliveries, rows) {
  const basis = periodGoalBasis(quest, rows);
  if (!basis) return { reward: 0, basis: null };
  return { reward: predictedDeliveries >= basis.row.count ? basis.row.reward : 0, basis };
}

export function projectedAdditionalRewards(quests, plan, service) {
  const items = (quests || []).filter(quest => quest.kind !== "period" && quest.serviceId === plan?.serviceId && questAppliesToPlanWeek(quest, plan)).map(quest => {
    const predictedCount = predictedQuestDeliveries(quest, plan, service);
    return {
      id: quest.id,
      title: quest.title || "名称未設定",
      kind: quest.kind,
      predictedCount,
      reward: milestoneReward(predictedCount, quest.milestones, quest.repeatBonus)
    };
  }).filter(item => item.reward > 0);
  return { items, total: items.reduce((sum, item) => sum + item.reward, 0) };
}

export function weeklyPeriodProjections(quests, plan, service, settings = {}) {
  return (quests || []).filter(quest => quest.kind === "period" && quest.serviceId === plan?.serviceId && questAppliesToPlanWeek(quest, plan)).map(period => {
    const deliveries = predictedQuestDeliveries(period, plan, service);
    const rows = periodGoalRows(period, deliveries, service, [], settings);
    return { period, deliveries, rows, ...projectedPeriodReward(period, deliveries, rows) };
  }).filter(item => item.basis);
}

export function questMaximum(quest, selectedPeriodGoal = null) {
  if (quest?.kind === "period" && selectedPeriodGoal) return { count:selectedPeriodGoal.count, reward:selectedPeriodGoal.reward, unlimited:false };
  const highest = [...(quest?.milestones || [])].sort((a,b) => a.count - b.count).at(-1) || { count:0, reward:0 };
  if (!quest?.repeatBonus) return { ...highest, unlimited:false };
  if (quest.repeatBonus.endCount == null) return { count:Math.max(highest.count,quest.repeatBonus.startCount), reward:null, unlimited:true };
  return { count:Math.max(highest.count,quest.repeatBonus.endCount), reward:milestoneReward(quest.repeatBonus.endCount,quest.milestones,quest.repeatBonus), unlimited:false };
}

export function weeklyQuestSummaries(quests, plan, service, settings = {}) {
  const periods = weeklyPeriodProjections(quests,plan,service,settings);
  const periodById = new Map(periods.map(item => [item.period.id,item]));
  return (quests || []).filter(quest => quest.serviceId === plan?.serviceId && questAppliesToPlanWeek(quest,plan)).map(quest => {
    const period = periodById.get(quest.id);
    if (quest.kind === "period" && !period) return null;
    const predictedCount = period ? period.deliveries : predictedQuestDeliveries(quest,plan,service);
    const maximum = questMaximum(quest,period?.basis.row);
    const projectedReward = period ? period.reward : milestoneReward(predictedCount,quest.milestones,quest.repeatBonus);
    const progress = maximum.count > 0 ? predictedCount / maximum.count : 0;
    return { quest, predictedCount, maximum, projectedReward, progress, basis:period?.basis || null };
  }).filter(Boolean);
}

export function weeklyDayForecasts(quests, plan, service, settings = {}) {
  const summaries = weeklyQuestSummaries(quests,plan,service,settings);
  const days = (plan?.workSlots || []).map(day => {
    const stats = dayPlanStats(day,service);
    return { day:day.day, hours:stats.hours, deliveries:stats.deliveries, baseRevenue:stats.deliveries * Number(service?.baseRewardPerDelivery || 0), questRevenue:0 };
  });
  summaries.filter(item => item.projectedReward > 0).forEach(item => {
    const counts = (plan?.workSlots || []).map(day => predictedQuestDeliveriesForDay(item.quest,plan,day,service));
    const total = counts.reduce((sum,count) => sum + count,0);
    if (total <= 0) return;
    counts.forEach((count,index) => { days[index].questRevenue += item.projectedReward * count / total; });
  });
  return days.map(day => ({ ...day, revenue:day.baseRevenue + day.questRevenue }));
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

function parseLocalDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
