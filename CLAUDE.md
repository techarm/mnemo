# Mnemo プロジェクト

このプロジェクトは Claude Code 用のナレッジ管理システムです。
ユーザーが手書きした内容はここに書きます。

<!-- MNEMO:START - この部分は Mnemo が自動生成します。手動で編集しないでください -->
<!-- 最終更新: 2026-03-07 18:19 -->

## プロジェクト情報
- **名前:** mnemo
- **説明:** Knowledge memory system for Claude Code
- **言語:** typescript
- **技術スタック:** typescript, lancedb

## ⚠️ Pitfalls（既知の落とし穴）
- **LanceDB query()のデフォルトlimitは10件**: LanceDBのtable.query().toArray()はデフォルトでlimit(10)が適用される。全件取得するにはquery().limit(10000).toArray()のように明示的にlimitを指定する必要がある。countRows()は正しい件数を返すがquery()はデフォルト10件しか返さないため、11件以上のデータがある場合にデータが欠落する。
- **LanceDB where句でcamelCaseカラム名にはバッククォートが必要**: LanceDBのwhere句でcamelCaseのカラム名（例: projectId, createdAt, updatedAt）を使う場合、そのままだと小文字に変換されて 'No field named projectid' エラーになる。バッククォートで囲む必要がある。例: where(`projectId` = 'value') は正しい。where("projectId" = 'value
- **LanceDBのFTSインデックスはデータ追加後に再構築が必要** _(グローバル)_: LanceDBではデータを追加した後、FTSインデックスを replace: true オプションで再作成しないと新しいデータが全文検索にヒットしない。addKnowledgeEntry の後に rebuildFtsIndexes を呼ぶ必要がある。

## 📋 Active Tasks
- [ ] [中] CLAUDE.md 自動生成
- [ ] [中] session-review スキルの作成
- [ ] [低] code-reuse-finder スキルの作成
- [ ] [低] 知識の信頼度減衰システム
- [ ] [低] Obsidian Vault 連携エクスポート
- [ ] [低] プロジェクトテンプレート (mnemo init/create)

<!-- MNEMO:END -->
