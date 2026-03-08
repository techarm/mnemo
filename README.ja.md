# Mnemo

[English](README.md)

[Claude Code](https://docs.anthropic.com/en/docs/claude-code) 用のナレッジ記憶システム。

Mnemo は Claude Code がセッション間で学んだことを記憶できるようにします。教訓、落とし穴、パターン、解決策をローカルのベクトルデータベースに保存し、セマンティック検索で関連するナレッジを自動的に次のセッションに注入します。

## 特徴

- **セマンティックナレッジ検索** — ベクトル検索 + 全文検索のハイブリッド検索（Reciprocal Rank Fusion スコアリング）
- **7つのナレッジタイプ** — lesson, pitfall, pattern, preference, solution, reference, procedure
- **信頼度減衰** — 古い・使われないナレッジは自然に薄れ、よくアクセスされるナレッジは鮮度を保つ
- **CLAUDE.md 自動生成** — 蓄積されたナレッジからプロジェクトコンテキストを自動メンテナンス
- **セッション継続性** — セッションログが会話間のコンテキストを橋渡し
- **ユーザープロフィール** — ツール、コーディングスタイル、コミュニケーション言語などの永続的な設定
- **セットアップ手順** — ツールのセットアップガイドを保存し、プロジェクト横断で再利用
- **Obsidian エクスポート** — ナレッジベースを wikilinks とフロントマター付きで Obsidian vault にエクスポート
- **MCP + CLI** — Claude Code（MCP ツール）からもターミナル（CLI コマンド）からも利用可能

## 前提条件

- **Node.js** 18+
- **Ollama** + `nomic-embed-text` モデル（ローカル埋め込み生成用）

[ollama.com](https://ollama.com/download) から Ollama をインストール後：

```bash
ollama pull nomic-embed-text
```

## インストール

```bash
npm install -g @techarm/mnemo
```

## セットアップ

### プロジェクトセットアップ（初めての方におすすめ）

1つのプロジェクト用に Mnemo を設定します。MCP サーバー、フック、スキルをプロジェクト内に設定します：

```bash
cd your-project
mnemo init
```

実行されること：
- `.mcp.json` に MCP サーバー設定を追加
- `.claude/hooks/` にフックスクリプトをコピー
- `.claude/settings.json` にフック設定を追加
- `.claude/skills/` にスキル定義をコピー
- プロジェクトを Mnemo に登録

### グローバルセットアップ（全プロジェクト）

全ての Claude Code セッションで Mnemo を使えるようにグローバル設定します：

```bash
mnemo init --global
```

実行されること：
- `claude mcp add --scope user` で MCP サーバーをグローバル登録
- `~/.mnemo/hooks/` にフックスクリプトをコピー
- `~/.claude/settings.json` にフック設定を追加

> **注意:** スキル（スラッシュコマンド）はプロジェクト固有です。スキルを追加するには各プロジェクトで `mnemo init` を実行してください。

### 設定の削除

現在のプロジェクトから Mnemo の設定を削除：

```bash
mnemo cleanup
```

グローバル設定を削除：

```bash
mnemo cleanup --global
```

> **注意:** `cleanup` は設定のみを削除します。`~/.mnemo/` のナレッジデータは保持されます。

## 使い方

`mnemo init` を実行したら、プロジェクトで Claude Code を起動するだけです。Mnemo は3つの仕組みで動作します：

1. **フック** — セッション開始時にコンテキストを自動注入し、作業中のイベントを検知
2. **MCP ツール** — Claude Code がバックグラウンドで Mnemo のツールを呼び出す（検索、保存、生成）
3. **スキル** — ナレッジの記録・整理のためのスラッシュコマンド

### ワークフロー

```
セッション開始（自動）
  ├─ ユーザープロフィールを注入（名前、ツール、コーディングスタイル）
  ├─ このプロジェクトに関連するナレッジを検索
  └─ 前回のセッションサマリーを表示
        ↓
作業中
  ├─ /learn — 気づきや落とし穴を記録
  ├─ /research — トピックを調査し、リファレンスとして保存
  ├─ /setup — ツールのセットアップを調査し、再利用可能な手順として保存
  ├─ /doc — プロジェクト仕様ドキュメントを作成・更新
  └─ 自動検知: コミット → タスク完了の提案
        ↓
セッション終了
  └─ /session-review — 学びを抽出、タスク・ドキュメント更新、セッションログ記録
```

### スキル

#### `/learn`

現在のセッションからナレッジを抽出して記録します。Mnemo がタイプ（lesson, pitfall, pattern, solution など）を自動判定します。

```
You: /learn LanceDB query() has a default limit of 10
```

#### `/research [トピック]`

Web 検索または Context7（ライブラリドキュメント）でトピックを調査し、有効期限付きのリファレンスとして保存します。

```
You: /research React 19 Server Components
```

#### `/setup [ツール]`

初回：ツールのセットアップを調査 → ステップに整理 → 永続的な手順として保存。
2回目以降：保存された手順を取得して実行。

```
You: /setup oxlint
```

#### `/doc [トピック]` または `/doc init`

`.claude/docs/` にプロジェクト仕様ドキュメントを作成・更新します。

- `/doc init` — コードベースを調査して初期ドキュメントを自動生成
- `/doc authentication` — 特定のドキュメントを作成・更新

#### `/session-review`

セッション終了時のレビュー：

1. セッションからナレッジ（落とし穴、教訓、解決策）を抽出
2. 完了したタスクをマーク
3. プロジェクトドキュメントの更新が必要か確認
4. 最新のナレッジで CLAUDE.md を再生成
5. 次のセッションの継続性のためにセッションログを記録

#### `/code-reuse-finder`

重複したコードパターンをスキャンし、リファクタリングの機会を提案します。

## CLI の使い方

### ナレッジの記録

```bash
# 教訓を記録
mnemo learn "Always use explicit limit with LanceDB" \
  -t pitfall \
  -c "LanceDB query().toArray() defaults to limit(10). Use .limit(N) explicitly." \
  -p my-project \
  --tags lancedb,query

# 解決策を記録
mnemo learn "Fix Docker build cache" \
  -t solution \
  -c "Add --no-cache flag to docker build when dependencies change."
```

### ナレッジの検索

```bash
# セマンティック検索
mnemo recall "database query performance"

# タイプでフィルタ
mnemo recall "setup" -t procedure

# プロジェクトでフィルタ
mnemo recall "authentication" -p my-app
```

### プロジェクト管理

```bash
# プロジェクトを登録
mnemo project register my-app --path /path/to/my-app --lang typescript

# カレントディレクトリからプロジェクトを検出
mnemo project detect

# プロジェクト一覧
mnemo project list
```

### タスク管理

```bash
# タスクを追加
mnemo task add "Implement user auth" -p my-app --priority high

# タスク一覧
mnemo task list -p my-app

# タスクを完了
mnemo task done <task-id>
```

### その他のコマンド

```bash
# 統計情報を表示
mnemo stats

# プロジェクトの CLAUDE.md を生成
mnemo generate my-project

# Markdown にエクスポート
mnemo export

# Obsidian vault にエクスポート
mnemo export -f obsidian

# ユーザープロフィール管理
mnemo profile show
mnemo profile set tools linter oxlint
mnemo profile set communication language Japanese

# バックアップ・リストア
mnemo backup create
mnemo backup restore <path>

# セッションログ
mnemo session list -p my-project
mnemo session recent -p my-project
```

## MCP ツール（Claude Code）

MCP サーバーとして接続すると、Claude Code は以下のツールを使用できます：

| ツール | 説明 |
|--------|------|
| `mnemo_learn` | ナレッジを保存（lesson, pitfall, pattern, solution, reference, procedure） |
| `mnemo_recall` | セマンティック + キーワードのハイブリッド検索 |
| `mnemo_project` | プロジェクトの登録、一覧、検出 |
| `mnemo_task` | タスク管理（追加、一覧、更新、完了） |
| `mnemo_doc` | プロジェクト仕様ドキュメントの作成・更新 |
| `mnemo_generate` | 蓄積されたナレッジから CLAUDE.md を生成 |
| `mnemo_profile` | ユーザープロフィール管理（ID、ツール、コーディングスタイル） |
| `mnemo_backup` | バックアップの作成・リストア |
| `mnemo_stats` | ナレッジベースの統計情報を表示 |
| `mnemo_export` | Markdown または Obsidian にエクスポート |
| `mnemo_delete` | ナレッジ、タスク、プロジェクトの削除 |

## スキル（スラッシュコマンド）

| スキル | コマンド | 説明 |
|--------|---------|------|
| Learn | `/learn` | 現在のセッションからナレッジを抽出・記録 |
| Research | `/research` | Web/Context7 でトピックを調査し、リファレンスとして保存 |
| Setup | `/setup` | ツールのセットアップを調査し、手順として保存・再利用 |
| Session Review | `/session-review` | セッション終了レビュー: 学びの抽出、タスク・ドキュメント更新 |
| Doc | `/doc` | プロジェクト仕様ドキュメントの作成・更新 |
| Code Reuse Finder | `/code-reuse-finder` | コードの重複・再利用機会をスキャン |

## 設定

Mnemo は環境変数で設定できます：

| 変数 | デフォルト | 説明 |
|------|----------|------|
| `MNEMO_DATA_DIR` | `~/.mnemo` | データ保存ディレクトリ（LanceDB、セッション、プロフィール） |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API エンドポイント |
| `EMBED_MODEL` | `nomic-embed-text` | 埋め込みモデル名 |

## アーキテクチャ

```
ユーザー入力
    |
    +-- MCP ツール --> src/index.ts --> コアレイヤー --> LanceDB (~/.mnemo/)
    |                                      |
    +-- CLI ---------> bin/mnemo.ts --> コアレイヤー --> Ollama (埋め込み)
                                           |
                                           +--> .claude/docs/ (プロジェクト仕様)
                                           +--> ~/.mnemo/profile.json (ユーザープロフィール)
                                           +--> ~/.mnemo/sessions/ (セッションログ)
```

**技術スタック:** TypeScript, LanceDB（組み込みベクトル DB）, Ollama（ローカル埋め込み）, MCP SDK

## ライセンス

[MIT](LICENSE)
