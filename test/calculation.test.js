import test from "node:test";
import assert from "node:assert/strict";
import { slotDurationHours, validateSlots, businessDayFor, dayPlanStats, milestoneReward, periodGoalRows, recommendGoal, predictedQuestDeliveries } from "../src/calculation.js";

const uber = { baseRewardPerDelivery:550, deliveriesPerHour:3.5 };

test("20時間 x 3.5件/h は70件", () => {
  const day = { enabled:true, slots:[{start:"04:00",end:"23:59"},{start:"00:00",end:"00:01"}], manualDeliveryCount:null };
  assert.equal(dayPlanStats(day,uber).deliveries,70);
});

test("手動上書き件数を優先する", () => {
  const day = { enabled:true, slots:[{start:"10:00",end:"15:00"}], manualDeliveryCount:80 };
  assert.equal(dayPlanStats(day,uber).deliveries,80);
});

test("22:00から02:00は同じ営業日の4時間", () => {
  assert.equal(slotDurationHours({start:"22:00",end:"02:00"}),4);
});

test("営業日の04:00を越える枠は拒否する", () => {
  assert.ok(validateSlots([{start:"02:00",end:"05:00"}]).length > 0);
});

test("深夜時刻は前営業日に帰属する", () => {
  const tue2 = new Date(2026,5,16,2,0);
  const tue4 = new Date(2026,5,16,4,0);
  assert.equal(businessDayFor(tue2).getDate(),15);
  assert.equal(businessDayFor(tue4).getDate(),16);
});

test("継続ボーナスは20件で4000円", () => {
  const fixed=[{count:1,reward:200},{count:2,reward:300},{count:3,reward:600}];
  assert.equal(milestoneReward(20,fixed,{startCount:4,endCount:20,bonusPerDelivery:200}),4000);
});

test("期間クエストの判定と推薦", () => {
  const quest={milestones:[{count:60,reward:3160},{count:80,reward:4340},{count:100,reward:5680}]};
  const rows=periodGoalRows(quest,80,uber,[],{marginCount:5,allowedAdditionalHours:2});
  assert.deepEqual(rows.map(row=>row.judgement),["◎","○","×"]);
  assert.equal(recommendGoal(rows).row.count,80);
});

test("時間帯報酬は売上に加算するが件数は増やさない", () => {
  const quest={milestones:[{count:80,reward:4340}]};
  const related=[{predictedCount:12,milestones:[{count:12,reward:1500}],repeatBonus:null}];
  const [row]=periodGoalRows(quest,80,uber,related,{});
  assert.equal(row.predictedDeliveries,80);
  assert.equal(row.revenue,80*550+4340+1500);
});

test("時間帯クエストは稼働枠との重複時間だけを件数にする", () => {
  const plan={workSlots:[
    {day:"mon",enabled:true,slots:[{start:"10:00",end:"15:00"},{start:"17:00",end:"21:00"}],manualDeliveryCount:null},
    {day:"tue",enabled:true,slots:[{start:"10:00",end:"15:00"}],manualDeliveryCount:null}
  ]};
  const quest={daysOfWeek:["mon"],startTime:"10:00",endTime:"15:00"};
  assert.equal(predictedQuestDeliveries(quest,plan,uber),17.5);
});

test("手動上書き件数は重複時間の比率で時間帯へ配分する", () => {
  const plan={workSlots:[{day:"mon",enabled:true,slots:[{start:"10:00",end:"15:00"},{start:"17:00",end:"22:00"}],manualDeliveryCount:30}]};
  const quest={daysOfWeek:["mon"],startTime:"10:00",endTime:"15:00"};
  assert.equal(predictedQuestDeliveries(quest,plan,uber),15);
});
