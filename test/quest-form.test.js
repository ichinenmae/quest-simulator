import test from "node:test";
import assert from "node:assert/strict";
import { automaticQuestTitle, dateRangeFromDays, daysFromDateRange, defaultTimesForKind } from "../src/quest-form.js";
import { questValidation } from "../src/quest.js";
import { defaultState } from "../src/storage.js";

test("期間クエストの標準時刻は営業日全体", () => {
  assert.deepEqual(defaultTimesForKind("period"), { startTime:"04:00", endTime:"03:59" });
});

test("時間帯クエストの標準時刻は昼枠", () => {
  assert.deepEqual(defaultTimesForKind("time"), { startTime:"10:00", endTime:"15:30" });
});

test("日付範囲から曜日を補完する", () => {
  assert.deepEqual(daysFromDateRange("2026-06-15", "2026-06-18"), ["mon", "tue", "wed", "thu"]);
});

test("曜日から対象週の日付範囲を補完する", () => {
  assert.deepEqual(dateRangeFromDays(["mon", "tue", "wed", "thu"], "2026-06-15"), { startDate:"2026-06-15", endDate:"2026-06-18" });
});

test("種別と曜日からタイトルを作る", () => {
  assert.equal(automaticQuestTitle("period", ["mon", "tue", "wed", "thu"]), "月～木期間クエスト");
  assert.equal(automaticQuestTitle("time", ["mon"]), "月時間帯クエスト");
  assert.equal(automaticQuestTitle("weather", ["mon"]), "荒天クエスト");
});

test("マイルストーンのエラーは入力箇所を明示する", () => {
  const quest = { serviceId:"svc_uber", title:"テスト", kind:"period", daysOfWeek:["mon"], milestones:[{ count:12, reward:Number.NaN }], repeatBonus:null };
  assert.deepEqual(questValidation(quest, defaultState().services).errors, ["マイルストーン1行目の累計報酬を0円以上で入力してください。"]);
});
