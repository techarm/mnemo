# MCPツール・CLIインターフェース

## 概要

Mnemo のデュアルインターフェース。MCPサーバー（Claude Code 向け）と CLI（ターミナル向け）が同じ core 層を共有し、同一機能を提供する。MCPツール（11個）は `src/index.ts`、CLI は `bin/mnemo.ts` に定義。

## 設計判断

- **アクションベースパターン**: 1ツール = 複数アクション（例: `mnemo_project` に register/list/get/detect）。ツール数を抑えつつ柔軟性を確保
- **共有 core 層**: MCP と CLI は同じ `src/core/` のビジネスロジックを呼び出す。ロジックの重複を防止
- **checkAndMigrate() を起動時に実行**: MCP サーバー起動時・CLI 実行時の両方で、スキーマ遷移チェック + 信頼度減衰を自動実行
- **短縮IDサポート**: git のショートハッシュと同様に、ID の先頭数文字でエントリを一意に特定可能（`resolveById` で前方一致）

## MCPツール一覧

**ファイル:** `src/index.ts`

### mnemo_learn

知識をベクトル DB に記録する。`reference` 型は Web 調査結果を TTL 付きで保存。

| パラメータ | 型 | 必須 | 説明 |
|-----------|---|------|------|
| type | enum | ✓ | lesson / pitfall / preference / pattern / solution / reference |
| title | string | ✓ | 短いタイトル |
| content | string | ✓ | 詳細な内容（要約。embedding に使用） |
| project | string | | プロジェクト名（省略でグローバル） |
| tags | string[] | | 分類タグ |
| language | string | | プログラミング言語 |
| framework | string | | フレームワーク |
| rawContent | string | | 取得した全文テキスト（reference 用。embedding には含めない） |
| sourceUrl | string | | 参照元 URL or Context7 libraryId |
| sourceType | enum | | web / context7 |
| ttlDays | number | | 有効期限日数（0 = 無期限） |

### mnemo_recall

ハイブリッド検索（セマンティック + キーワード）で知識を検索する。`id` 指定で rawContent を含む全情報を直接取得可能。

| パラメータ | 型 | 必須 | 説明 |
|-----------|---|------|------|
| query | string | | 検索クエリ（自然言語 or キーワード）。`id` 未指定時は必須 |
| id | string | | ID 直接指定（短縮ID可）。rawContent を含む全情報を返す |
| type | enum | | タイプでフィルタ（reference 含む） |
| project | string | | プロジェクトでフィルタ |
| language | string | | 言語でフィルタ |
| framework | string | | フレームワークでフィルタ |
| limit | number | | 最大結果数（デフォルト 10） |

### mnemo_project

プロジェクトの CRUD + 自動検出。

| アクション | 必須パラメータ | 説明 |
|-----------|-------------|------|
| register | name, path | プロジェクト登録（description, techStack, language, framework はオプション） |
| list | — | 登録済みプロジェクト一覧 |
| get | name | プロジェクト詳細情報 + 知識/タスク統計 |
| detect | path（省略で cwd） | パスからプロジェクトを自動検出 |

### mnemo_task

タスクの CRUD + 完了管理。

| アクション | 必須パラメータ | 説明 |
|-----------|-------------|------|
| add | project, title | タスク追加（priority, parentId, tags はオプション） |
| list | project | タスク一覧（status でフィルタ可能） |
| update | taskId | タスク更新（status, newTitle, newPriority） |
| done | taskId | タスクを完了に |

### mnemo_doc

プロジェクト仕様ドキュメントの CRUD。

| アクション | 必須パラメータ | 説明 |
|-----------|-------------|------|
| create | project, title, content, summary | ドキュメント作成（scope, relatedFiles, tags はオプション） |
| list | project | ドキュメント一覧 |
| get | project, id | ドキュメント内容取得 |
| update | project, id | ドキュメント更新（title, content, summary, scope 等） |
| delete | project, id | ドキュメント削除 |

### mnemo_generate

CLAUDE.md をプロジェクトの知識・タスク・ドキュメントから自動生成。

| パラメータ | 型 | 必須 | 説明 |
|-----------|---|------|------|
| project | string | ✓ | プロジェクト名 |
| dryRun | boolean | | true で書き出さずプレビュー |

### mnemo_backup

データのバックアップ・リストア。

| アクション | 必須パラメータ | 説明 |
|-----------|-------------|------|
| create | — | JSON バックアップ作成（path でカスタム出力先） |
| restore | path | バックアップからリストア（ベクトル再生成） |
| list | — | バックアップ一覧 |

### mnemo_stats

ナレッジベースの統計情報（タイプ別・プロジェクト別・言語別の件数）。パラメータなし。

### mnemo_export

ナレッジをエクスポート。2つのフォーマットをサポート。

| パラメータ | 型 | 必須 | 説明 |
|-----------|---|------|------|
| format | enum | | markdown（デフォルト）/ obsidian |
| outputDir | string | | 出力先ディレクトリ |
| type | enum | | タイプでフィルタ |
| project | string | | プロジェクトでフィルタ |

**markdown**: ナレッジのみをタイプ別のフラットファイルに出力（`~/.mnemo/exports/`）
**obsidian**: 全データ（knowledge/projects/tasks/docs）を Obsidian Vault 形式で出力（`~/.mnemo/obsidian-vault/`）。YAML frontmatter、`[[wikilinks]]`、タイプ別フォルダ構造、MOC インデックス付き。実装: `src/core/obsidian-exporter.ts`

### mnemo_profile

ユーザープロフィールの管理。グローバル設定（名前、ツール選好、コーディングスタイル等）を `~/.mnemo/profile.json` に永続化。信頼度減衰なし。

| アクション | 必須パラメータ | 説明 |
|-----------|-------------|------|
| show | — | プロフィール全体を Markdown で表示 |
| set | category, key, value | 値を設定（customNotes は key 不要） |
| get | category | カテゴリ全体を取得（key はオプションで個別取得） |
| delete | category, key | キーを削除（customNotes はクリア） |

**カテゴリ:** identity / technical / tools / communication / codingStyle / customNotes

### mnemo_delete

ナレッジ・タスク・プロジェクトの削除（短縮ID対応）。

| パラメータ | 型 | 必須 | 説明 |
|-----------|---|------|------|
| type | enum | ✓ | knowledge / task / project |
| id | string | ✓ | ID or 短縮ID |

## CLI コマンド一覧

**ファイル:** `bin/mnemo.ts`

```
mnemo learn <title>           知識を記録（-t type 必須）
mnemo recall <query>          知識を検索
mnemo stats                   統計情報表示
mnemo export                  エクスポート（-f obsidian で Obsidian Vault 形式）
mnemo generate [project]      CLAUDE.md 生成（--dry-run 対応）

mnemo project register <name> プロジェクト登録（--path 必須）
mnemo project list            プロジェクト一覧
mnemo project info <name>     プロジェクト詳細
mnemo project detect          現在ディレクトリから検出

mnemo task add <title>        タスク追加（-p project 必須）
mnemo task list               タスク一覧（-p or 自動検出）
mnemo task update <taskId>    タスク更新
mnemo task done <taskId>      タスク完了

mnemo doc create <title>      ドキュメント作成（-p, -s 必須）
mnemo doc list                ドキュメント一覧（-p or 自動検出）
mnemo doc get <id>            ドキュメント表示（-p 必須）
mnemo doc delete <id>         ドキュメント削除（-p 必須）

mnemo delete knowledge <id>   ナレッジ削除
mnemo delete task <id>        タスク削除
mnemo delete project <id>     プロジェクト削除（カスケード）

mnemo profile show            プロフィール表示
mnemo profile set <cat> <key> <val>  値を設定
mnemo profile get <cat> [key]        カテゴリ or キー取得
mnemo profile delete <cat> <key>     キー削除
mnemo profile reset --confirm        リセット（確認必須）
mnemo profile context                Hook用コンテキスト出力

mnemo backup create           バックアップ作成
mnemo backup restore <path>   バックアップリストア
mnemo backup list             バックアップ一覧
```

## スキル（Claude Code 用）

**ディレクトリ:** `.claude/skills/`

| スキル | コマンド | 概要 |
|-------|---------|------|
| learn | `/learn` | エラーや教訓から知識を抽出・記録（reference 型対応） |
| research | `/research` | Web Search + Context7 で調査し、結果を reference として永続化 |
| session-review | `/session-review` | セッション終了時の振り返り（知識・タスク・ドキュメント・CLAUDE.md） |
| doc | `/doc init` | 既存プロジェクトのドキュメント一括作成 |
| doc | `/doc [topic]` | 個別ドキュメントの作成・更新 |
| code-reuse-finder | `/code-reuse-finder` | コードベースの重複・共通化候補を検出してレポート |

## フック

**ディレクトリ:** `hooks/`

| フック | トリガー | 動作 |
|-------|---------|------|
| session-start.sh | セッション開始時 | プロフィール + 関連知識 + セッションログを自動表示 |
| post-tool-use.sh | Bash 実行後 | エラー検出 → /learn 提案、コミット検出 → /session-review 提案 |

## 注意点・制約

- **MCP は stdio 通信**: `StdioServerTransport` で stdin/stdout 経由。Claude Code が直接呼び出す
- **CLI は preAction フック**: Commander.js の `preAction` で `checkAndMigrate()` を実行。全コマンド実行前に起動時処理が走る
- **タスク list の自動検出**: CLI の `task list` と `doc list` は `-p` 省略時に `detectProject(cwd)` でプロジェクトを自動検出
- **formatLocalTime が重複**: `src/index.ts` と `bin/mnemo.ts` に同じヘルパー関数が存在。共通化未了

## 関連

- MCP + CLI の共有 core 層: `.claude/docs/architecture.md`
- ハイブリッド検索（recall の内部）: `.claude/docs/hybrid-search.md`
- CLAUDE.md 生成（generate の内部）: `.claude/docs/claude-md-generation.md`
