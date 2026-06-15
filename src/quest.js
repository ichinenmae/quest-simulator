import { validateSlots } from "./calculation.js";

export const QUEST_KINDS = { period: "期間", time: "時間帯", weather: "荒天", daily: "終日", other: "その他" };
export const DAY_MAP = { MON:"mon", TUE:"tue", WED:"wed", THU:"thu", FRI:"fri", SAT:"sat", SUN:"sun" };
export const PERIOD_DAYS = { MON_THU:["mon","tue","wed","thu"], FRI_SUN:["fri","sat","sun"] };

export function newId(prefix = "quest") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
}

export function normalizeQuest(input, services) {
  const service = services.find(item => item.name.toLowerCase() === String(input.service || "").toLowerCase());
  const kind = String(input.questType || "other").toLowerCase();
  const days = PERIOD_DAYS[input.period] || (DAY_MAP[input.day] ? [DAY_MAP[input.day]] : []);
  return {
    id: input.id || newId(), serviceId: service?.id || "", title: input.title || "名称未設定", kind,
    startDate: input.startDate || null, endDate: input.endDate || null,
    startTime: input.start || null, endTime: input.end || null, daysOfWeek: days,
    milestones: (input.milestones || []).map(item => ({ count:Number(item.count), reward:Number(item.reward) })),
    repeatBonus: input.repeatStart ? { startCount:Number(input.repeatStart), endCount:Number(input.repeatEnd), bonusPerDelivery:Number(input.repeatBonus) } : null,
    selectedGoalCount: null, notes: ""
  };
}

export function questValidation(quest, services) {
  const errors = [], warnings = [];
  if (!Object.hasOwn(QUEST_KINDS, quest.kind)) errors.push("クエスト種別が不明です。");
  if (!services.some(item => item.id === quest.serviceId)) errors.push("サービスを選択してください。");
  if (!quest.title.trim()) errors.push("タイトルを入力してください。");
  if (!quest.milestones.length && !quest.repeatBonus) errors.push("マイルストーンまたは継続ボーナスが必要です。");
  const milestones = quest.milestones;
  milestones.forEach((item, index) => {
    if (!Number.isFinite(item.count) || item.count <= 0 || !Number.isFinite(item.reward) || item.reward < 0) errors.push(`${index + 1}行目の件数・報酬が不正です。`);
    if (index && item.count <= milestones[index - 1].count) errors.push("件数は昇順にしてください。");
    if (index && item.reward < milestones[index - 1].reward) errors.push("累計報酬は減少させられません。");
  });
  if (["time","weather"].includes(quest.kind)) {
    if (!quest.daysOfWeek.length) errors.push("曜日を選択してください。");
    if (!quest.startTime || !quest.endTime) errors.push("開始・終了時刻を入力してください。");
    else errors.push(...validateSlots([{ start:quest.startTime, end:quest.endTime }]));
  }
  if (quest.kind === "period" && !quest.daysOfWeek.length && (!quest.startDate || !quest.endDate)) warnings.push("期間の曜日または日付を設定してください。");
  if (quest.repeatBonus) {
    const r = quest.repeatBonus;
    if (![r.startCount,r.endCount,r.bonusPerDelivery].every(Number.isFinite) || r.startCount <= 0 || r.endCount < r.startCount || r.bonusPerDelivery <= 0) errors.push("継続ボーナス設定が不正です。");
  }
  return { errors:[...new Set(errors)], warnings:[...new Set(warnings)] };
}
