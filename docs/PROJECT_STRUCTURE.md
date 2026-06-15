# 推奨プロジェクト構成

## 単一HTML版

小規模に始める場合。

```text
/
├─ index.html
├─ style.css
├─ app.js
├─ README.md
├─ SPEC.md
├─ DATA_FORMAT.md
├─ CALC_RULES.md
├─ UI.md
├─ AI_IMPORT.md
└─ CODEX_TASK.md
```

## Vite/React版

拡張性を重視する場合。

```text
/
├─ package.json
├─ index.html
├─ src/
│  ├─ main.jsx
│  ├─ App.jsx
│  ├─ components/
│  ├─ screens/
│  ├─ domain/
│  │  ├─ quest.js
│  │  ├─ calculation.js
│  │  ├─ parser.js
│  │  └─ storage.js
│  └─ styles/
├─ public/
└─ docs/
   ├─ SPEC.md
   ├─ DATA_FORMAT.md
   ├─ CALC_RULES.md
   ├─ UI.md
   ├─ AI_IMPORT.md
   └─ ACCEPTANCE_TESTS.md
```

## 推奨

初期版は単一HTML/CSS/JSでも可。  
ただし計算ロジックは関数として分離すること。

最低限分けたい責務：

| ファイル | 役割 |
|---|---|
| app.js | 画面制御 |
| storage.js | LocalStorage |
| parser.js | AI抽出テキスト解析 |
| calculation.js | 売上・時給・達成判定 |
| quest.js | クエスト展開・報酬計算 |

単一ファイルで始める場合も、コード内でセクション分けすること。
