# CLAUDE.md 自動生成

## 概要

Mnemo に蓄積された知識・タスク・ドキュメントを CLAUDE.md に自動反映する仕組み。マーカーベースの部分更新により、ユーザーが手書きした部分を保護しつつ、Mnemo 管理部分だけを更新する。

## 設計判断

- **マーカーベース（MNEMO:START / MNEMO:END）**: CLAUDE.md 全体を上書きせず、マーカーで囲まれた部分のみ置換。ユーザーが手書きした部分（プロンプト指示、ルール等）は一切変更されない
- **マーカーがない場合は末尾に追記**: 既存の CLAUDE.md にマーカーがなければ末尾にセクションを追加。マーカーがあれば置換
- **confidence >= 0.5 フィルタ**: 信頼度が低い（古い・使われていない）知識は CLAUDE.md に表示しない。検索では見つかるが、AI が毎回読むコンテキストには含めない
- **タイプ別セクション分類**: pitfall → preference → pattern → lesson → solution → procedure → reference の固定順で表示。各タイプに絵文字アイコンを付与
- **ローカルタイムゾーン表示**: UTC の ISO文字列を手動でローカル時間に変換表示（`formatLocalTime()`）

## 構成

**ファイル:** `src/core/claude-md-generator.ts`

### 生成パイプライン

```
generateClaudeMdSection(projectName)
    │
    ├─→ getProject(projectName) でプロジェクト情報取得
    │
    ├─→ getAllKnowledgeEntries() で全知識取得
    │     → project === projectName || project === "" でフィルタ
    │     → confidence >= 0.5 でフィルタ
    │     → type ごとにグルーピング + updatedAt 降順ソート
    │
    ├─→ getTasksByProject() でタスク取得
    │     → status !== "done" のアクティブタスクのみ
    │     → in_progress → todo, 高 → 中 → 低 でソート
    │
    ├─→ getDocsSummary(projectName) でドキュメントサマリー取得
    │
    └─→ Markdown 組み立て
          │
          ├── MNEMO:START マーカー + 最終更新タイムスタンプ
          ├── ## プロジェクト情報（名前, 言語, フレームワーク, 技術スタック）
          ├── ## 📖 Project Docs（ドキュメント一覧・リンク）
          ├── ## ⚠️ Pitfalls / 🎯 Preferences / 📐 Patterns / 💡 Lessons / 🔧 Solutions / 📝 Procedures / 📚 References
          ├── ## 📋 Active Tasks
          └── MNEMO:END マーカー
```

### 書き出し処理

```
writeClaudeMd(projectName)
    │
    ├─→ generateClaudeMdSection() でセクション生成
    │
    └─→ CLAUDE.md ファイル処理
          │
          ├── ファイルが存在 + マーカーあり → マーカー間を置換
          ├── ファイルが存在 + マーカーなし → 末尾に追記
          └── ファイルが存在しない → 新規作成
```

### セクション構成

```markdown
<!-- MNEMO:START - この部分は Mnemo が自動生成します。手動で編集しないでください -->
<!-- 最終更新: 2026-03-07 21:30 -->

## プロジェクト情報
- **名前:** mnemo
- **言語:** TypeScript
- **フレームワーク:** Node.js
- **技術スタック:** LanceDB, Ollama, MCP

## 📖 Project Docs
### System Design
- **システムアーキテクチャ** (`.claude/docs/architecture.md`): 3テーブル構成...

### Features
- **ハイブリッド検索** (`.claude/docs/hybrid-search.md`): Vector+FTS→RRF...

## ⚠️ Pitfalls（既知の落とし穴）
- **LanceDB limitデフォルト10件**: query().toArray()は明示的に...

## 📋 Active Tasks
- [>] [高] MCPツール最適化
- [ ] [中] テスト追加

<!-- MNEMO:END -->
```

### タイプ別セクション設定

| タイプ | 絵文字 | ラベル |
|-------|------|------|
| pitfall | ⚠️ | Pitfalls（既知の落とし穴） |
| preference | 🎯 | Preferences（コーディング規約・好み） |
| pattern | 📐 | Patterns（確立されたパターン） |
| lesson | 💡 | Lessons（教訓） |
| solution | 🔧 | Solutions（解決策） |
| procedure | 📝 | Procedures（手順書） |
| reference | 📚 | References（参照知識） |

## 主要なインターフェース

```typescript
// セクションのみ生成（Markdown文字列を返す）
generateClaudeMdSection(projectName: string): Promise<string>

// ファイルに書き出し（マーカーベース部分更新）
writeClaudeMd(projectName: string): Promise<string>  // 書き出し先パスを返す
```

### 呼び出し元

- **MCP ツール**: `mnemo_generate`（`dryRun` オプションでプレビュー可能）
- **CLI**: `mnemo generate [project]`（`--dry-run` フラグ対応）
- **スキル**: `/session-review` の Step 4 で CLAUDE.md 更新

## 注意点・制約

- **グローバル知識も含む**: `project === ""` の知識はどのプロジェクトの CLAUDE.md にも表示される
- **content は200文字でトリム**: 知識の本文が長い場合、200文字で切り詰めて一行表示
- **改行は空白に置換**: content 内の改行は半角スペースに変換して一行に
- **タスクは active のみ**: `status === "done"` のタスクは CLAUDE.md に表示されない
- **ドキュメントセクション**: `getDocsSummary()` が null を返した場合（ドキュメントが0件）はセクション自体を省略

## 関連

- ドキュメントサマリー生成: `src/core/doc-store.ts` の `getDocsSummary()`
- 信頼度によるフィルタ: `.claude/docs/confidence-decay.md`
- ドキュメントシステム: `.claude/docs/architecture.md`
