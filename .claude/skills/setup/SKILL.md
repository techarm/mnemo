---
name: setup
description: Research a tool/library setup procedure, organize into structured steps, and save as a procedure in Mnemo for future recall and execution.
argument-hint: "<tool or topic to set up>"
---

# Setup Procedure Research & Recording

Research how to set up a tool or library, organize the findings into a structured procedure, and save it to Mnemo for future use.

## Your Task

Given the user's input (`$ARGUMENTS`), do the following:

1. **Check for existing procedures**: Use `mnemo_recall(query: $ARGUMENTS, type: "procedure")` to check if a procedure already exists.

   **If found** → Execute mode:
   - Get full procedure: `mnemo_recall(id: <found-id>)` to retrieve `rawContent`
   - Show the procedure title and summary to the user
   - Execute each step sequentially in the current project context, adapting commands based on profile (e.g., use pnpm if profile.tools.packageManager is pnpm)
   - Ask before destructive steps (overwriting config files, etc.)
   - After execution, report what was done
   - If the user asks to update the procedure, proceed to research (Step 3)

   **If not found** → Research mode (continue to Step 2):

2. **Detect the current project** using `mnemo_project(action: detect)`.

3. **Research the tool/library**:
   - **Context7 first** (for library/framework docs): `resolve-library-id` then `query-docs` with queries like "getting started", "installation", "setup", "configuration"
   - **Web Search** for additional setup guides, best practices, and troubleshooting
   - Focus on: installation commands, configuration files, integration steps, common pitfalls

4. **Organize into structured procedure**:

   Present the procedure to the user in this format:

   ```markdown
   # [Tool Name] セットアップ手順

   ## 概要
   [What the tool does, why to use it — 2-3 sentences]

   ## 前提条件
   - [Runtime/dependency requirements]
   - [Minimum versions]

   ## セットアップ手順

   ### Step 1: インストール
   [installation commands]

   ### Step 2: 設定ファイルの作成
   [configuration details with examples]

   ### Step 3: プロジェクトへの統合
   [package.json scripts, CI integration, etc.]

   ## 基本的な使い方
   [Common commands and usage patterns]

   ## 設定例
   [Example configuration files with comments]

   ## トラブルシューティング
   - **[Common issue]**: [solution]
   ```

5. **Wait for user confirmation**: Ask "この手順を保存しますか？" (Save this procedure?)

6. **Save the procedure** using `mnemo_learn`:
   - `type: "procedure"`
   - `title`: Tool name + "セットアップ手順" (e.g., "oxlint セットアップ手順")
   - `content`: A concise summary for search/embedding (under 500 chars). Example: "oxlintのインストール、設定ファイル作成、ESLintからの移行手順。pnpm add -D oxlint、oxlint.config.ts設定、package.json scripts統合を含む。"
   - `rawContent`: The full structured procedure markdown
   - `tags`: Tool name + related keywords (e.g., `["oxlint", "linter", "setup"]`)
   - `project`: Omit (procedures are cross-project by default) unless user specifies
   - `language`/`framework`: Set if the tool is language/framework-specific

7. **Suggest profile update**: If the tool fits a profile.tools category (linter, formatter, bundler, testRunner, packageManager), suggest:
   ```
   プロフィールも更新しますか？
   例: mnemo_profile(action: set, category: tools, key: linter, value: oxlint)
   ```

8. **Report**: Confirm what was saved with ID and title.

## Usage Patterns

- **`/setup oxlint`** (初回): 手順書なし → 調査 → 整理 → 保存 → オプションでセットアップ実行
- **`/setup oxlint`** (2回目以降): 手順書あり → そのまま手順に従ってセットアップ実行
- **`/setup oxlint` + 「更新して」**: 既存手順書を再調査して更新

## Guidelines

- Match the user's language for the procedure content (default: Japanese)
- Include actual commands that can be copy-pasted or executed
- Note version-specific details (e.g., "as of v1.x")
- If the tool has multiple setup approaches (e.g., with vs without a framework plugin), document the most common one and mention alternatives
- Keep procedures actionable — every step should be something the user can do
- Don't duplicate what's already in profile; procedures are "how to set up", profile is "what I use"
- Consolidate research into a single well-organized procedure, not multiple scattered entries
- If updating an existing procedure, use `mnemo_delete(type: knowledge, id: <old-id>)` first, then create a new one
