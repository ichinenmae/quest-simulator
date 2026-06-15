# データ形式仕様

## 1. LocalStorage 保存データ

キー名案：

```text
sumuquest:data:v1
```

保存データは JSON。

## 2. ルート構造

```json
{
  "version": 1,
  "settings": {},
  "services": [],
  "quests": [],
  "weeklyPlans": [],
  "progress": [],
  "templates": []
}
```

---

## 3. services

```json
{
  "id": "svc_uber",
  "name": "Uber",
  "baseRewardPerDelivery": 550,
  "deliveriesPerHour": 3.5,
  "enabled": true
}
```

項目：

| 項目 | 説明 |
|---|---|
| id | 内部ID |
| name | サービス名 |
| baseRewardPerDelivery | 平均基本報酬 |
| deliveriesPerHour | 平均件数/h |
| enabled | 表示対象か |

---

## 4. quests

### 4.1 共通構造

```json
{
  "id": "quest_001",
  "serviceId": "svc_uber",
  "title": "月〜木 期間クエスト",
  "kind": "period",
  "startDate": "2026-06-15",
  "endDate": "2026-06-18",
  "startTime": null,
  "endTime": null,
  "daysOfWeek": ["mon", "tue", "wed", "thu"],
  "milestones": [
    { "count": 60, "reward": 3160 },
    { "count": 80, "reward": 4340 },
    { "count": 100, "reward": 5680 }
  ],
  "repeatBonus": null,
  "selectedGoalCount": 80,
  "notes": ""
}
```

### 4.2 kind

| kind | 意味 |
|---|---|
| period | 期間クエスト |
| time | 時間帯クエスト |
| weather | 荒天クエスト |
| daily | 終日追加報酬 |
| other | その他 |

### 4.3 milestones

「達成件数 → 累計報酬」。

```json
[
  { "count": 3, "reward": 300 },
  { "count": 6, "reward": 600 },
  { "count": 12, "reward": 1500 }
]
```

### 4.4 repeatBonus

```json
{
  "startCount": 4,
  "endCount": 20,
  "bonusPerDelivery": 200
}
```

固定マイルストーンの最後の報酬額を起点に、startCount から endCount まで bonusPerDelivery を加算する。

---

## 5. weeklyPlans

```json
{
  "id": "plan_2026w25",
  "weekStartDate": "2026-06-15",
  "workSlots": [
    {
      "day": "mon",
      "enabled": true,
      "slots": [
        { "start": "10:00", "end": "15:00" },
        { "start": "17:00", "end": "21:30" }
      ],
      "manualDeliveryCount": null
    },
    {
      "day": "wed",
      "enabled": false,
      "slots": [],
      "manualDeliveryCount": 0
    }
  ]
}
```

### manualDeliveryCount

null の場合は自動計算。  
数値がある場合は上書き。

---

## 6. progress

```json
{
  "id": "progress_001",
  "questId": "quest_001",
  "serviceId": "svc_uber",
  "actualDeliveries": 52,
  "actualRevenue": 28600,
  "updatedAt": "2026-06-17T22:00:00+09:00"
}
```

---

## 7. templates

```json
{
  "id": "tpl_full_week",
  "name": "昼夜フル稼働",
  "workSlots": []
}
```

---

## 8. AI抽出テキスト入力フォーマット

AIからの出力は、JSONではなく人間にも読めるキー・バリュー形式を基本とする。

### 8.1 期間クエスト

```text
QUEST_TYPE: PERIOD
SERVICE: Uber
TITLE: 月〜木 期間クエスト
PERIOD: MON_THU
START_DATE: 2026-06-15
END_DATE: 2026-06-18

60=3160
80=4340
100=5680
120=6410
```

### 8.2 時間帯クエスト

```text
QUEST_TYPE: TIME
SERVICE: Uber
TITLE: 月曜昼クエスト
DAY: MON
START: 10:00
END: 15:00

3=300
6=600
12=1500
```

### 8.3 荒天クエスト

```text
QUEST_TYPE: WEATHER
SERVICE: Uber
TITLE: 雨クエスト
DAY: MON
START: 17:00
END: 21:30

1=200
2=300
3=600

REPEAT_START=4
REPEAT_END=20
REPEAT_BONUS=200
```

### 8.4 終日追加報酬

```text
QUEST_TYPE: DAILY
SERVICE: 出前館
TITLE: 終日追加報酬
DAY: SAT

REPEAT_START=1
REPEAT_END=999
REPEAT_BONUS=100
```

### 8.5 複数クエスト

複数クエストを貼る場合は `---` で区切る。

```text
QUEST_TYPE: PERIOD
SERVICE: Uber
PERIOD: MON_THU

60=3160
80=4340

---
QUEST_TYPE: TIME
SERVICE: Uber
DAY: MON
START: 10:00
END: 15:00

3=300
6=600
12=1500
```

---

## 9. パース時の仕様

- 空行は無視
- `#` で始まる行はコメントとして無視
- `KEY: VALUE` をメタ情報として扱う
- `数値=数値` をマイルストーンとして扱う
- 不明なKEYは警告として表示
- 必須項目が不足している場合は登録前プレビューで警告
- AI入力は即保存しない
- 必ずプレビュー → ユーザー確認 → 登録
