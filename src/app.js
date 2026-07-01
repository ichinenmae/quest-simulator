import { loadState, saveState, resetState, createDefaultPlan, mondayOf } from "./storage.js?v=20260615-12";
import { planStats, dayPlanStats, periodGoalRows, recommendGoal, periodGoalBasis, projectedAdditionalRewards, weeklyPeriodProjections, weeklyQuestSummaries, weeklyDayForecasts, questIncludesPlanDay, questMaximum, formatCurrency, formatNumber, validateSlots, predictedQuestDeliveries, parseTime } from "./calculation.js?v=20260615-12";
import { QUEST_KINDS, questValidation, newId } from "./quest.js?v=20260615-12";
import { parseAIText } from "./parser.js?v=20260615-12";
import { automaticQuestTitle, dateRangeFromDays, daysFromDateRange, defaultTimesForKind } from "./quest-form.js?v=20260615-12";

const DAY_LABELS = { mon:"月", tue:"火", wed:"水", thu:"木", fri:"金", sat:"土", sun:"日" };
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const SCREEN_TITLES = { dashboard:"今週の概要", plan:"週間計画", quests:"クエスト入力", goals:"期間クエスト選択", history:"過去クエスト閲覧", settings:"設定" };
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
const GEMINI_URL = "https://gemini.google.com/";
const GEMINI_PROMPT = `添付画像はフードデリバリーサービスのクエスト画面です。
画像をOCRし、SumuQuestへ貼り付けられるAIテキストへ変換してください。

対象サービス: Uber
対象年: [例: 2026。確認できない場合は空欄]

以下のルールを厳守してください。

【出力全体】
- 出力は指定フォーマットのみ。
- 説明、前置き、感想、Markdownのコードフェンス、箇条書きの解説は出力しない。
- 読み取れた情報だけを使う。
- 数字、曜日、年、日付、時刻を推測しない。
- 読めない必須項目は UNKNOWN とする。
- 同じ画面を重複して撮影した画像があっても、同一クエストを重複出力しない。
- 金額から「円」「¥」「+」「,」を除去する。
- 時刻は24時間表記の HH:MM にする。
- 日付は YYYY-MM-DD にする。
- 画像に年がなく、対象年も未指定なら日付は UNKNOWN とする。
- 複数クエストは可能なら --- で区切る。
- --- を出力できない場合でも、各クエストは必ず QUEST_TYPE: から開始する。

【基本形式】
QUEST_TYPE: PERIOD / TIME / WEATHER / DAILY / OTHER
SERVICE: Uber / 出前館 / Wolt / menu / ロケットナウ / UNKNOWN
TITLE: 短い名前
PERIOD: MON_THU / FRI_SUN / UNKNOWN
DAY: MON/TUE/WED/THU/FRI/SAT/SUN/UNKNOWN
START_DATE: YYYY-MM-DD または UNKNOWN
END_DATE: YYYY-MM-DD または UNKNOWN
START: HH:MM または UNKNOWN
END: HH:MM または UNKNOWN

件数=累計報酬
件数=累計報酬

不要な項目は省略してよい。
ただし、TIME / WEATHER / DAILY では DAY、START、END をできるだけ出力する。

【報酬変換】
- SumuQuestの「件数=報酬」は、必ずその件数まで達成したときの累計報酬にする。
- 追加報酬をそのまま出力しない。
- 「+N回」は直前までの累計件数へNを加える。
- 「+金額」は直前までの累計報酬へ加える。
- 画面が最初から累計件数・累計報酬で表示されている場合は、その数値をそのまま使う。
- 件数は昇順で出力する。
- 累計報酬は減少させない。

例:
3回の乗車 350円
+3回の乗車 +450円
+3回の乗車 +600円

出力:
3=350
6=800
9=1400

【無視する情報】
以下は現在のSumuQuest形式に入れない。

- 拒否回数が○回未満
- 完了した配達のみ対象
- 対象エリア
- 対象店舗
- 注意書き
- 説明文
- クエスト選択期限
- 達成条件ではあるが報酬段階ではない文言

ただし、これらを配達件数や報酬として混ぜないこと。

【期間クエスト】
- 月曜日04:00から金曜日04:00は PERIOD: MON_THU とする。
- 金曜日04:00から月曜日04:00は PERIOD: FRI_SUN とする。
- 月曜日04:00から金曜日04:00と表示されている場合、START_DATEは月曜日、END_DATEは木曜日の日付にする。
- 金曜日04:00から月曜日04:00と表示されている場合、START_DATEは金曜日、END_DATEは日曜日の日付にする。
- 「クエスト1」「クエスト2」などの選択候補が並ぶ場合、それぞれを別ブロックにせず、1つのPERIODブロック内の候補行としてまとめる。
- 各候補カードの件数と累計報酬を「件数=累計報酬」として出力する。
- 候補は件数順に並べる。
- 同じ件数の候補が複数ある場合は、確実に対応する報酬が読めるものだけ出力する。
- 件数と報酬の組み合わせを確実に読めない候補は出力しない。
- 推測で補完しない。

【期間クエストの追加段階】
期間クエスト候補のカード内に、追加段階が表示されることがある。

例:
120回 19840円
+10回 +3200円

この場合は、120件候補に加えて、追加後の130件候補も累計に変換して出力する。

出力:
120=19840
130=23040

ルール:
- 鍵アイコン付き、灰色表示、折りたたみ表示でも、同じ候補カード内の追加段階だと確実に判断できる場合は出力する。
- 「+10回」「+金額」の両方が読める場合だけ出力する。
- 「+10回」だけ読めて報酬が読めない場合は出力しない。
- 「+金額」だけ読めて追加件数が読めない場合は出力しない。
- 同じカード内の追加段階か不明な場合は出力しない。
- 追加段階は直前の候補へ加算して、累計件数・累計報酬に変換する。
- 130件、140件などの追加目標を読み落とさないよう確認する。

【時間帯クエスト】
- 1つの日付・時間帯ごとに1ブロック作る。
- 同じ曜日でも昼枠と夜枠は別ブロックにする。
- 通常の時間指定プロモーションは QUEST_TYPE: TIME とする。
- DAY は MON/TUE/WED/THU/FRI/SAT/SUN のいずれかにする。
- START_DATE と END_DATE は同じ日付にする。
- START と END は画面で読める時刻にする。
- 午前10時30分は 10:30、午後5時は 17:00 のように変換する。

【荒天クエスト】
- 画像や説明に「雨」「雪」「悪天候」「荒天」などの条件が明記されている場合だけ QUEST_TYPE: WEATHER とする。
- 単なる時間帯ボーナスを WEATHER にしない。
- 報酬段階は TIME と同じく、件数=累計報酬で出力する。

【終日追加報酬】
- 時間帯が04:00から翌03:59までなど、実質的に終日の条件なら QUEST_TYPE: DAILY とする。
- 「1件ごとに100円」などの場合は、REPEAT_* を使う。
- 上限が不明なら REPEAT_END=UNLIMITED とする。

【継続ボーナス】
一定件数以降、1件ごとに同じ金額が加算されると明記されている場合だけ、以下を使う。

REPEAT_START=開始件数
REPEAT_END=終了件数 または UNLIMITED
REPEAT_BONUS=1件ごとの追加額

注意:
- 段階ごとに追加額が異なる通常クエストを REPEAT_* へ変換しない。
- 「3件、6件、9件」のような段階式は、通常の 件数=累計報酬 として出力する。
- REPEAT_* は、毎件同額加算が明確な場合だけ使う。

【出力例: 期間クエスト】
QUEST_TYPE: PERIOD
SERVICE: Uber
TITLE: 月～木期間クエスト
PERIOD: MON_THU
START_DATE: 2026-06-15
END_DATE: 2026-06-18

10=600
20=1260
30=2040
40=3000
50=4150
60=5540
70=7170
80=9080
90=11280
100=13790
110=16640
120=19840
130=23040

【出力例: 時間帯クエスト】
QUEST_TYPE: TIME
SERVICE: Uber
TITLE: 月昼時間帯クエスト
DAY: MON
START_DATE: 2026-06-15
END_DATE: 2026-06-15
START: 10:30
END: 14:30

3=350
6=800
9=1400

【出力例: 荒天クエスト】
QUEST_TYPE: WEATHER
SERVICE: Uber
TITLE: 月夜荒天クエスト
DAY: MON
START_DATE: 2026-06-15
END_DATE: 2026-06-15
START: 17:00
END: 22:30

1=200
2=300
3=600

REPEAT_START=4
REPEAT_END=20
REPEAT_BONUS=200

【最終確認】
回答前に内部確認し、以下を満たしてから出力する。

- 出力は指定フォーマットだけである
- 説明文を混ぜていない
- 件数が昇順である
- 累計報酬が減少していない
- +N回を累計件数へ変換した
- +金額を累計報酬へ変換した
- 120件+10件などの追加段階を読み落としていない
- 130件などの追加目標を出力できる場合は出力した
- 同じクエストを重複出力していない
- 拒否回数などを配達件数へ混ぜていない
- 読めない値を推測していない`;

let { state, recovered } = loadState();
let currentScreen = "dashboard";
let parsedItems = [];
let manualDraft;
let manualTitleEdited = false;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const activePlan = () => planForWeek(state.activeWeekStartDate);
const activeService = () => state.services.find(item => item.id === activePlan().serviceId) || state.services[0];
manualDraft = createManualDraft();

function planForWeek(weekStartDate) {
  const week = weekStartDate || mondayOf();
  let plan = state.weeklyPlans.find(item => item.weekStartDate === week);
  if (!plan) {
    plan = createDefaultPlan(week, state.weeklyPlans[0]?.serviceId || state.services[0]?.id);
    state.weeklyPlans.unshift(plan);
  }
  return plan;
}

function previousWeekStart(weekStartDate = state.activeWeekStartDate) {
  const [year, month, day] = weekStartDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 7);
  return mondayOf(date);
}

function dateForPlanDay(weekStartDate, dayKey) {
  const index = DAY_KEYS.indexOf(dayKey);
  const [year, month, day] = weekStartDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + Math.max(0, index));
  return formatLocalDate(date);
}

function formatShortDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatWeekRange(weekStartDate) {
  const start = weekStartDate;
  const [year, month, day] = weekStartDate.split("-").map(Number);
  const end = new Date(year, month - 1, day);
  end.setDate(end.getDate() + 6);
  return `${formatShortDate(start)}-${formatShortDate(formatLocalDate(end))}`;
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function cloneDayPlan(day, targetDay = day.day) {
  return {
    day: targetDay,
    enabled: !!day.enabled,
    slots: (day.slots || []).map(slot => ({ ...slot })),
    manualDeliveryCount: day.manualDeliveryCount ?? null
  };
}

function normalizeTimeInput(value) {
  const minute = parseTime(value);
  if (minute === null) return String(value || "").trim();
  const hour = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function pickerTimeValue(value) {
  return parseTime(value) === null ? "" : normalizeTimeInput(value);
}

function crossesBusinessBoundary(slot) {
  const start = parseTime(slot.start);
  const end = parseTime(slot.end);
  if (start === null || end === null) return false;
  return end > 240 && (end <= start || start < 240);
}

function nextPlanDay(dayKey) {
  const index = DAY_KEYS.indexOf(dayKey);
  return DAY_KEYS[(index + 1) % DAY_KEYS.length];
}

function questsForWeek(weekStartDate = state.activeWeekStartDate) {
  return state.quests.filter(quest => (quest.sourceWeekStartDate || weekFromQuest(quest)) === weekStartDate);
}

function visibleQuests() {
  return questsForWeek(state.activeWeekStartDate);
}

function stampQuest(quest) {
  const now = new Date().toISOString();
  return { createdAt:quest.createdAt || now, sourceWeekStartDate:state.activeWeekStartDate, lastSeenWeekStartDate:state.activeWeekStartDate, ...quest };
}

function questCompareKey(quest) {
  const days = (quest.daysOfWeek || []).join(",");
  const time = quest.startTime || quest.endTime ? `${quest.startTime || ""}-${quest.endTime || ""}` : "";
  return [quest.serviceId, quest.kind, days, time].join("|");
}

function maxRewardValue(quest, summary = null) {
  const maximum = summary?.maximum || questMaximumForDisplay(quest);
  return maximum.unlimited ? null : Number(maximum.reward || 0);
}

function questMaximumForDisplay(quest) {
  return questMaximum(quest);
}

function previousQuestSummary(item) {
  const previous = questsForWeek(previousWeekStart()).find(quest => questCompareKey(quest) === questCompareKey(item.quest));
  if (!previous) return null;
  return { quest:previous, reward:maxRewardValue(previous) };
}

function weekFromQuest(quest) {
  return quest?.startDate ? normalizeMonday(quest.startDate) : state.activeWeekStartDate;
}

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
  $("#week-start").addEventListener("change", event => { state.activeWeekStartDate = normalizeMonday(event.target.value); planForWeek(state.activeWeekStartDate); commit("対象週を保存しました"); renderAll(); });
  $("#plan-service").addEventListener("change", event => { activePlan().serviceId = event.target.value; commit("計画サービスを保存しました"); renderAll(); });
  $("#fill-sample").addEventListener("click", () => { $("#ai-input").value = SAMPLE_TEXT; });
  $("#open-gemini").addEventListener("click", openGeminiWithPrompt);
  $("#parse-ai").addEventListener("click", parseInput);
  $("#add-service").addEventListener("click", () => { state.services.push({ id:newId("svc"), name:"新しいサービス", baseRewardPerDelivery:500, deliveriesPerHour:3, enabled:true }); commit("サービスを追加しました"); renderSettings(); });
  $("#save-settings").addEventListener("click", () => { state.settings.marginCount = Math.max(0, Number($("#margin-count").value)); state.settings.allowedAdditionalHours = Math.max(0, Number($("#allowed-hours").value)); commit("判定基準を保存しました"); renderAll(); });
  $("#reset-storage")?.addEventListener("click", resetStorageWithConfirm);
}

async function openGeminiWithPrompt() {
  const geminiTab = window.open("about:blank", "_blank");
  if (geminiTab) geminiTab.opener = null;
  try {
    await copyText(GEMINI_PROMPT);
    showMessage("Gemini用プロンプトをコピーしました。Geminiでスクリーンショットを添付して貼り付けてください。");
  } catch {
    showMessage("プロンプトの自動コピーに失敗しました。ブラウザの権限設定を確認してください。", true);
  }
  if (geminiTab) {
    geminiTab.location.replace(GEMINI_URL);
    return;
  }
  const opened = window.open(GEMINI_URL, "_blank", "noopener");
  if (!opened) showMessage("Geminiを開けませんでした。ポップアップを許可するか、リンクから開いてください。", true);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "");
  helper.style.position = "fixed";
  helper.style.left = "-9999px";
  document.body.appendChild(helper);
  helper.select();
  const succeeded = document.execCommand("copy");
  helper.remove();
  if (!succeeded) throw new Error("copy failed");
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
  renderPlan(); renderManualForm(); renderQuestList(); renderSettings(); renderGoals(); renderHistory(); renderDashboard();
}

function resetStorageWithConfirm() {
  if (!window.confirm("保存データをすべて初期化します。登録済みクエストと稼働予定も削除されます。よろしいですか？")) return;
  if (!window.confirm("本当に初期化しますか？この操作は元に戻せません。")) return;
  resetState();
  location.reload();
}

function commit(message) {
  const result = saveState(state);
  const status = $("#save-status");
  if (result && !result.ok) {
    status.textContent = "保存失敗";
    showMessage("保存容量の上限に達した可能性があります。過去データを整理するか、保存データを初期化してください。", true);
    return;
  }
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

function animateCardExit(element, className, done) {
  if (!element || element.classList.contains("exiting")) return;
  let finished = false;
  const finish = () => { if (finished) return; finished = true; done(); };
  const style = getComputedStyle(element);
  element.style.height = `${element.offsetHeight}px`;
  element.style.marginTop = style.marginTop;
  element.style.marginBottom = style.marginBottom;
  element.style.overflow = "hidden";
  element.classList.add("exiting", className);
  const onTransitionEnd = event => {
    if (event.propertyName !== "height") return;
    element.removeEventListener("transitionend", onTransitionEnd);
    finish();
  };
  element.addEventListener("transitionend", onTransitionEnd);
  requestAnimationFrame(() => {
    element.style.height = "0";
    element.style.marginTop = "0";
    element.style.marginBottom = "0";
    element.style.paddingTop = "0";
    element.style.paddingBottom = "0";
    element.style.borderTopWidth = "0";
    element.style.borderBottomWidth = "0";
  });
  setTimeout(finish, 520);
}

function animateRemoval(element, remove) {
  animateCardExit(element, "removing", remove);
}

function animateRegistration(element, done) {
  animateCardExit(element, "registered", done);
}

function animateCardExitPromise(element, className) {
  return new Promise(resolve => animateCardExit(element, className, resolve));
}

function selectedIndexes(selector) {
  return $$(selector).filter(input => input.checked).map(input => Number(input.closest("[data-preview]")?.dataset.preview)).filter(Number.isInteger);
}

function selectedQuestIds() {
  return $$(".quest-select").filter(input => input.checked).map(input => input.value);
}

function renderPlan() {
  const plan = activePlan();
  const service = activeService();
  $("#week-start").value = plan.weekStartDate;
  $("#plan-service").innerHTML = state.services.filter(item => item.enabled).map(item => `<option value="${esc(item.id)}" ${item.id === plan.serviceId ? "selected" : ""}>${esc(item.name)}</option>`).join("");
  $("#week-status").innerHTML = plan.weekStartDate < mondayOf() ? `<div class="week-alert">過去の週を表示中です。${esc(formatWeekRange(plan.weekStartDate))} の予定を編集しています。</div>` : "";
  renderPlanCopyTools();
  $("#week-days").innerHTML = plan.workSlots.map(day => dayCard(day, service, plan.weekStartDate)).join("");
  $$(".day-card").forEach(card => bindDayCard(card));
}

function dayCard(day, service, weekStartDate) {
  const stats = dayPlanStats(day, service);
  const slots = day.slots.map((slot,index) => `<div class="slot-row" data-slot="${index}"><label>開始<div class="time-input-pair"><input class="slot-start" type="text" inputmode="numeric" autocomplete="off" placeholder="10:00" value="${esc(slot.start)}"><input class="slot-picker slot-start-picker" type="time" value="${esc(pickerTimeValue(slot.start))}" aria-label="開始時刻を選択"></div></label><span class="separator">〜</span><label>終了<div class="time-input-pair"><input class="slot-end" type="text" inputmode="numeric" autocomplete="off" placeholder="15:00" value="${esc(slot.end)}"><input class="slot-picker slot-end-picker" type="time" value="${esc(pickerTimeValue(slot.end))}" aria-label="終了時刻を選択"></div></label><button class="icon-button remove-slot" aria-label="稼働枠を削除">×</button></div>`).join("");
  const date = dateForPlanDay(weekStartDate, day.day);
  return `<article class="day-card ${day.enabled ? "" : "disabled"}" data-day="${day.day}"><div class="day-header"><div><h3>${DAY_LABELS[day.day]}曜日 <span>${formatShortDate(date)}</span></h3><p>${esc(date)}</p></div><label class="switch"><input class="day-enabled" type="checkbox" ${day.enabled ? "checked" : ""}>稼働する</label></div><div class="slot-list">${slots || '<p class="helper">稼働枠がありません。</p>'}</div><button class="secondary-button add-slot" type="button">稼働枠を追加</button><label style="margin-top:12px">予想件数の手動上書き<input class="manual-count" type="number" min="0" step="0.1" placeholder="自動計算" value="${day.manualDeliveryCount ?? ""}"></label>${stats.errors.length ? `<p class="error-text">${stats.errors.map(esc).join("<br>")}</p>` : ""}<div class="day-stats"><span>稼働 <strong>${formatNumber(stats.hours)}h</strong></span><span>予想 <strong>${formatNumber(stats.deliveries)}件</strong></span></div></article>`;
}

function renderPlanCopyTools() {
  const root = $("#plan-copy-tools");
  if (!root) return;
  const sourcePlans = state.weeklyPlans
    .filter(plan => plan.weekStartDate !== state.activeWeekStartDate)
    .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));
  if (!sourcePlans.length) {
    root.innerHTML = '<p class="empty">コピーできる過去の稼働予定はまだありません。</p>';
    return;
  }
  const weekOptions = sourcePlans.map(plan => `<option value="${esc(plan.weekStartDate)}">${esc(plan.weekStartDate)}（${esc(formatWeekRange(plan.weekStartDate))}）</option>`).join("");
  const dayOptions = DAY_KEYS.map(day => `<option value="${day}">${DAY_LABELS[day]}曜日 ${formatShortDate(dateForPlanDay(state.activeWeekStartDate, day))}</option>`).join("");
  root.innerHTML = `<div class="copy-tool-grid"><div class="copy-tool"><h3>1週間分コピー</h3><label>コピー元の週<select id="copy-week-source">${weekOptions}</select></label><button id="copy-week-plan" class="primary-button" type="button">この週へ1週間分コピー</button></div><div class="copy-tool"><h3>1日分コピー</h3><div class="form-grid two"><label>コピー元の週<select id="copy-day-week">${weekOptions}</select></label><label>コピー元の日<select id="copy-day-source">${DAY_KEYS.map(day => `<option value="${day}">${DAY_LABELS[day]}曜日</option>`).join("")}</select></label><label>コピー先の日<select id="copy-day-target">${dayOptions}</select></label></div><button id="copy-day-plan" class="secondary-button" type="button">指定した1日へコピー</button></div></div>`;
  $("#copy-week-plan").addEventListener("click", copyWeekPlan);
  $("#copy-day-plan").addEventListener("click", copyDayPlan);
}

function copyWeekPlan() {
  const sourceWeek = $("#copy-week-source")?.value;
  const source = state.weeklyPlans.find(plan => plan.weekStartDate === sourceWeek);
  if (!source) return showMessage("コピー元の週が見つかりません。", true);
  if (!window.confirm(`${source.weekStartDate} の1週間分を ${activePlan().weekStartDate} へコピーします。現在の稼働予定は置き換わります。よろしいですか？`)) return;
  activePlan().workSlots = DAY_KEYS.map(day => cloneDayPlan(source.workSlots.find(item => item.day === day) || { day, enabled:false, slots:[], manualDeliveryCount:null }, day));
  commit("1週間分の稼働予定をコピーしました");
  showMessage("1週間分の稼働予定をコピーしました。");
  renderAll();
}

function copyDayPlan() {
  const sourceWeek = $("#copy-day-week")?.value;
  const sourceDay = $("#copy-day-source")?.value;
  const targetDay = $("#copy-day-target")?.value;
  const source = state.weeklyPlans.find(plan => plan.weekStartDate === sourceWeek);
  const sourceSlot = source?.workSlots.find(day => day.day === sourceDay);
  const targetIndex = activePlan().workSlots.findIndex(day => day.day === targetDay);
  if (!sourceSlot || targetIndex < 0) return showMessage("コピー元またはコピー先の日が見つかりません。", true);
  if (!window.confirm(`${source.weekStartDate} の${DAY_LABELS[sourceDay]}曜日を ${formatShortDate(dateForPlanDay(activePlan().weekStartDate,targetDay))} ${DAY_LABELS[targetDay]}曜日へコピーします。コピー先の日の予定は置き換わります。よろしいですか？`)) return;
  activePlan().workSlots[targetIndex] = cloneDayPlan(sourceSlot, targetDay);
  commit("1日分の稼働予定をコピーしました");
  showMessage("1日分の稼働予定をコピーしました。");
  renderAll();
}

function bindDayCard(card) {
  const day = activePlan().workSlots.find(item => item.day === card.dataset.day);
  card.querySelector(".day-enabled").addEventListener("change", event => { day.enabled = event.target.checked; commit(); renderAll(); });
  card.querySelector(".add-slot").addEventListener("click", () => { day.slots.push({ start:"10:00", end:"15:00" }); renderPlan(); });
  card.querySelector(".manual-count").addEventListener("change", event => { day.manualDeliveryCount = event.target.value === "" ? null : Math.max(0, Number(event.target.value)); commit(); renderAll(); });
  card.querySelectorAll(".slot-row").forEach(row => {
    const index = Number(row.dataset.slot);
    const bindTimeText = (selector, key) => {
      const input = row.querySelector(selector);
      input.addEventListener("blur", event => updateSlot(day,index,key,event.target.value));
      input.addEventListener("keydown", event => { if (event.key === "Enter") event.currentTarget.blur(); });
    };
    bindTimeText(".slot-start", "start");
    bindTimeText(".slot-end", "end");
    row.querySelector(".slot-start-picker").addEventListener("change", event => updateSlot(day,index,"start",event.target.value));
    row.querySelector(".slot-end-picker").addEventListener("change", event => updateSlot(day,index,"end",event.target.value));
    row.querySelector(".remove-slot").addEventListener("click", () => animateRemoval(row, () => { day.slots.splice(index,1); commit(); renderAll(); }));
  });
}

function updateSlot(day, index, key, value) {
  day.slots[index][key] = normalizeTimeInput(value);
  if (crossesBusinessBoundary(day.slots[index])) {
    const targetKey = nextPlanDay(day.day);
    const target = activePlan().workSlots.find(item => item.day === targetKey);
    if (target && window.confirm(`${DAY_LABELS[day.day]}曜日の ${day.slots[index].start}-${day.slots[index].end} は04:00をまたぎます。${DAY_LABELS[targetKey]}曜日へ移動しますか？`)) {
      const [slot] = day.slots.splice(index, 1);
      target.enabled = true;
      target.slots.push(slot);
      commit("04:00をまたぐ稼働枠を翌日に移動しました");
      showMessage("04:00をまたぐ稼働枠を翌日に移動しました。");
      renderAll();
      return;
    }
  }
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
    state.quests.push(stampQuest(quest));
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
  return `<div class="form-grid two"><label>サービス<select data-field="serviceId">${state.services.map(item => `<option value="${esc(item.id)}" ${item.id === quest.serviceId ? "selected" : ""}>${esc(item.name)}</option>`).join("")}</select></label><label>種別<select data-field="kind">${Object.entries(QUEST_KINDS).map(([key,label]) => `<option value="${key}" ${key === quest.kind ? "selected" : ""}>${label}</option>`).join("")}</select></label><label>タイトル<input data-field="title" value="${esc(quest.title)}"></label><div><span style="display:block;margin-bottom:6px;color:var(--muted);font-size:.8rem;font-weight:700">対象曜日</span><div class="day-checks">${Object.entries(DAY_LABELS).map(([key,label]) => `<label class="day-check"><input data-field="day" type="checkbox" value="${key}" ${quest.daysOfWeek?.includes(key) ? "checked" : ""}>${label}</label>`).join("")}</div></div><label>開始日<input data-field="startDate" type="date" value="${esc(quest.startDate || "")}"></label><label>終了日<input data-field="endDate" type="date" value="${esc(quest.endDate || "")}"></label><label>開始時刻<input data-field="startTime" type="time" value="${esc(quest.startTime || "")}"></label><label>終了時刻<input data-field="endTime" type="time" value="${esc(quest.endTime || "")}"></label></div>${prefix === "manual" ? `<div class="time-presets ${quest.kind === "time" ? "" : "hidden"}"><span>時間帯プリセット</span><button class="secondary-button time-preset" type="button" data-start="10:00" data-end="15:30">昼 10:00～15:30</button><button class="secondary-button time-preset" type="button" data-start="17:00" data-end="21:30">夜 17:00～21:30</button></div>` : ""}<h3 style="margin-top:18px">マイルストーン</h3><div class="milestone-editor">${quest.milestones.map((item,index) => milestoneRow(item,index)).join("")}</div><button class="secondary-button add-milestone" type="button" style="margin-top:9px">行を追加</button><h3 style="margin-top:18px">継続ボーナス（任意）</h3><div class="form-grid two"><label>開始件数<input data-field="repeatStart" type="number" min="1" value="${quest.repeatBonus?.startCount ?? ""}"></label><label>終了件数<input data-field="repeatEnd" type="number" min="1" value="${quest.repeatBonus?.endCount ?? ""}" ${quest.repeatBonus?.endCount == null && quest.repeatBonus ? "disabled" : ""}></label><label class="unlimited-toggle"><input data-field="repeatUnlimited" type="checkbox" ${quest.repeatBonus?.endCount == null && quest.repeatBonus ? "checked" : ""}>上限なし</label><label>1件ごとの追加額<input data-field="repeatBonus" type="number" min="0" value="${quest.repeatBonus?.bonusPerDelivery ?? ""}"></label></div><div class="editor-issues"></div>`;
}

function milestoneRow(item,index) { return `<div class="milestone-row" data-index="${index}"><label>件数<input class="milestone-count" type="number" min="1" value="${esc(item.count)}"></label><label>累計報酬<input class="milestone-reward" type="number" min="0" value="${esc(item.reward)}"></label><button class="icon-button remove-milestone" type="button" aria-label="行を削除">×</button></div>`; }

function bindQuestEditor(container) {
  container.querySelector(".add-milestone").addEventListener("click", () => { const editor = container.querySelector(".milestone-editor"); editor.insertAdjacentHTML("beforeend",milestoneRow({count:"",reward:""},editor.children.length)); bindMilestoneRemovers(container); });
  const unlimited = container.querySelector('[data-field="repeatUnlimited"]');
  const repeatEnd = container.querySelector('[data-field="repeatEnd"]');
  unlimited.addEventListener("change", () => { repeatEnd.disabled = unlimited.checked; if (unlimited.checked) repeatEnd.value = ""; });
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
function bindMilestoneRemovers(container) { container.querySelectorAll(".remove-milestone").forEach(button => button.onclick = () => { const row = button.closest(".milestone-row"); animateRemoval(row, () => row.remove()); }); }

function readQuestEditor(container, existingId = null) {
  const value = field => container.querySelector(`[data-field="${field}"]`)?.value || "";
  const milestones = [...container.querySelectorAll(".milestone-row")].map(row => {
    const count = row.querySelector(".milestone-count").value;
    const reward = row.querySelector(".milestone-reward").value;
    return { count:count === "" ? Number.NaN : Number(count), reward:reward === "" ? Number.NaN : Number(reward) };
  });
  const repeatStart = value("repeatStart");
  const daysOfWeek = [...container.querySelectorAll('[data-field="day"]:checked')].map(input => input.value);
  const repeatUnlimited = container.querySelector('[data-field="repeatUnlimited"]')?.checked;
  return { id:existingId || newId(), serviceId:value("serviceId"), title:value("title").trim(), kind:value("kind"), startDate:value("startDate") || null, endDate:value("endDate") || null, startTime:value("startTime") || null, endTime:value("endTime") || null, daysOfWeek, milestones, repeatBonus:repeatStart ? { startCount:Number(repeatStart), endCount:repeatUnlimited ? null : Number(value("repeatEnd")), bonusPerDelivery:Number(value("repeatBonus")) } : null, selectedGoalCount:null, notes:"" };
}

function readQuestEditorDraft(container) {
  const value = field => container.querySelector(`[data-field="${field}"]`)?.value || "";
  const repeatStart = value("repeatStart");
  return {
    id:"manual", serviceId:value("serviceId"), title:value("title"), kind:value("kind"),
    startDate:value("startDate"), endDate:value("endDate"), startTime:value("startTime"), endTime:value("endTime"),
    daysOfWeek:[...container.querySelectorAll('[data-field="day"]:checked')].map(input => input.value),
    milestones:[...container.querySelectorAll(".milestone-row")].map(row => ({ count:row.querySelector(".milestone-count").value, reward:row.querySelector(".milestone-reward").value })),
    repeatBonus:repeatStart ? { startCount:repeatStart, endCount:container.querySelector('[data-field="repeatUnlimited"]')?.checked ? null : value("repeatEnd"), bonusPerDelivery:value("repeatBonus") } : null
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
  const toolbar = parsedItems.length ? `<div class="bulk-toolbar"><label class="bulk-check"><input id="preview-select-all" type="checkbox">すべて選択</label><div class="bulk-actions"><button id="register-selected-preview" class="secondary-button" type="button">選択を登録</button><button id="register-all-preview" class="primary-button" type="button">すべて登録</button></div></div>` : "";
  $("#ai-preview").innerHTML = toolbar + parsedItems.map((item,index) => `<article class="panel preview-card" data-preview="${index}"><div class="panel-heading"><div><span class="badge">検出 ${index + 1}</span><h2 style="margin-top:8px">登録前プレビュー</h2></div><label class="card-check"><input class="preview-select" type="checkbox">選択</label></div>${questFields(item.quest,`preview-${index}`)}${item.errors.length ? `<div class="issue-list error">${item.errors.map(esc).join("<br>")}</div>` : ""}${item.warnings.length ? `<div class="issue-list warning">${item.warnings.map(esc).join("<br>")}</div>` : ""}<div class="actions"><button class="secondary-button cancel-preview" type="button">除外</button><button class="primary-button register-preview" type="button">修正内容を検証して登録</button></div></article>`).join("");
  $("#preview-select-all")?.addEventListener("change", event => $$(".preview-select").forEach(input => { input.checked = event.target.checked; }));
  $("#register-selected-preview")?.addEventListener("click", () => registerPreviewBatch(selectedIndexes(".preview-select"), "選択したクエスト"));
  $("#register-all-preview")?.addEventListener("click", () => registerPreviewBatch(parsedItems.map((_,index) => index), "すべてのクエスト"));
  $$("[data-preview]").forEach(card => {
    bindQuestEditor(card);
    const index = Number(card.dataset.preview);
    card.querySelector(".cancel-preview").addEventListener("click", () => {
      animateRemoval(card, () => { parsedItems.splice(index,1); renderPreview(); });
    });
    card.querySelector(".register-preview").addEventListener("click", () => {
      const quest = readQuestEditor(card,parsedItems[index].quest.id);
      const result = questValidation(quest,state.services);
      showEditorIssues(card,result);
      if (result.errors.length) return;
      const button = card.querySelector(".register-preview");
      button.disabled = true;
      state.quests.push(stampQuest(quest));
      commit("クエストを登録しました");
      showMessage("解析結果からクエストを登録しました。");
      animateRegistration(card, () => { parsedItems.splice(index,1); renderPreview(); renderAll(); });
    });
  });
}

function previewQuestForIndex(index) {
  const card = document.querySelector(`[data-preview="${index}"]`);
  if (!card || !parsedItems[index]) return null;
  const quest = readQuestEditor(card,parsedItems[index].quest.id);
  const result = questValidation(quest,state.services);
  showEditorIssues(card,result);
  return { card, quest, result, index };
}

async function registerPreviewBatch(indexes, label) {
  const uniqueIndexes = [...new Set(indexes)].filter(index => parsedItems[index]).sort((a,b) => a - b);
  if (!uniqueIndexes.length) return showMessage("登録するクエストを選択してください。", true);
  const items = uniqueIndexes.map(previewQuestForIndex).filter(Boolean);
  if (items.some(item => item.result.errors.length)) return showMessage("エラーがあるため一括登録できません。赤い表示の項目を修正してください。", true);
  if (!window.confirm(`${label} ${items.length}件を登録します。よろしいですか？`)) return;
  items.forEach(item => item.card.querySelectorAll("button,input,select,textarea").forEach(control => { control.disabled = true; }));
  state.quests.push(...items.map(item => stampQuest(item.quest)));
  commit(`${items.length}件のクエストを登録しました`);
  showMessage(`${items.length}件のクエストを登録しました。`);
  await Promise.all(items.map(item => animateCardExitPromise(item.card, "registered")));
  uniqueIndexes.sort((a,b) => b - a).forEach(index => parsedItems.splice(index,1));
  renderPreview();
  renderAll();
}

function renderQuestList() {
  const root = $("#quest-list");
  const quests = visibleQuests();
  if (!quests.length) { root.innerHTML = '<article class="panel empty">この週の登録済みクエストはありません。</article>'; return; }
  root.innerHTML = `<div class="bulk-toolbar"><label class="bulk-check"><input id="quest-select-all" type="checkbox">すべて選択</label><div class="bulk-actions"><button id="delete-selected-quests" class="danger-button" type="button">選択を削除</button><button id="delete-all-quests" class="danger-button" type="button">この週をすべて削除</button></div></div>` + quests.map(quest => { const svc = state.services.find(item => item.id === quest.serviceId); return `<article class="panel"><div class="panel-heading"><div><span class="badge">${QUEST_KINDS[quest.kind]}</span><h3 style="margin-top:8px">${esc(quest.title)}</h3><p class="helper">${esc(svc?.name || "不明")} / ${quest.milestones.length}段階</p><p class="quest-meta">${esc(questScheduleLabel(quest))}</p></div><div class="card-actions"><label class="card-check"><input class="quest-select" type="checkbox" value="${esc(quest.id)}">選択</label><button class="danger-button delete-quest" data-id="${quest.id}">削除</button></div></div>${quest.milestones.map(item => `<div class="compact-item"><span>${formatNumber(item.count)}件</span><strong>${formatCurrency(item.reward)}</strong></div>`).join("")}</article>`; }).join("");
  $("#quest-select-all")?.addEventListener("change", event => $$(".quest-select").forEach(input => { input.checked = event.target.checked; }));
  $("#delete-selected-quests")?.addEventListener("click", () => deleteQuestBatch(selectedQuestIds(), "選択したクエスト"));
  $("#delete-all-quests")?.addEventListener("click", () => deleteQuestBatch(quests.map(quest => quest.id), "この週のすべてのクエスト"));
  $$(".delete-quest").forEach(button => button.addEventListener("click", () => {
    const card = button.closest(".panel");
    animateRemoval(card, () => { state.quests = state.quests.filter(item => item.id !== button.dataset.id); commit("クエストを削除しました"); renderAll(); });
  }));
}

async function deleteQuestBatch(ids, label) {
  const uniqueIds = [...new Set(ids)].filter(id => state.quests.some(quest => quest.id === id));
  if (!uniqueIds.length) return showMessage("削除するクエストを選択してください。", true);
  if (!window.confirm(`${label} ${uniqueIds.length}件を削除します。この操作は元に戻せません。よろしいですか？`)) return;
  const cards = uniqueIds.map(id => $$(".delete-quest").find(button => button.dataset.id === id)?.closest(".panel")).filter(Boolean);
  cards.forEach(card => card.querySelectorAll("button,input").forEach(control => { control.disabled = true; }));
  await Promise.all(cards.map(card => animateCardExitPromise(card, "removing")));
  state.quests = state.quests.filter(quest => !uniqueIds.includes(quest.id));
  commit(`${uniqueIds.length}件のクエストを削除しました`);
  showMessage(`${uniqueIds.length}件のクエストを削除しました。`);
  renderAll();
}

function renderSettings() {
  $("#margin-count").value = state.settings.marginCount;
  $("#allowed-hours").value = state.settings.allowedAdditionalHours;
  $("#service-settings").innerHTML = state.services.map(service => `<div class="service-row" data-service="${service.id}"><label class="wide">サービス名<input data-service-field="name" value="${esc(service.name)}"></label><label>基本報酬/件<input data-service-field="baseRewardPerDelivery" type="number" min="0" value="${service.baseRewardPerDelivery}"></label><label>件数/h<input data-service-field="deliveriesPerHour" type="number" min="0.1" step="0.1" value="${service.deliveriesPerHour}"></label><div class="row-actions"><label class="switch"><input data-service-field="enabled" type="checkbox" ${service.enabled ? "checked" : ""}>有効</label><button class="danger-button remove-service" ${state.services.length <= 1 ? "disabled" : ""}>削除</button></div></div>`).join("");
  $$("[data-service]").forEach(row => {
    const service = state.services.find(item => item.id === row.dataset.service);
    row.querySelectorAll("[data-service-field]").forEach(input => input.addEventListener("change", () => { const key=input.dataset.serviceField; service[key] = key === "enabled" ? input.checked : ["baseRewardPerDelivery","deliveriesPerHour"].includes(key) ? Math.max(0,Number(input.value)) : input.value.trim(); commit("サービス設定を保存しました"); renderAll(); }));
    row.querySelector(".remove-service").addEventListener("click", () => { if (state.quests.some(item => item.serviceId === service.id)) return showMessage("このサービスには登録済みクエストがあるため削除できません。",true); animateRemoval(row, () => { state.services=state.services.filter(item => item.id !== service.id); if (activePlan().serviceId === service.id) activePlan().serviceId=state.services[0].id; commit(); renderAll(); }); });
  });
}

function periodQuests() { return visibleQuests().filter(item => item.kind === "period" && item.serviceId === activePlan().serviceId); }

function relatedQuestsWithPredictions(periodQuest) {
  return visibleQuests().filter(item => item.serviceId===periodQuest.serviceId && item.kind!=="period").map(item => ({ ...item, predictedCount:predictedQuestDeliveries(item,activePlan(),activeService(),periodQuest) }));
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
  const questDeliveries = predictedQuestDeliveries(quest,activePlan(),activeService());
  const related = relatedQuestsWithPredictions(quest);
  const rows = periodGoalRows(quest,questDeliveries,activeService(),related,state.settings);
  const recommended = recommendGoal(rows);
  if (!recommended) return;
  const basis = periodGoalBasis(quest,rows);
  const draftCount = Number(quest.selectedGoalCount) || recommended.row.count;
  const messages = ["◎","○"].includes(basis.row.judgement) ? [`対象期間の予想${formatNumber(questDeliveries)}件で達成圏内です。`,`期間外の稼働予定は判定件数に含めていません。`] : basis.row.judgement === "△" ? [`追加${formatNumber(basis.row.additionalHours)}時間で達成圏内です。`,`計画に追加稼働を組み込める場合の候補です。`] : [`選択目標まで追加${formatNumber(basis.row.additionalDeliveries)}件が必要です。`,`未達の場合、期間クエスト報酬は予想売上に加算しません。`];
  const selectionLabel = quest.selectedGoalCount ? `確定済み: ${formatNumber(quest.selectedGoalCount)}件` : `未確定: 推奨${formatNumber(recommended.row.count)}件を予想売上に使用中`;
  $("#goal-recommendation").innerHTML = `<article class="panel hero-panel"><div class="recommendation"><p class="eyebrow">${quest.selectedGoalCount ? "CONFIRMED" : recommended.level === "reference" ? "REFERENCE" : "RECOMMENDED"}</p><div class="big">${quest.selectedGoalCount ? "選択: " : recommended.level === "reference" ? "参考: " : "推奨: "}${formatNumber(basis.row.count)}件</div><p>${selectionLabel}</p><ul>${messages.map(item=>`<li>${item}</li>`).join("")}</ul></div></article>`;
  $("#goal-table").innerHTML = `<div class="goal-selection-bar"><div><strong>${selectionLabel}</strong><p>実際にサービスで選択した目標を指定してください。確定後は概要の予想売上に反映されます。</p></div><button id="confirm-goal" class="primary-button" type="button">${quest.selectedGoalCount ? "選択を変更" : "この目標で確定"}</button></div><div class="table-scroll"><table><thead><tr><th>選択</th><th>目標</th><th>期間報酬</th><th>必要時間</th><th>予想件数</th><th>達成時売上</th><th>達成時時給</th><th>追加件数</th><th>追加時間</th><th>判定</th><th>補助情報</th></tr></thead><tbody>${rows.map(row => `<tr class="${row===recommended.row?"recommended":""} ${row.count===Number(quest.selectedGoalCount)?"confirmed":""}"><td><input class="goal-radio" type="radio" name="period-goal" value="${row.count}" ${row.count===draftCount?"checked":""} aria-label="${formatNumber(row.count)}件を選択"></td><td>${formatNumber(row.count)}件${row===recommended.row?'<span class="mini-badge">推奨</span>':""}</td><td>${formatCurrency(row.reward)}</td><td>${formatNumber(row.requiredHours)}h</td><td>${formatNumber(row.predictedDeliveries)}件</td><td>${formatCurrency(row.revenue)}</td><td>${formatCurrency(row.hourly)}/h</td><td>${formatNumber(row.additionalDeliveries)}件</td><td>${formatNumber(row.additionalHours)}h</td><td class="judgement">${row.judgement}</td><td>${relatedDetails(row)}</td></tr>`).join("")}</tbody></table></div>`;
  $("#confirm-goal").addEventListener("click", () => {
    const selected = $("#goal-table input[name='period-goal']:checked");
    if (!selected) return showMessage("確定する目標を選択してください。",true);
    quest.selectedGoalCount = Number(selected.value);
    quest.selectedGoalConfirmedAt = new Date().toISOString();
    commit(`${formatNumber(quest.selectedGoalCount)}件の目標を確定しました`);
    showMessage(`${quest.title}は${formatNumber(quest.selectedGoalCount)}件で保存しました。`);
    renderGoals(); renderDashboard();
  });
}

function relatedDetails(row) {
  const items = row.relatedRewards.length ? row.relatedRewards.map(item => `<li><span>${esc(item.title)}</span><strong>${formatCurrency(item.reward)}</strong></li>`).join("") : '<li class="muted-item">達成見込みの関連報酬はありません</li>';
  return `<details class="related-details"><summary>${row.relatedReward ? `関連 +${formatCurrency(row.relatedReward)}` : "関連報酬を見る"}</summary><div><ul>${items}</ul><p><span>関連報酬込み売上</span><strong>${formatCurrency(row.totalRevenue)}</strong></p><p><span>関連報酬込み時給</span><strong>${formatCurrency(row.totalHourly)}/h</strong></p></div></details>`;
}

function renderHistory() {
  const summaryRoot = $("#history-summary");
  const tableRoot = $("#history-table");
  if (!summaryRoot || !tableRoot) return;
  const weeks = historyWeeks();
  if (!weeks.length) {
    summaryRoot.innerHTML = '<p class="empty">保存済みの過去クエストはありません。</p>';
    tableRoot.innerHTML = "";
    return;
  }
  const totals = weeks.map(week => ({ week, total:weekMaxReward(week) }));
  summaryRoot.innerHTML = `<div class="history-total-grid">${totals.map(item => `<div class="history-total"><span>${esc(item.week)}</span><strong>${formatCurrency(item.total)}</strong></div>`).join("")}</div>`;
  tableRoot.innerHTML = `<div class="table-scroll"><table><thead><tr><th>週</th><th>種別</th><th>クエスト</th><th>曜日/時間</th><th>最大報酬</th><th>前週比</th><th>操作</th></tr></thead><tbody>${weeks.flatMap(week => historyRows(week)).join("")}</tbody></table></div>`;
  $$(".copy-history-quest").forEach(button => button.addEventListener("click", () => copyHistoryQuest(button.dataset.id)));
}

function historyWeeks() {
  const weeks = new Set(state.weeklyPlans.map(plan => plan.weekStartDate));
  state.quests.forEach(quest => weeks.add(quest.sourceWeekStartDate || weekFromQuest(quest)));
  return [...weeks].filter(Boolean).sort((a,b) => b.localeCompare(a));
}

function weekMaxReward(week) {
  return questsForWeek(week).reduce((sum,quest) => sum + (maxRewardValue(quest) || 0), 0);
}

function historyRows(week) {
  return questsForWeek(week).map(quest => {
    const reward = maxRewardValue(quest);
    const diff = historyDiff(quest, week, reward);
    const copy = week === state.activeWeekStartDate ? "" : `<button class="secondary-button copy-history-quest" type="button" data-id="${esc(quest.id)}">今週へコピー</button>`;
    return `<tr><td>${esc(week)}</td><td>${QUEST_KINDS[quest.kind] || esc(quest.kind)}</td><td>${esc(quest.title)}</td><td>${esc(questScheduleLabel(quest))}</td><td>${reward == null ? "上限なし" : formatCurrency(reward)}</td><td>${diff}</td><td>${copy}</td></tr>`;
  });
}

function historyDiff(quest, week, reward) {
  const previous = questsForWeek(previousWeekStart(week)).find(item => questCompareKey(item) === questCompareKey(quest));
  if (!previous || reward == null) return "前週なし";
  const previousReward = maxRewardValue(previous);
  if (previousReward == null) return "比較不可";
  const diff = reward - previousReward;
  const sign = diff > 0 ? "+" : "";
  return `${sign}${formatCurrency(diff)}`;
}

function questScheduleLabel(quest) {
  const days = (quest.daysOfWeek || []).map(day => DAY_LABELS[day]).join("・") || "曜日未設定";
  const time = quest.startTime || quest.endTime ? ` ${quest.startTime || "--:--"}-${quest.endTime || "--:--"}` : "";
  return `${days}${time}`;
}

function copyHistoryQuest(id) {
  const source = state.quests.find(quest => quest.id === id);
  if (!source) return;
  const range = dateRangeFromDays(source.daysOfWeek || [], state.activeWeekStartDate);
  const copy = stampQuest({
    ...source,
    id:newId(),
    title:source.title,
    startDate:range.startDate || source.startDate,
    endDate:range.endDate || source.endDate,
    selectedGoalCount:null,
    selectedGoalConfirmedAt:null
  });
  state.quests.push(copy);
  commit("過去クエストを今週へコピーしました");
  showMessage("過去クエストを今週へコピーしました。");
  renderAll();
}

function renderDashboard() {
  const service = activeService();
  const quests = visibleQuests();
  const stats = planStats(activePlan(),service);
  const baseRevenue = stats.deliveries * Number(service?.baseRewardPerDelivery || 0);
  const projections = weeklyPeriodProjections(quests,activePlan(),service,state.settings);
  const questRevenue = projections.reduce((sum,item) => sum + item.reward,0);
  const additional = projectedAdditionalRewards(quests,activePlan(),service);
  const totalRevenue = baseRevenue + questRevenue + additional.total;
  const hourly = stats.hours ? totalRevenue/stats.hours : 0;
  const targetCount = projections.reduce((sum,item) => sum + item.basis.row.count,0);
  const targetDetail = projections.length ? projections.map(item => `${periodShortLabel(item.period)}${formatNumber(item.basis.row.count)}`).join("　") : "期間クエストなし";
  const revenueDetail = `配達${formatCurrency(baseRevenue)} + 期間${formatCurrency(questRevenue)} + その他${formatCurrency(additional.total)}`;
  $("#summary-cards").innerHTML = summaryCard("予想売上",formatCurrency(totalRevenue),revenueDetail) + summaryCard("予想時給",`${formatCurrency(hourly)}/h`,`${formatNumber(stats.hours)}時間・全報酬込み`) + summaryCard("配達目標",projections.length?`${formatNumber(targetCount)}件`:"未設定",targetDetail) + summaryCard("計画サービス",service?.name||"未設定",`営業日 04:00区切り`);
  $("#dashboard-recommendation").innerHTML = projections.length ? `<div class="period-projection-list">${projections.map(item => `<div class="period-projection"><div><strong>${esc(item.period.title)}</strong><span>${item.basis.source === "confirmed" ? "確定済み" : "未確定・推奨を仮使用"}</span></div><div class="period-projection-numbers"><b>${formatNumber(item.basis.row.count)}件 <span class="judgement">${item.basis.row.judgement}</span></b><small>予想${formatNumber(item.deliveries)}件 / 報酬見込${formatCurrency(item.reward)}</small></div></div>`).join("")}</div>` : '<p class="empty" style="color:#d5ebe6">期間クエストを登録すると推奨目標を表示します。</p>';
  const dayForecasts = weeklyDayForecasts(quests,activePlan(),service,state.settings);
  const max = Math.max(1,...dayForecasts.map(item=>item.deliveries));
  $("#dashboard-days").innerHTML = dayForecasts.map(day=>`<div class="bar-row"><span>${DAY_LABELS[day.day]}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100,day.deliveries/max*100)}%"></div></div><div class="bar-values"><strong>${formatNumber(day.deliveries)}件</strong><small>${formatNumber(day.hours)}h / ${formatCurrency(day.revenue)}</small></div></div>`).join("");
  const questSummaries = weeklyQuestSummaries(quests,activePlan(),service,state.settings);
  $("#dashboard-quests").innerHTML = questSummaries.length ? questSummaries.map(item=>questSummaryCard(item)).join("") : '<p class="empty">対象週のクエストはありません。</p>';
  $$(".add-quest-schedule").forEach(button => button.addEventListener("click", () => addQuestSchedule(button.dataset.questId)));
}

function questSummaryCard(item) {
  const tone = item.predictedCount <= 0 ? "zero" : item.progress >= 1 ? "full" : item.progress >= .45 ? "partial" : "low";
  const maxReward = item.maximum.unlimited ? "上限なし" : formatCurrency(item.maximum.reward);
  const scheduleButton = item.quest.startTime && item.quest.endTime ? `<button class="secondary-button add-quest-schedule" type="button" data-quest-id="${item.quest.id}">時間帯を予定に追加</button>` : "";
  const periodState = item.basis ? ` / ${item.basis.source === "confirmed" ? "選択" : "推奨"}${formatNumber(item.maximum.count)}件` : "";
  return `<article class="quest-summary ${tone}"><div class="quest-summary-main"><div><span class="badge">${QUEST_KINDS[item.quest.kind]}</span><strong>${esc(item.quest.title)}</strong><p class="quest-meta">${esc(questScheduleLabel(item.quest))}</p><p>${formatNumber(item.predictedCount)}件見込み${periodState}</p>${questTrendBadge(item)}</div><div class="quest-rewards"><span>最大 ${maxReward}</span><b>見込 ${formatCurrency(item.projectedReward)}</b></div></div>${scheduleButton}</article>`;
}

function questTrendBadge(item) {
  const previous = previousQuestSummary(item);
  const maximum = questMaximumForDisplay(item.quest);
  if (!previous || previous.reward == null || maximum.unlimited) return `<p class="trend neutral">前週なし</p>`;
  const current = Number(maximum.reward || 0);
  const diff = current - previous.reward;
  const pct = previous.reward ? diff / previous.reward * 100 : null;
  const tone = diff > 0 ? "up" : diff < 0 ? "down" : "neutral";
  const sign = diff > 0 ? "+" : "";
  const rate = pct == null ? "" : ` / ${sign}${formatNumber(pct)}%`;
  return `<p class="trend ${tone}">前週最大 ${formatCurrency(previous.reward)} / ${sign}${formatCurrency(diff)}${rate}</p>`;
}

function addQuestSchedule(questId) {
  const quest = visibleQuests().find(item => item.id === questId);
  if (!quest?.startTime || !quest?.endTime) return showMessage("このクエストには時間帯が設定されていません。",true);
  const targets = activePlan().workSlots.filter(day => questIncludesPlanDay(quest,activePlan(),day.day));
  if (!targets.length) return showMessage("対象週に追加できる曜日がありません。",true);
  const slot = { start:quest.startTime, end:quest.endTime };
  const conflicts = targets.filter(day => !day.slots.some(item => item.start === slot.start && item.end === slot.end) && validateSlots([...(day.slots || []),slot]).length);
  if (conflicts.length) return showMessage(`${conflicts.map(day=>DAY_LABELS[day.day]).join("・")}曜日は既存の稼働枠と重複するため追加できません。`,true);
  let added = 0;
  targets.forEach(day => {
    day.enabled = true;
    if (!day.slots.some(item => item.start === slot.start && item.end === slot.end)) { day.slots.push({ ...slot }); added += 1; }
  });
  if (!added) return showMessage("同じ時間帯がすでに稼働予定へ登録されています。");
  commit(`${quest.title}の時間帯を稼働予定へ追加しました`);
  showMessage(`${quest.title}の時間帯を${added}日分追加しました。`);
  renderAll();
}

function periodShortLabel(quest) {
  const days = quest.daysOfWeek || [];
  if (["mon","tue","wed","thu"].every(day => days.includes(day))) return "月木";
  if (["fri","sat","sun"].every(day => days.includes(day))) return "金日";
  return quest.title || "期間";
}

function summaryCard(label,value,detail) { return `<article class="summary-card"><div class="label">${label}</div><div class="value">${value}</div><div class="detail">${esc(detail)}</div></article>`; }
function normalizeMonday(value) { if (!value) return mondayOf(); const [y,m,d]=value.split("-").map(Number); return mondayOf(new Date(y,m-1,d)); }
function esc(value) { return String(value ?? "").replace(/[&<>"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char])); }
