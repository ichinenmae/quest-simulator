import test from "node:test";
import assert from "node:assert/strict";
import { parseAIText } from "../src/parser.js";
import { defaultState } from "../src/storage.js";

const services=defaultState().services;

test("期間クエストを解析する", () => {
  const result=parseAIText(`QUEST_TYPE: PERIOD\nSERVICE: Uber\nTITLE: 月〜木\nPERIOD: MON_THU\n\n60=3160\n80=4340`,services);
  assert.equal(result.items.length,1);
  assert.equal(result.items[0].quest.kind,"period");
  assert.equal(result.items[0].quest.milestones.length,2);
  assert.deepEqual(result.items[0].quest.daysOfWeek,["mon","tue","wed","thu"]);
});

test("複数クエストとコメントを解析する", () => {
  const text=`# comment\nQUEST_TYPE: PERIOD\nSERVICE: Uber\nTITLE: A\nPERIOD: MON_THU\n60=3160\n---\nQUEST_TYPE: TIME\nSERVICE: Uber\nTITLE: B\nDAY: MON\nSTART: 10:00\nEND: 15:00\n3=300`;
  assert.equal(parseAIText(text,services).items.length,2);
});

test("UNKNOWNと不明キーは警告する", () => {
  const result=parseAIText(`QUEST_TYPE: PERIOD\nSERVICE: UNKNOWN\nTITLE: A\nPERIOD: UNKNOWN\nFOO: BAR\n60=3160`,services);
  assert.ok(result.items[0].warnings.some(item=>item.includes("UNKNOWN")));
  assert.ok(result.items[0].warnings.some(item=>item.includes("FOO")));
  assert.ok(result.items[0].errors.length>0);
});

test("降順件数と報酬減少をエラーにする", () => {
  const result=parseAIText(`QUEST_TYPE: PERIOD\nSERVICE: Uber\nTITLE: A\nPERIOD: MON_THU\n80=4340\n60=3160`,services);
  assert.ok(result.items[0].errors.some(item=>item.includes("昇順")));
});

test("営業日境界を越える時間帯をエラーにする", () => {
  const result=parseAIText(`QUEST_TYPE: TIME\nSERVICE: Uber\nTITLE: 深夜\nDAY: MON\nSTART: 02:00\nEND: 05:00\n3=300`,services);
  assert.ok(result.items[0].errors.some(item=>item.includes("営業日04:00")));
});

test("上限なし継続ボーナスを解析する", () => {
  const result=parseAIText(`QUEST_TYPE: TIME\nSERVICE: Uber\nTITLE: 全件加算\nDAY: MON\nSTART: 17:00\nEND: 21:30\nREPEAT_START=1\nREPEAT_END=UNLIMITED\nREPEAT_BONUS=100`,services);
  assert.equal(result.items[0].errors.length,0);
  assert.deepEqual(result.items[0].quest.repeatBonus,{startCount:1,endCount:null,bonusPerDelivery:100});
});
