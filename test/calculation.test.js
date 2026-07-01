import test from "node:test";
import assert from "node:assert/strict";
import { parseTime, slotDurationHours, validateSlots, businessDayFor, dayPlanStats, milestoneReward, periodGoalRows, recommendGoal, periodGoalBasis, projectedPeriodReward, projectedAdditionalRewards, weeklyPeriodProjections, weeklyQuestSummaries, weeklyDayForecasts, predictedQuestDeliveries } from "../src/calculation.js";

const uber = { baseRewardPerDelivery:550, deliveriesPerHour:3.5 };

test("20時間 x 3.5件/h は70件", () => {
  const day = { enabled:true, slots:[{start:"04:00",end:"23:59"},{start:"00:00",end:"00:01"}], manualDeliveryCount:null };
  assert.equal(dayPlanStats(day,uber).deliveries,70);
});

test("手動上書き件数を優先する", () => {
  const day = { enabled:true, slots:[{start:"10:00",end:"15:00"}], manualDeliveryCount:80 };
  assert.equal(dayPlanStats(day,uber).deliveries,80);
});

test("手動上書き0件は自動計算扱いにする", () => {
  const day = { enabled:true, slots:[{start:"10:00",end:"15:00"}], manualDeliveryCount:0 };
  assert.equal(dayPlanStats(day,uber).deliveries,17.5);
});

test("実績件数は予定と手動上書きより優先する", () => {
  const day = { enabled:false, slots:[{start:"10:00",end:"15:00"}], manualDeliveryCount:80, actualDeliveryCount:42, actualRevenue:12345 };
  const stats = dayPlanStats(day,uber);
  assert.equal(stats.deliveries,42);
  assert.equal(stats.actualRevenue,12345);
});

test("実績0件は実績として扱う", () => {
  const day = { enabled:true, slots:[{start:"10:00",end:"15:00"}], manualDeliveryCount:80, actualDeliveryCount:0 };
  assert.equal(dayPlanStats(day,uber).deliveries,0);
});

test("22:00から02:00は同じ営業日の4時間", () => {
  assert.equal(slotDurationHours({start:"22:00",end:"02:00"}),4);
});

test("時刻入力は4:00や400を受け付け、04:00終了は営業日の終端にする", () => {
  assert.equal(parseTime("4:00"),240);
  assert.equal(parseTime("400"),240);
  assert.equal(slotDurationHours({start:"22:00",end:"04:00"}),6);
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

test("上限なし継続ボーナスは全件分を加算する", () => {
  assert.equal(milestoneReward(25,[],{startCount:1,endCount:null,bonusPerDelivery:100}),2500);
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
  assert.equal(row.revenue,80*550+4340);
  assert.equal(row.relatedReward,1500);
  assert.equal(row.totalRevenue,80*550+4340+1500);
  assert.equal(row.hourly,(80*550+4340)/(80/3.5));
  assert.equal(row.totalHourly,(80*550+4340+1500)/(80/3.5));
  assert.deepEqual(row.relatedRewards,[{id:undefined,title:"名称未設定",reward:1500}]);
});

test("達成済み目標の売上は予想件数で計算する", () => {
  const service={baseRewardPerDelivery:100,deliveriesPerHour:3};
  const [row]=periodGoalRows({milestones:[{count:10,reward:800}]},66,service,[{predictedCount:12,milestones:[{count:12,reward:8400}],repeatBonus:null}],{});
  assert.equal(row.achievementDeliveries,66);
  assert.equal(row.requiredHours,22);
  assert.equal(row.revenue,7400);
  assert.equal(row.relatedReward,8400);
  assert.equal(row.totalRevenue,15800);
});

test("未確定なら推奨目標、確定後は選択目標を売上根拠にする", () => {
  const rows=periodGoalRows({milestones:[{count:50,reward:5000},{count:60,reward:7000}]},55,uber,[],{marginCount:5});
  assert.equal(periodGoalBasis({selectedGoalCount:null},rows).row.count,50);
  assert.equal(projectedPeriodReward({selectedGoalCount:null},55,rows).reward,5000);
  assert.equal(periodGoalBasis({selectedGoalCount:60},rows).row.count,60);
  assert.equal(projectedPeriodReward({selectedGoalCount:60},55,rows).reward,0);
});

test("確定目標を超過しても選択した固定報酬だけを加算する", () => {
  const quest={selectedGoalCount:50,milestones:[{count:50,reward:5000},{count:60,reward:7000},{count:70,reward:9000}]};
  const rows=periodGoalRows(quest,70,uber,[],{});
  assert.equal(projectedPeriodReward(quest,70,rows).reward,5000);
});

test("概要用の追加報酬は期間以外の達成見込みをすべて合算する", () => {
  const plan={serviceId:"svc_uber",weekStartDate:"2026-06-15",workSlots:[
    {day:"mon",enabled:true,slots:[{start:"10:00",end:"15:00"},{start:"17:00",end:"21:00"}],manualDeliveryCount:null}
  ]};
  const service={...uber,id:"svc_uber"};
  const quests=[
    {id:"period",serviceId:"svc_uber",kind:"period",title:"期間",daysOfWeek:["mon"],milestones:[{count:10,reward:800}]},
    {id:"lunch",serviceId:"svc_uber",kind:"time",title:"昼",daysOfWeek:["mon"],startTime:"10:00",endTime:"15:00",milestones:[{count:12,reward:1500}]},
    {id:"night",serviceId:"svc_uber",kind:"weather",title:"夜",daysOfWeek:["mon"],startTime:"17:00",endTime:"21:00",milestones:[{count:10,reward:1200}]},
    {id:"other",serviceId:"svc_other",kind:"daily",title:"他社",daysOfWeek:["mon"],milestones:[{count:1,reward:9999}]}
  ];
  const result=projectedAdditionalRewards(quests,plan,service);
  assert.equal(result.total,2700);
  assert.deepEqual(result.items.map(item=>item.title),["昼","夜"]);
});

test("概要は月木と金日の期間クエストを別々に判定して合算する", () => {
  const plan={serviceId:"svc_uber",weekStartDate:"2026-06-15",workSlots:[
    {day:"mon",enabled:true,slots:[{start:"10:00",end:"15:00"}],manualDeliveryCount:30},
    {day:"thu",enabled:true,slots:[{start:"10:00",end:"15:00"}],manualDeliveryCount:25},
    {day:"fri",enabled:true,slots:[{start:"10:00",end:"15:00"}],manualDeliveryCount:20},
    {day:"sun",enabled:true,slots:[{start:"10:00",end:"15:00"}],manualDeliveryCount:25}
  ]};
  const service={...uber,id:"svc_uber"};
  const quests=[
    {id:"mon-thu",serviceId:"svc_uber",kind:"period",title:"月木",daysOfWeek:["mon","tue","wed","thu"],startDate:"2026-06-15",endDate:"2026-06-18",selectedGoalCount:50,milestones:[{count:50,reward:5000}]},
    {id:"fri-sun",serviceId:"svc_uber",kind:"period",title:"金日",daysOfWeek:["fri","sat","sun"],startDate:"2026-06-19",endDate:"2026-06-21",selectedGoalCount:40,milestones:[{count:40,reward:4000}]},
    {id:"old",serviceId:"svc_uber",kind:"period",title:"前週",daysOfWeek:["mon"],startDate:"2026-06-08",endDate:"2026-06-08",selectedGoalCount:10,milestones:[{count:10,reward:9999}]}
  ];
  const result=weeklyPeriodProjections(quests,plan,service,{});
  assert.equal(result.length,2);
  assert.deepEqual(result.map(item=>item.basis.row.count),[50,40]);
  assert.deepEqual(result.map(item=>item.deliveries),[55,45]);
  assert.equal(result.reduce((sum,item)=>sum+item.reward,0),9000);
});

test("稼働枠と重ならない時間帯クエストは概要報酬へ加算しない", () => {
  const plan={serviceId:"svc_uber",weekStartDate:"2026-06-15",workSlots:[
    {day:"mon",enabled:true,slots:[{start:"17:00",end:"21:00"}],manualDeliveryCount:12}
  ]};
  const service={...uber,id:"svc_uber"};
  const quests=[
    {id:"morning",serviceId:"svc_uber",kind:"time",title:"月曜午前",daysOfWeek:["mon"],startTime:"10:00",endTime:"15:00",milestones:[{count:1,reward:1500}]},
    {id:"night",serviceId:"svc_uber",kind:"time",title:"月曜夜",daysOfWeek:["mon"],startTime:"17:00",endTime:"21:00",milestones:[{count:10,reward:1200}]}
  ];
  const result=projectedAdditionalRewards(quests,plan,service);
  assert.equal(result.total,1200);
  assert.deepEqual(result.items.map(item=>item.title),["月曜夜"]);
});

test("週次クエスト一覧は期間の選択目標とその他の最大・見込報酬を返す", () => {
  const plan={serviceId:"svc_uber",weekStartDate:"2026-06-15",workSlots:[{day:"mon",enabled:true,slots:[{start:"10:00",end:"15:00"}],manualDeliveryCount:12}]};
  const service={...uber,id:"svc_uber"};
  const quests=[
    {id:"period",serviceId:"svc_uber",kind:"period",title:"月木",daysOfWeek:["mon"],selectedGoalCount:10,milestones:[{count:10,reward:800},{count:20,reward:2000}]},
    {id:"time",serviceId:"svc_uber",kind:"time",title:"昼",daysOfWeek:["mon"],startTime:"10:00",endTime:"15:00",milestones:[{count:6,reward:600},{count:12,reward:1500}]}
  ];
  const result=weeklyQuestSummaries(quests,plan,service,{});
  assert.deepEqual(result.map(item=>[item.quest.id,item.maximum.count,item.maximum.reward,item.projectedReward]),[["period",10,800,800],["time",12,1500,1500]]);
});

test("曜日別見込み収入の合計は基本報酬とクエスト報酬の週合計に一致する", () => {
  const plan={serviceId:"svc_uber",weekStartDate:"2026-06-15",workSlots:[
    {day:"mon",enabled:true,slots:[{start:"10:00",end:"15:00"}],manualDeliveryCount:10},
    {day:"tue",enabled:true,slots:[{start:"10:00",end:"15:00"}],manualDeliveryCount:10}
  ]};
  const service={baseRewardPerDelivery:100,deliveriesPerHour:2,id:"svc_uber"};
  const quests=[
    {id:"period",serviceId:"svc_uber",kind:"period",title:"期間",daysOfWeek:["mon","tue"],selectedGoalCount:20,milestones:[{count:20,reward:1000}]},
    {id:"mon",serviceId:"svc_uber",kind:"time",title:"月曜",daysOfWeek:["mon"],startTime:"10:00",endTime:"15:00",milestones:[{count:10,reward:500}]}
  ];
  const days=weeklyDayForecasts(quests,plan,service,{});
  assert.equal(days.reduce((sum,item)=>sum+item.revenue,0),3500);
  assert.equal(days[0].revenue,2000);
  assert.equal(days[1].revenue,1500);
});

test("実績報酬は曜日別見込み収入の基本報酬に優先される", () => {
  const plan={serviceId:"svc_uber",weekStartDate:"2026-06-15",workSlots:[
    {day:"mon",enabled:true,slots:[{start:"10:00",end:"15:00"}],manualDeliveryCount:null,actualDeliveryCount:8,actualRevenue:4321}
  ]};
  const service={baseRewardPerDelivery:100,deliveriesPerHour:2,id:"svc_uber"};
  const days=weeklyDayForecasts([],plan,service,{});
  assert.equal(days[0].deliveries,8);
  assert.equal(days[0].revenue,4321);
});

test("実績0件は曜日別見込みでも0件として扱う", () => {
  const plan={serviceId:"svc_uber",weekStartDate:"2026-06-15",workSlots:[
    {day:"mon",enabled:true,slots:[{start:"10:00",end:"15:00"}],manualDeliveryCount:null,actualDeliveryCount:0,actualRevenue:null}
  ]};
  const service={baseRewardPerDelivery:100,deliveriesPerHour:2,id:"svc_uber"};
  const days=weeklyDayForecasts([],plan,service,{});
  assert.equal(days[0].deliveries,0);
  assert.equal(days[0].revenue,0);
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

test("月木期間クエストに金日予定を含めない", () => {
  const plan={weekStartDate:"2026-06-15",workSlots:[
    {day:"mon",enabled:true,slots:[{start:"10:00",end:"15:00"}],manualDeliveryCount:10},
    {day:"thu",enabled:true,slots:[{start:"10:00",end:"15:00"}],manualDeliveryCount:10},
    {day:"fri",enabled:true,slots:[{start:"10:00",end:"15:00"}],manualDeliveryCount:50},
    {day:"sun",enabled:true,slots:[{start:"10:00",end:"15:00"}],manualDeliveryCount:50}
  ]};
  const quest={daysOfWeek:["mon","tue","wed","thu"],startDate:"2026-06-15",endDate:"2026-06-18",startTime:"04:00",endTime:"03:59"};
  assert.equal(predictedQuestDeliveries(quest,plan,uber),20);
});

test("時間帯クエストに時間外配達を含めない", () => {
  const plan={weekStartDate:"2026-06-15",workSlots:[
    {day:"mon",enabled:true,slots:[{start:"10:00",end:"15:30"},{start:"17:00",end:"21:30"}],manualDeliveryCount:36}
  ]};
  const quest={daysOfWeek:["mon"],startDate:"2026-06-15",endDate:"2026-06-15",startTime:"17:00",endTime:"21:30"};
  assert.equal(predictedQuestDeliveries(quest,plan,uber),16.2);
});

test("関連時間帯クエストも期間クエストの範囲内だけ集計する", () => {
  const plan={weekStartDate:"2026-06-15",workSlots:[
    {day:"mon",enabled:true,slots:[{start:"17:00",end:"21:30"}],manualDeliveryCount:12},
    {day:"fri",enabled:true,slots:[{start:"17:00",end:"21:30"}],manualDeliveryCount:12}
  ]};
  const timeQuest={daysOfWeek:["mon","fri"],startTime:"17:00",endTime:"21:30"};
  const periodQuest={daysOfWeek:["mon","tue","wed","thu"],startDate:"2026-06-15",endDate:"2026-06-18"};
  assert.equal(predictedQuestDeliveries(timeQuest,plan,uber,periodQuest),12);
});
