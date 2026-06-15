# AI抽出テキスト入力仕様

## 1. 目的

Uberアプリのスクリーンショットを Gemini / ChatGPT などに読ませ、クエスト情報を指定フォーマットで出力してもらう。  
Webアプリはそのテキストを貼り付けて解析する。

アプリ内OCRは実装しない。

---

## 2. 運用フロー

1. Uberアプリでクエスト画面をスクリーンショット保存
2. Gemini / ChatGPT に画像を添付
3. 専用プロンプトを貼る
4. AIが指定形式でクエスト情報を出力
5. Webアプリの「AI抽出テキスト貼り付け」に貼る
6. アプリが解析
7. プレビュー表示
8. ユーザーが確認・修正
9. 登録

---

## 3. AIに出力させる形式

JSONは使わない。  
人間が読める KEY: VALUE 形式にする。

理由：

- JSONは壊れやすい
- AI出力の修正が面倒
- 人間が見て誤読を確認しづらい

---

## 4. 共通ルール

- クエストごとに `QUEST_TYPE` を書く
- 複数クエストは `---` で区切る
- 金額は円記号やカンマを除いた数値
- 時刻は `10:00` 形式
- 曜日は `MON`, `TUE`, `WED`, `THU`, `FRI`, `SAT`, `SUN`
- 不明な項目は `UNKNOWN` と書く
- 読み取れない数字を推測しない

---

## 5. Gemini / ChatGPT 用プロンプト

```text
添付したUberアプリのスクリーンショットから、クエスト情報を読み取ってください。

以下のルールを厳守してください。

- 読み取れた情報だけを出力する
- 推測で補完しない
- 金額は円記号とカンマを除いた数値にする
- 複数のクエストがある場合は --- で区切る
- 出力は下記フォーマットのみ
- 説明文や感想は書かない
- 読み取れない項目は UNKNOWN と書く

期間クエストの場合:

QUEST_TYPE: PERIOD
SERVICE: Uber
TITLE: 任意の短い名前
PERIOD: MON_THU または FRI_SUN または UNKNOWN
START_DATE: YYYY-MM-DD または UNKNOWN
END_DATE: YYYY-MM-DD または UNKNOWN

件数=報酬
件数=報酬

時間帯クエストの場合:

QUEST_TYPE: TIME
SERVICE: Uber
TITLE: 任意の短い名前
DAY: MON/TUE/WED/THU/FRI/SAT/SUN または UNKNOWN
START: HH:MM または UNKNOWN
END: HH:MM または UNKNOWN

件数=報酬
件数=報酬

荒天・変則クエストの場合:

QUEST_TYPE: WEATHER
SERVICE: Uber
TITLE: 任意の短い名前
DAY: MON/TUE/WED/THU/FRI/SAT/SUN または UNKNOWN
START: HH:MM または UNKNOWN
END: HH:MM または UNKNOWN

件数=累計報酬
件数=累計報酬

一定件数以降、1件ごとに同額が加算される場合だけ、以下も追加してください。

REPEAT_START=開始件数
REPEAT_END=終了件数
REPEAT_BONUS=1件ごとの追加額
```

---

## 6. 出力例

### 6.1 期間クエスト

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

### 6.2 時間帯クエスト

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

### 6.3 荒天クエスト

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

---

## 7. アプリ側の解析仕様

### 7.1 解析

- `KEY: VALUE` をメタ情報として読む
- `数値=数値` をマイルストーンとして読む
- `REPEAT_START` などは継続ボーナスとして読む
- `---` でクエストを分割する

### 7.2 バリデーション

警告対象：

- QUEST_TYPE 不明
- SERVICE 不明
- 件数・報酬が空
- 報酬が単調増加していない
- 件数が昇順でない
- START が END より後
- UNKNOWN が含まれる

### 7.3 登録前プレビュー

AI入力は即保存しない。  
必ずプレビューを出す。

プレビューで可能にする操作：

- タイトル修正
- 種別修正
- 日付修正
- 時刻修正
- 件数・報酬修正
- 登録
- キャンセル
