# Kawaii & Elegant Solitaire 🎀✨

![License: MIT](https://img.shields.io/badge/License-MIT-ff9ec3.svg)
![React](https://img.shields.io/badge/React-18-61dafb.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6.svg)
![Vite](https://img.shields.io/badge/Vite-5-646cff.svg)

パステルカラーと心地よいアニメーションを融合させた、究極に「Kawaii」ソリティアゲームです。  
最新のWeb技術を駆使し、滑らかな操作性と安定したゲームプレイを提供します。

## 🎮 今すぐ遊ぶ（ライブデモ）

<p align="center">
  <a href="https://sawahotaru.github.io/kawaii-elegant-solitaire/">
    <img src="https://img.shields.io/badge/▶_PLAY_NOW-Live_Demo-ff9ec3?style=for-the-badge&logo=github&logoColor=white" alt="Play Now" />
  </a>
</p>

### 🎮 ▶ [今すぐ遊ぶ（ライブデモ）](https://sawahotaru.github.io/kawaii-elegant-solitaire/)

> サーバー不要・インストール不要。ブラウザで今すぐプレイできます 🌸
> `main` ブランチへ push するたびに GitHub Actions が自動でビルド＆デプロイします。

![Kawaii & Elegant Solitaire スクリーンショット](assets/screenshot.png)

---

## 🌟 主な特徴

- **Design**: 洗練されたパステルピンクの配色とグラスモーフィズムUI、レスポンシブ対応（スマホ最適化）
- **Difficulty**: 3段階の難易度（初心者 / 中級 / 上級）。**初心者・中級は「必ずクリアできる盤面」のみを出題**（内蔵ソルバーが可解性を判定）。上級は純ランダムの挑戦モード
- **Assist**: ヒント（回数は設定で選択可）、やり直し（Undo）、**一括あがり（オートコンプリート）**、**初心者限定の「神の手」（好きなカードと入れ替え）**
- **Experience**: `dnd-kit` によるストレスのないドラッグ＆ドロップと、ダブルクリックでの自動移動
- **Animation**: `Framer Motion` による弾むようなカードの動きと、勝利時のファンファーレ＋華やかな紙吹雪演出

## 🛠 使用技術

- **Core**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS
- **Interaction**: dnd-kit
- **Animation**: Framer Motion（カードの動き、勝利時の紙吹雪演出）
- **Audio**: Web Audio API（BGM・効果音・勝利ファンファーレ。既定はミュート）
- **Icons**: Lucide React

---

## 🎯 難易度とアシスト機能

### 難易度（ヘッダーで切替・選択は自動保存）

| 難易度 | 配り | めくり | Undo | ヒント既定 | 特徴 |
|---|---|---|---|---|---|
| 初心者 | 必ず解ける（やさしい）盤面 | 1枚 | 無制限 | 無制限 | **「神の手」**（好きなカードと入れ替え）が使える |
| 中級 | 必ず解ける盤面 | 1枚 | たっぷり | 3回 | 標準的な歯ごたえ |
| 上級 | 純ランダム（解けない局もあり） | 3枚 | 少なめ | 1回 | 挑戦モード |

> 「必ず解ける盤面」は、内蔵ソルバー（[`src/utils/solver.ts`](src/utils/solver.ts)）が配布時に**実際に勝ち筋を探索**し、解けた盤面のみを採用することで実現しています。これにより初心者・中級では「理不尽な詰み」を回避できます。色の偏り等はあくまで正しい一様シャッフルの結果で、難易度操作はありません。

### アシスト

- **ヒント上限の設定**: ヘッダーで `自動 / 3 / 5 / 10 / ∞` を選択（全難易度に適用・自動保存）。`自動` は難易度準拠
- **一括あがり**: すべてのカードが表向きになると「✨ 一括あがり」ボタンが出現。残りを自動で組札へ送ってクリアします
- **「神の手」（初心者限定のズル）**: 画面右下の🪄「神の手」ボタン → 盤面の表向きカードをタップ → 欲しいカードを選ぶと2枚を入れ替え（組札のカードは対象外、Undoで取り消し可）
- **BGM / 効果音**: 既定はミュート。ヘッダーのスピーカーアイコンでオン（クリア時はファンファーレ）

---

## 🚀 導入方法

### 方法1: ローカルで開発する
**前提**: Node.js v18.0.0 以上を推奨。

```bash
git clone https://github.com/sawahotaru/kawaii-elegant-solitaire.git
cd kawaii-elegant-solitaire
npm install      # 依存をインストール
npm run dev      # 開発サーバー起動 → http://localhost:5173
```

> ⚠️ **フォルダ名に関する注意**: パスに `&` などのシェル特殊文字が含まれると、`npm run dev` / `npm run build` がパス解決に失敗することがあります（特に Windows / PowerShell）。`&` を含まないフォルダ名（例: `kawaii-elegant-solitaire`）に配置してください。

### 方法2: GitHub Pages（公開済み）
このリポジトリは GitHub Pages ですでに公開済みです。インストール不要、下記URLからすぐに遊べます：

▶ **https://sawahotaru.github.io/kawaii-elegant-solitaire/**

---

## 📂 プロジェクト構造 (Brief)

- `src/components/`: UIコンポーネント（カード、パイル、紙吹雪など）
- `src/hooks/`: ゲームロジックを管理するカスタムフック (`useGameState.ts`)
- `src/utils/`: 純粋なロジック関数（シャッフル、ルール判定、可解判定ソルバー `solver.ts`、効果音 `audio.ts`）
- `src/types/`: TypeScriptの型定義

---

## 📝 開発の記録
詳細な開発の経緯やバグ修正の履歴については、[DEVELOPMENT_LOG.md](./DEVELOPMENT_LOG.md) を参照してください。

---

## 🤝 コントリビュート
Issue や Pull Request を歓迎します。バグ報告・機能提案はお気軽にどうぞ。

## 📄 ライセンス
本プロジェクトは [MIT License](./LICENSE) のもとで公開されています。商用・改変・再配布を含め、自由にご利用いただけます。

---

Enjoy your Kawaii Solitaire! 🌸🎮
