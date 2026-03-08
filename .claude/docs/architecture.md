# システムアーキテクチャ

## 概要

Mnemo は Claude Code 向けのナレッジ管理システム。開発中に得た知見（落とし穴、教訓、パターン等）をベクトルDBに蓄積し、セマンティック検索で再利用する。MCP サーバーと CLI のデュアルインターフェースを持つ。

## 設計判断

- **LanceDB を採用**: 組み込み型ベクトルDB。外部サービス不要で、ファイルベースのため移植性が高い。ただし行単位の UPDATE がないため delete + re-add パターンで代替。
- **Ollama でローカル埋め込み**: プライバシー保護のためクラウドAPI不使用。`nomic-embed-text` モデルでテキストをベクトル化。
- **MCP + CLI デュアルインターフェース**: Claude Code からは MCP ツール経由、ターミナルからは CLI 経由。同じ core 層を共有。
- **ファイルベースのドキュメント**: `.claude/docs/` に Markdown ファイルとして保存。git 管理可能で Claude Code が直接読める。

## 構成

```
src/
├── core/                    # ビジネスロジック層
│   ├── knowledge-store.ts   # learn/recall/stats/decayConfidence
│   ├── task-store.ts        # タスク CRUD + ツリー構造
│   ├── project-store.ts     # プロジェクト登録・検出
│   ├── hybrid-search.ts     # Vector + FTS → RRF → スコアリング
│   ├── claude-md-generator.ts # CLAUDE.md マーカーベース生成
│   ├── doc-store.ts         # 仕様ドキュメント CRUD
│   ├── profile-store.ts     # ユーザープロフィール管理（ファイルベース）
│   ├── backup.ts            # バックアップ・リストア・起動時メンテナンス
│   ├── exporter.ts          # Markdown エクスポート
│   └── obsidian-exporter.ts # Obsidian Vault エクスポート
├── db/                      # データベース層
│   ├── lance-client.ts      # LanceDB 接続 + knowledge テーブル操作
│   ├── project-client.ts    # projects / tasks テーブル操作
│   ├── schema.ts            # knowledge テーブルスキーマ定義
│   └── project-schema.ts    # projects / tasks スキーマ定義
├── embedding/
│   └── ollama.ts            # Ollama HTTP クライアント（埋め込みベクトル生成）
├── types/
│   └── index.ts             # 全型定義 + getConfig()
└── index.ts                 # MCP サーバーエントリポイント（全ツール定義）

bin/
└── mnemo.ts                 # CLI エントリポイント（Commander.js）

hooks/
├── hooks.json               # Claude Code フック定義
├── session-start.sh         # セッション開始時に知識を自動リコール
└── post-tool-use.sh         # Bash 実行後のエラー検出・コミット検出

.claude/
├── docs/                    # プロジェクト仕様ドキュメント
│   └── index.json           # ドキュメントメタデータ
├── skills/
│   ├── learn/SKILL.md       # /learn スキル
│   ├── research/SKILL.md    # /research スキル（Web+Context7調査→reference保存）
│   ├── session-review/SKILL.md # /session-review スキル
│   ├── doc/SKILL.md         # /doc スキル
│   └── code-reuse-finder/SKILL.md # /code-reuse-finder スキル
└── settings.local.json      # Bash コマンドホワイトリスト
```

## データフロー

```
ユーザー入力
    │
    ├─ MCP ツール ──→ src/index.ts ──→ core 層 ──→ db 層 ──→ LanceDB (~/.mnemo/lancedb/)
    │                                    │
    └─ CLI ─────────→ bin/mnemo.ts ──→ core 層 ──→ db 層 ──→ LanceDB
                                         │
                                         ├─→ Ollama API (埋め込みベクトル生成)
                                         ├─→ .claude/docs/ (仕様ドキュメント)
                                         └─→ ~/.mnemo/profile.json (ユーザープロフィール)
```

## 主要なインターフェース

### データベーステーブル

| テーブル | 用途 | 特殊機能 |
|---------|------|---------|
| `knowledge` | 知識エントリ | ベクトル検索 + FTS |
| `projects` | プロジェクト登録 | パス検出 |
| `tasks` | タスク管理 | 親子階層 |

### 型定義（src/types/index.ts）

- `KnowledgeEntry` — 知識エントリ（vector, confidence, accessCount 含む）
  - `type`: lesson / pitfall / preference / pattern / solution / reference
  - reference 固有フィールド: `rawContent`（全文キャッシュ）, `sourceUrl`, `sourceType`（web/context7）, `fetchedAt`, `ttlDays`
- `ProjectEntry` — プロジェクト（name, path, techStack）
- `TaskEntry` — タスク（status, priority, parentId で階層化）
- `UserProfile` — ユーザープロフィール（identity/technical/tools/communication/codingStyle/customNotes）
- `DocEntry` / `DocIndex` — 仕様ドキュメントメタデータ

## 注意点・制約

- **LanceDB limit デフォルト 10 件**: `query().toArray()` は明示的に `.limit(10000)` を指定しないと 10 件しか返さない
- **CamelCase カラム名にはバッククォート必須**: `where(\`projectId\` = 'value')` — バッククォートなしだと小文字変換される
- **FTS インデックスは再構築が必要**: データ追加後に `replace: true` で再作成しないと新データが検索にヒットしない
- **Ollama 依存**: 埋め込み生成に Ollama が起動している必要がある。停止中は knowledge 関連操作が全て失敗する
- **delete + re-add パターン**: LanceDB に UPDATE がないため、更新は削除→再追加。クラッシュ時の不整合リスクあり
- **スキーマ進化は読み取り時正規化**: 新カラム追加時、古い行は `undefined` → `normalizeKnowledgeEntry()` でデフォルト値を埋めて後方互換を維持
- **ユーザープロフィールはファイルベース**: `~/.mnemo/profile.json` に単一JSONファイルで保存。LanceDB不使用、信頼度減衰なし。セッション開始時にhookで自動注入、CLAUDE.mdにも出力

## 関連

- ハイブリッド検索の詳細: `.claude/docs/hybrid-search.md`
- 信頼度減衰の仕組み: `.claude/docs/confidence-decay.md`
- CLAUDE.md 生成: `.claude/docs/claude-md-generation.md`
- MCP ツール一覧: `.claude/docs/mcp-tools.md`
