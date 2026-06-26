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

## 🌟 主な特徴

- **Design**: 洗練されたパステルピンクの配色とグラスモーフィズムUI
- **Experience**: `dnd-kit` によるストレスのないドラッグ＆ドロップと自動移動機能
- **Logic**: 3段階の難易度（入門・通常・上級）、ヒント、やり直し（Undo）機能を完備
- **Animation**: `Framer Motion` による弾むようなカードの動きと、勝利時の華やかなコンフェッティ演出

## 🛠 使用技術

- **Core**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS
- **Interaction**: dnd-kit
- **Animation**: Framer Motion（カードの動き、勝利時のコンフェッティ演出）
- **Icons**: Lucide React

---

## 🚀 環境構築 (Local Setup)

### 1. 前提条件
- **Node.js**: v18.0.0 以上推奨

### 2. インストール
リポジトリをクローンし、ディレクトリ内で以下のコマンドを実行します。

```bash
git clone https://github.com/sawahotaru/kawaii-elegant-solitaire.git
cd kawaii-elegant-solitaire
npm install
```

> ⚠️ **フォルダ名に関する注意**: プロジェクトを置くパスに `&` などのシェル特殊文字が含まれていると、`npm run dev` / `npm run build` がパス解決に失敗することがあります（特に Windows / PowerShell）。`&` を含まないフォルダ名（例: `kawaii-elegant-solitaire`）に配置してください。

### 3. 開発サーバーの起動
ローカルで動作を確認するには、以下のコマンドを実行して `http://localhost:5173` にアクセスします。

```bash
npm run dev
```

---

## 🏗 本格運用・ビルド (Production Build)

本番環境用に最適化されたファイルを生成するには、以下の手順を実行します。

### 1. ビルドの実行
```bash
npm run build
```
実行後、プロジェクトルートに `dist` フォルダが生成されます。

### 2. デプロイ

**A. GitHub Pages（自動・推奨／無料・サーバー不要）**
本リポジトリには `.github/workflows/deploy.yml` が含まれており、`main` ブランチへの push で自動的にビルド＆公開されます。初回のみ以下を設定してください：

1. GitHub にリポジトリを作成して push
2. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に変更
3. 以後 push するたびに `https://sawahotaru.github.io/kawaii-elegant-solitaire/` が自動更新されます

**B. その他のホスティング（Vercel / Netlify / Cloudflare Pages など）**
いずれも無料枠で利用できます。ビルド設定は `Build command: npm run build` / `Output directory: dist` を指定するだけです。手動の場合は `npm run build` で生成された `dist` フォルダをアップロードします。

---

## 📂 プロジェクト構造 (Brief)

- `src/components/`: UIコンポーネント（カード、パイル、紙吹雪など）
- `src/hooks/`: ゲームロジックを管理するカスタムフック (`useGameState.ts`)
- `src/utils/`: 純粋なロジック関数（シャッフル、ルール判定）
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
