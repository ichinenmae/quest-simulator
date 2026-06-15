import { loadState, saveState, createDefaultPlan, mondayOf } from "./storage.js";
import { planStats, dayPlanStats, periodGoalRows, recommendGoal, formatCurrency, formatNumber, validateSlots, predictedQuestDeliveries } from "./calculation.js";
import { QUEST_KINDS, questValidation, newId } from "./quest.js";
import { parseAIText } from "./parser.js";
import { automaticQuestTitle, dateRangeFromDays, daysFromDateRange, defaultTimesForKind } from "./quest-form.js";

const DAY_LABELS = { mon:"月", tue:"火", wed:"水", thu:"木", fri:"金", sat:"土", sun:"日" };
const SCREEN_TITLES = { dashboard:"今週の概要", plan:"週間計画", quests:"クエスト入力", goals:"期間クエスト選択", settings:"設定" };
const SAMPLE_TEXT = `QUEST_TYPE: PERIOD
SERVICE: Uber
TITLE: 月〜木 期間クエスト
PERIOD: MON_THU
START_DATE: 2026-06-15
END_DATE: 2026-06-18

60=3160
80=4340
100=5680

---
QUEST_TYPE: TIME
SERVICE: Uber
TITLE: 月曜昼クエスト
DAY: MON
START: 10:00
END: 15:00

3=300
6=600
12=1500`;

let { state, recovered } = loadState();
let currentScreen = "dashboard";
let parsedItems = [];
let manualDraft;
let manualTitleEdited = false;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const activePlan = () => state.weeklyPlans[0] || (state.weeklyPlans[0] = createDefaultPlan());
const activeService = () => state.services.find(item => item.id === activePlan().serviceId) || state.services[0];
manualDraft = createManualDraft();

init();

function init() {
  bindNavigation();
  bindStaticActions();
  renderAll();
  if (recovered) showMessage("保存データが破損していたため、初期状態へ復旧しました。退避データはLocalStorageに残しています。", true);
}

function bindNavigation() {
  $$(".nav-button[data-screen]").forEach(button => button.addEventListener("click", () => showScreen(button.dataset.screen)));
  $$('[data-go]').forEach(button => button.addEventListener("click", () => showScreen(button.dataset.go)));
  $$(".subtab").forEach(button => button.addEventListener("click", () => {
    $$(".subtab").forEach(item => item.classList.toggle("active", item === button));
    $$(".quest-tab").forEach(item => item.classList.toggle("active", item.id === `quest-tab-${button.dataset.questTab}`));
    if (button.dataset.questTab === "list") renderQuestList();
  }));
}

function bindStaticActions() {
  $("#week-start").addEventListener("change", event => { activePlan().weekStartDate = normalizeMonday(event.target.value); activePlan().id = `plan_${activePlan().weekStartDate}`; commit("対象週を保存しました"); renderAll(); });
  $("#plan-service").addEventListener("change", event => { activePlan().serviceId = event.target.value; commit("計画サービスを保存しました"); renderAll(); });
  $("#fill-sample").addEventListener("click", () => { $("#ai-input").value = SAMPLE_TEXT; });
  $("#parse-ai").addEventListener("click", parseInput);
  $("#add-service").addEventListener("click", () => { state.services.push({ id:newId("svc"), name:"新しいサービス", baseRewardPerDelivery:500, deliveriesPerHour:3, enabled:true }); commit("サービスを追加しました"); renderSettings(); });
  $("#save-settings").addEventListener("click", () => { state.settings.marginCount = Math.max(0, Number($("#margin-count").value)); state.settings.allowedAdditionalHours = Math.max(0, Number($("#allowed-hours").value)); commit("判定基準を保存しました"); renderAll(); });
}

function showScreen(name) {
  currentScreen = name;
  $$(".screen").forEach(screen => screen.classList.toggle("active", screen.id === `${name}-screen`));
  $$(".nav-button[data-screen]").forEach(button => button.classList.toggle("active", button.dataset.screen === name));
  $("#screen-title").textContent = SCREEN_TITLES[name];
  window.scrollTo({ top:0, behavior:"smooth" });
  renderAll();
}

function renderAll() {
  renderPlan(); renderManualForm(); renderQuestList(); renderSettings(); renderGoals(); renderDashboard();
}

function commit(message) {
  saveState(state);
  const status = $("#save-status");
  status.textContent = message || "保存済み";
  clearTimeout(commit.timer);
  commit.timer = setTimeout(() => { status.textContent = "保存済み"; }, 1600);
}

function showMessage(message, error = false) {
  const box = $("#global-message");
  box.textContent = message;
  box.className = `message${error ? " error" : ""}`;
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => box.classList.add("hidden"), 5000);
}

function renderPlan() {
  const plan = activePlan();
  const service = activeService();
  $("#week-start").value = plan.weekStartDate;
  $("#plan-service").innerHTML = state.services.filter(item => item.enabled).map(item => `<option value="${esc(item.id)}" ${item.id === plan.serviceId ? "selected" : ""}>${esc(item.name)}</option>`).join("");
  $("#week-days").innerHTML = plan.workSlots.map(day => dayCard(day, service)).join("");
  $$(".day-card").forEach(card => bindDayCard(card));
}

function dayCard(day, service) {
  const stats = dayPlanStats(day, service);
  const slots = day.slots.map((slot,index) => `<div class="slot-row" data-slot="${index}"><label>開始<input class="slot-start" type="time" value="${esc(slot.start)}"></label><span class="separator">〜</span><label>終了<input class="slot-end" type="time" value="${esc(slot.end)}"></label><button class="icon-button remove-slot" aria-label="稼働枠を削除">×</button></div>`).join("");
  return `<article class="day-card ${day.enabled ? "" : "disabled"}" data-day="${day.day}"><div class="day-header"><h3>${DAY_LABELS[day.day]}曜日</h3><label class="switch"><input class="day-enabled" type="checkbox" ${day.enabled ? "checked" : ""}>稼働する</label></div><div class="slot-list">${slots || '<p class="helper">稼働枠がありません。</p>'}</div><button class="secondary-button add-slot" type="button">稼働枠を追加</button><label style="margin-top:12px">予想件数の手動上書き<input class="manual-count" type="number" min="0" step="0.1" placeholder="自動計算" value="${day.manualDeliveryCount ?? ""}"></label>${stats.errors.length ? `<p class="error-text">${stats.errors.map(esc).join("<br>")}</p>` : ""}<div class="day-stats"><span>稼働 <strong>${formatNumber(stats.hours)}h</strong></span><span>予想 <strong>${formatNumber(stats.deliveries)}件</strong></span></div></article>`;
}

function bindDayCard(card) {
  const day = activePlan().workSlots.find(item => item.day === card.dataset.day);
  card.querySelector(".day-enabled").addEventListener("change", event => { day.enabled = event.target.checked; commit(); renderAll(); });
  card.querySelector(".add-slot").addEventListener("click", () => { day.slots.push({ start:"10:00", end:"15:00" }); renderPlan(); });
  card.querySelector(".manual-count").addEventListener("change", event => { day.manualDeliveryCount = event.target.value === "" ? null : Math.max(0, Number(event.target.value)); commit(); renderAll(); });
  card.querySelectorAll(".slot-row").forEach(row => {
    const index = Number(row.dataset.slot);
    row.querySelector(".slot-start").addEventListener("change", event => updateSlot(day,index,"start",event.target.value));
    row.querySelector(".slot-end").addEventListener("change", event => updateSlot(day,index,"end",event.target.value));
    row.querySelector(".remove-slot").addEventListener("click", () => { day.slots.splice(index,1); commit(); renderAll(); });
  });
}

function updateSlot(day, index, key, value) {
  day.slots[index][key] = value;
  const errors = validateSlots(day.slots);
  if (!errors.length) commit("稼働枠を保存しました");
  renderAll();
}

function renderManualForm() {
  const form = $("#manual-quest-form");
  if (form.children.length) manualDraft = readQuestEditorDraft(form);
  form.innerHTML = `${questFields(manualDraft, "manual")}<div class="actions"><button class="primary-button" type="submit">クエストを登録</button></div>`;
  bindQuestEditor(form, "manual");
  bindManualComplements(form);
  form.addEventListener("submit", event => {
    event.preventDefault();
    manualDraft = readQuestEditorDraft(event.currentTarget);
    const quest = readQuestEditor(event.currentTarget);
    const result = questValidation(quest,state.services);
    showEditorIssues(event.currentTarget,result);
    if (result.errors.length) return;
    state.quests.push(quest);
    manualDraft = createManualDraft();
    manualTitleEdited = false;
    commit("クエストを登録しました");
    showMessage("クエストを登録しました。");
    renderAll();
  });
}

function createManualDraft() {
  const times = defaultTimesForKind("period");
  return { id:"manual", serviceId:activeService()?.id || "", title:automaticQuestTitle("period"), kind:"period", startDate:"", endDate:"", ...times, daysOfWeek:[], milestones:[{count:"",reward:""}], repeatBonus:null };
}

function questFields(quest, prefix) {
  return `<div class="form-grid two"><label>サービス<select data-field="serviceId">${state.services.map(item => `<option value="${esc(item.id)}" ${item.id === quest.serviceId ? "selected" : ""}>${esc(item.name)}</option>`).join("")}</select></label><label>種別<select data-field="kind">${Object.entries(QUEST_KINDS).map(([key,label]) => `<option value="${key}" ${key === quest.kind ? "selected" : ""}>${label}</option>`).join("")}</select></label><label>タイトル<input data-field="title" value="${esc(quest.title)}"></label><div><span style="display:block;margin-bottom:6px;color:var(--muted);font-size:.8rem;font-weight:700">対象曜日</span><div class="day-checks">${Object.entries(DAY_LABELS).map(([key,label]) => `<label class="day-check"><input data-field="day" type="checkbox" value="${key}" ${quest.daysOfWeek?.includes(key) ? "checked" : ""}>${label}</label>`).join("")}</div></div><label>開始日<input data-field="startDate" type="date" value="${esc(quest.startDate || "")}"></label><label>終了日<input data-field="endDate" type="date" value="${esc(quest.endDate || "")}"></label><label>開始時刻<input data-field="startTime" type="time" value="${esc(quest.startTime || "")}"></label><label>終了時刻<input data-field="endTime" type="time" value="${esc(quest.endTime || "")}"></label></div>${prefix === "manual" ? `<div class="time-presets ${quest.kind === "time" ? "" : "hidden"}"><span>時間帯プリセット</span><button class="secondary-button time-preset" type="button" data-start="10:00" data-end="15:30">昼 10:00～15:30</button><button class="secondary-button time-preset" type="button" data-start="17:00" data-end="21:30">夜 17:00～21:30</button></div>` : ""}<h3 style="margin-top:18px">マイルストーン</h3><div class="milestone-editor">${quest.milestones.map((item,index) => milestoneRow(item,index)).join("")}</div><button class="secondary-button add-milestone" type="button" style="margin-top:9px">行を追加</button><h3 style="margin-top:18px">継続ボーナス（任意）</h3><div class="form-grid two"><label>開始件数<input data-field="repeatStart" type="number" min="1" value="${quest.repeatBonus?.startCount ?? ""}"></label><label>終了件数<input data-field="repeatEnd" type="number" min="1" value="${quest.repeatBonus?.endCount ?? ""}"></label><label>1件ごとの追加額<input data-field="repeatBonus" type="number" min="0" value="${quest.repeatBonus?.bonusPerDelivery ?? ""}"></label></div><div class="editor-issues"></div>`;
}

function milestoneRow(item,index) { return `<div class="milestone-row" data-index="${index}"><label>件数<input class="milestone-count" type="number" min="1" value="${esc(item.count)}"></label><label>累計報酬<input class="milestone-reward" type="number" min="0" value="${esc(item.reward)}"></label><button class="icon-button remove-milestone" type="button" aria-label="行を削除">×</button></div>`; }

function bindQuestEditor(container) {
  container.querySelector(".add-milestone").addEventListener("click", () => { const editor = container.querySelector(".milestone-editor"); editor.insertAdjacentHTML("beforeend",milestoneRow({count:"",reward:""},editor.children.length)); bindMilestoneRemovers(container); });
  bindMilestoneRemovers(container);
}

function bindManualComplements(container) {
  const field = name => container.querySelector(`[data-field="${name}"]`);
  const selectedDays = () => [...container.querySelectorAll('[data-field="day"]:checked')].map(input => input.value);
  const refreshTitle = () => { if (!manualTitleEdited) field("title").value = automaticQuestTitle(field("kind").value, selectedDays()); };
  field("title").addEventListener("input", () => { manualTitleEdited = field("title").value !== automaticQuestTitle(field("kind").value, selectedDays()); });
  field("kind").addEventListener("change", () => {
    const times = defaultTimesForKind(field("kind").value);
    field("startTime").value = times.startTime;
    field("endTime").value = times.endTime;
    container.querySelector(".time-presets").classList.toggle("hidden", field("kind").value !== "time");
    refreshTitle();
    manualDraft = readQuestEditorDraft(container);
  });
  container.querySelectorAll('[data-field="day"]').forEach(input => input.addEventListener("change", () => {
    const range = dateRangeFromDays(selectedDays(), activePlan().weekStartDate);
    field("startDate").value = range.startDate;
    field("endDate").value = range.endDate;
    refreshTitle();
    manualDraft = readQuestEditorDraft(container);
  }));
  [field("startDate"), field("endDate")].forEach(input => input.addEventListener("change", () => {
    if (field("startDate").value && !field("endDate").value) field("endDate").value = field("startDate").value;
    if (field("endDate").value && !field("startDate").value) field("startDate").value = field("endDate").value;
    const days = daysFromDateRange(field("startDate").value, field("endDate").value);
    container.querySelectorAll('[data-field="day"]').forEach(day => { day.checked = days.includes(day.value); });
    refreshTitle();
    manualDraft = readQuestEditorDraft(container);
  }));
  container.querySelectorAll(".time-preset").forEach(button => button.addEventListener("click", () => {
    field("startTime").value = button.dataset.start;
    field("endTime").value = button.dataset.end;
    manualDraft = readQuestEditorDraft(container);
  }));
  container.addEventListener("input", () => { manualDraft = readQuestEditorDraft(container); });
}
function bindMilestoneRemovers(container) { container.querySelectorAll(".remove-milestone").forEach(button => button.onclick = () => button.closest(".milestone-row").remove()); }

function readQuestEditor(container, existingId = null) {
  const value = field => container.querySelector(`[data-field="${field}"]`)?.value || "";
  const milestones = [...container.querySelectorAll(".milestone-row")].map(row => {
    const count = row.querySelector(".milestone-count").value;
    const reward = row.querySelector(".milestone-reward").value;
    return { count:count === "" ? Number.NaN : Number(count), reward:reward === "" ? Number.NaN : Number(reward) };
  });
  const repeatStart = value("repeatStart");
  const daysOfWeek = [...container.querySelectorAll('[data-field="day"]:checked')].map(input => input.value);
  return { id:existingId || newId(), serviceId:value("serviceId"), title:value("title").trim(), kind:value("kind"), startDate:value("startDate") || null, endDate:value("endDate") || null, startTime:value("startTime") || null, endTime:value("endTime") || null, daysOfWeek, milestones, repeatBonus:repeatStart ? { startCount:Number(repeatStart), endCount:Number(value("repeatEnd")), bonusPerDelivery:Number(value("repeatBonus")) } : null, selectedGoalCount:null, notes:"" };
}

function readQuestEditorDraft(container) {
  const value = field => container.querySelector(`[data-field="${field}"]`)?.value || "";
  const repeatStart = value("repeatStart");
  return {
    id:"manual", serviceId:value("serviceId"), title:value("title"), kind:value("kind"),
    startDate:value("startDate"), endDate:value("endDate"), startTime:value("startTime"), endTime:value("endTime"),
    daysOfWeek:[...container.querySelectorAll('[data-field="day"]:checked')].map(input => input.value),
    milestones:[...container.querySelectorAll(".milestone-row")].map(row => ({ count:row.querySelector(".milestone-count").value, reward:row.querySelector(".milestone-reward").value })),
    repeatBonus:repeatStart ? { startCount:repeatStart, endCount:value("repeatEnd"), bonusPerDelivery:value("repeatBonus") } : null
  };
}

function showEditorIssues(container,result) { container.querySelector(".editor-issues").innerHTML = `${result.errors.length ? `<div class="issue-list error">${result.errors.map(esc).join("<br>")}</div>` : ""}${result.warnings.length ? `<div class="issue-list warning">${result.warnings.map(esc).join("<br>")}</div>` : ""}`; }

function parseInput() {
  const result = parseAIText($("#ai-input").value,state.services);
  if (result.errors.length) { parsedItems=[]; $("#ai-preview").innerHTML = `<div class="issue-list error">${result.errors.map(esc).join("<br>")}</div>`; return; }
  parsedItems = result.items;
  renderPreview();
}

function renderPreview() {
  $("#ai-preview").innerHTML = parsedItems.map((item,index) => `<article class="panel preview-card" data-preview="${index}"><div class="panel-heading"><div><span class="badge">検出 ${index + 1}</span><h2 style="margin-top:8px">登録前プレビュー</h2></div></div>${questFields(item.quest,`preview-${index}`)}${item.errors.length ? `<div class="issue-list error">${item.errors.map(esc).join("<br>")}</div>` : ""}${item.warnings.length ? `<div class="issue-list warning">${item.warnings.map(esc).join("<br>")}</div>` : ""}<div class="actions"><button class="secondary-button cancel-preview" type="button">除外</button><button class="primary-button register-preview" type="button">修正内容を検証して登録</button></div></article>`).join("");
  $$("[data-preview]").forEach(card => {
    bindQuestEditor(card);
    const index = Number(card.dataset.preview);
    card.querySelector(".cancel-preview").addEventListener("click", () => { parsedItems.splice(index,1); renderPreview(); });
    card.querySelector(".register-preview").addEventListener("click", () => { const quest = readQuestEditor(card,parsedItems[index].quest.id); const result = questValidation(quest,state.services); showEditorIssues(card,result); if (result.errors.length) return; state.quests.push(quest); parsedItems.splice(index,1); commit("クエストを登録しました"); showMessage("解析結果からクエストを登録しました。"); renderPreview(); renderAll(); });
  });
}

function renderQuestList() {
  const root = $("#quest-list");
  if (!state.quests.length) { root.innerHTML = '<article class="panel empty">登録済みのクエストはありません。</article>'; return; }
  root.innerHTML = state.quests.map(quest => { const svc = state.services.find(item => item.id === quest.serviceId); return `<article class="panel"><div class="panel-heading"><div><span class="badge">${QUEST_KINDS[quest.kind]}</span><h3 style="margin-top:8px">${esc(quest.title)}</h3><p class="helper">${esc(svc?.name || "不明")} / ${quest.milestones.length}段階</p></div><button class="danger-button delete-quest" data-id="${quest.id}">削除</button></div>${quest.milestones.map(item => `<div class="compact-item"><span>${formatNumber(item.count)}件</span><strong>${formatCurrency(item.reward)}</strong></div>`).join("")}</article>`; }).join("");
  $$(".delete-quest").forEach(button => button.addEventListener("click", () => { state.quests = state.quests.filter(item => item.id !== button.dataset.id); commit("クエストを削除しました"); renderAll(); }));
}

function renderSettings() {
  $("#margin-count").value = state.settings.marginCount;
  $("#allowed-hours").value = state.settings.allowedAdditionalHours;
  $("#service-settings").innerHTML = state.services.map(service => `<div class="service-row" data-service="${service.id}"><label class="wide">サービス名<input data-service-field="name" value="${esc(service.name)}"></label><label>基本報酬/件<input data-service-field="baseRewardPerDelivery" type="number" min="0" value="${service.baseRewardPerDelivery}"></label><label>件数/h<input data-service-field="deliveriesPerHour" type="number" min="0.1" step="0.1" value="${service.deliveriesPerHour}"></label><div class="row-actions"><label class="switch"><input data-service-field="enabled" type="checkbox" ${service.enabled ? "checked" : ""}>有効</label><button class="danger-button remove-service" ${state.services.length <= 1 ? "disabled" : ""}>削除</button></div></div>`).join("");
  $$("[data-service]").forEach(row => {
    const service = state.services.find(item => item.id === row.dataset.service);
    row.querySelectorAll("[data-service-field]").forEach(input => input.addEventListener("change", () => { const key=input.dataset.serviceField; service[key] = key === "enabled" ? input.checked : ["baseRewardPerDelivery","deliveriesPerHour"].includes(key) ? Math.max(0,Number(input.value)) : input.value.trim(); commit("サービス設定を保存しました"); renderAll(); }));
    row.querySelector(".remove-service").addEventListener("click", () => { if (state.quests.some(item => item.serviceId === service.id)) return showMessage("このサービスには登録済みクエストがあるため削除できません。",true); state.services=state.services.filter(item => item.id !== service.id); if (activePlan().serviceId === service.id) activePlan().serviceId=state.services[0].id; commit(); renderAll(); });
  });
}

function periodQuests() { return state.quests.filter(item => item.kind === "period" && item.serviceId === activePlan().serviceId); }

function relatedQuestsWithPredictions(periodQuest) {
  return state.quests.filter(item => item.serviceId===periodQuest.serviceId && item.kind!=="period").map(item => ({ ...item, predictedCount:predictedQuestDeliveries(item,activePlan(),activeService()) }));
}

function renderGoals() {
  const quests = periodQuests();
  const selector = $("#goal-selector");
  if (!quests.length) { selector.innerHTML='<p class="empty">計画サービスの期間クエストを登録してください。</p>'; $("#goal-recommendation").innerHTML=""; $("#goal-table").innerHTML=""; return; }
  const selectedId = selector.querySelector("select")?.value || quests[0].id;
  selector.innerHTML = `<label>対象クエスト<select id="period-quest-select">${quests.map(item => `<option value="${item.id}" ${item.id===selectedId?"selected":""}>${esc(item.title)}</option>`).join("")}</select></label>`;
  $("#period-quest-select").addEventListener("change", renderGoals);
  const quest = quests.find(item => item.id === $("#period-quest-select").value) || quests[0];
  const stats = planStats(activePlan(),activeService());
  const related = relatedQuestsWithPredictions(quest);
  const rows = periodGoalRows(quest,stats.deliveries,activeService(),related,state.settings);
  const recommended = recommendGoal(rows);
  if (!recommended) return;
  const messages = recommended.level === "recommended" ? [`予想${formatNumber(stats.deliveries)}件で達成圏内です。`,`より高い目標は追加稼働または未達リスクがあります。`] : recommended.level === "stretch" ? [`追加${formatNumber(recommended.row.additionalHours)}時間で達成圏内です。`,`計画に追加稼働を組み込める場合の候補です。`] : [`現在の計画では全候補が達成困難です。`,`最も追加時間が少ない目標を参考表示しています。`];
  $("#goal-recommendation").innerHTML = `<article class="panel hero-panel"><div class="recommendation"><p class="eyebrow">${recommended.level === "reference" ? "REFERENCE" : "RECOMMENDED"}</p><div class="big">${recommended.level === "reference" ? "参考: " : "推奨: "}${formatNumber(recommended.row.count)}件</div><ul>${messages.map(item=>`<li>${item}</li>`).join("")}</ul></div></article>`;
  $("#goal-table").innerHTML = `<div class="table-scroll"><table><thead><tr><th>目標</th><th>報酬</th><th>必要時間</th><th>予想件数</th><th>売上</th><th>時給</th><th>追加件数</th><th>追加時間</th><th>判定</th></tr></thead><tbody>${rows.map(row => `<tr class="${row===recommended.row?"recommended":""}"><td>${formatNumber(row.count)}件</td><td>${formatCurrency(row.reward)}</td><td>${formatNumber(row.requiredHours)}h</td><td>${formatNumber(row.predictedDeliveries)}件</td><td>${formatCurrency(row.revenue)}</td><td>${formatCurrency(row.hourly)}/h</td><td>${formatNumber(row.additionalDeliveries)}件</td><td>${formatNumber(row.additionalHours)}h</td><td class="judgement">${row.judgement}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderDashboard() {
  const service = activeService();
  const stats = planStats(activePlan(),service);
  const baseRevenue = stats.deliveries * Number(service?.baseRewardPerDelivery || 0);
  const quests = periodQuests();
  const period = quests[0];
  const rows = period ? periodGoalRows(period,stats.deliveries,service,relatedQuestsWithPredictions(period),state.settings) : [];
  const rec = recommendGoal(rows);
  const questRevenue = rec && stats.deliveries >= rec.row.count ? rec.row.reward : 0;
  const totalRevenue = baseRevenue + questRevenue;
  const hourly = stats.hours ? totalRevenue/stats.hours : 0;
  $("#summary-cards").innerHTML = summaryCard("予想売上",formatCurrency(totalRevenue),`${formatNumber(stats.deliveries)}件`) + summaryCard("予想時給",`${formatCurrency(hourly)}/h`,`${formatNumber(stats.hours)}時間`) + summaryCard("推奨目標",rec?`${formatNumber(rec.row.count)}件`:"未設定",period?.title||"期間クエストなし") + summaryCard("計画サービス",service?.name||"未設定",`営業日 04:00区切り`);
  $("#dashboard-recommendation").innerHTML = rec ? `<div class="recommendation"><div class="big">${formatNumber(rec.row.count)}件 <span class="judgement">${rec.row.judgement}</span></div><p>${esc(period.title)} / 報酬 ${formatCurrency(rec.row.reward)}</p><p>${rec.row.additionalDeliveries ? `追加${formatNumber(rec.row.additionalDeliveries)}件・${formatNumber(rec.row.additionalHours)}時間` : "現在の計画で達成見込み"}</p></div>` : '<p class="empty" style="color:#d5ebe6">期間クエストを登録すると推奨目標を表示します。</p>';
  const max = Math.max(1,...stats.days.map(item=>item.deliveries));
  $("#dashboard-days").innerHTML = stats.days.map(day=>`<div class="bar-row"><span>${DAY_LABELS[day.day]}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100,day.deliveries/max*100)}%"></div></div><strong>${formatNumber(day.deliveries)}件</strong></div>`).join("");
  $("#dashboard-quests").innerHTML = state.quests.length ? state.quests.slice(0,5).map(quest=>`<div class="compact-item"><div><strong>${esc(quest.title)}</strong><p>${esc(state.services.find(item=>item.id===quest.serviceId)?.name||"")} / ${QUEST_KINDS[quest.kind]}</p></div><span class="badge">${quest.milestones.length}段階</span></div>`).join("") : '<p class="empty">クエストはまだ登録されていません。</p>';
}

function summaryCard(label,value,detail) { return `<article class="summary-card"><div class="label">${label}</div><div class="value">${value}</div><div class="detail">${esc(detail)}</div></article>`; }
function normalizeMonday(value) { if (!value) return mondayOf(); const [y,m,d]=value.split("-").map(Number); return mondayOf(new Date(y,m-1,d)); }
function esc(value) { return String(value ?? "").replace(/[&<>"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char])); }
