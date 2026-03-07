#!/usr/bin/env node

import { program } from "commander";
import { learn, recall, stats, remove } from "../src/core/knowledge-store.js";
import { exportToMarkdown } from "../src/core/exporter.js";
import { exportToObsidian } from "../src/core/obsidian-exporter.js";
import {
  generateClaudeMdSection,
  writeClaudeMd,
} from "../src/core/claude-md-generator.js";
import {
  registerProject,
  listProjects,
  getProject,
  detectProject,
  getProjectStats,
  removeProject,
} from "../src/core/project-store.js";
import {
  addTask,
  listTasks,
  updateTask,
  updateTaskStatus,
  removeTask,
} from "../src/core/task-store.js";
import {
  createBackup,
  restoreBackup,
  listBackups,
  checkAndMigrate,
} from "../src/core/backup.js";
import {
  createDoc,
  listDocs,
  getDoc,
  deleteDoc,
} from "../src/core/doc-store.js";
import type { KnowledgeType, TaskStatus, TaskPriority, DocScope } from "../src/types/index.js";

/** UTC ISO文字列をローカルタイムゾーンの "YYYY-MM-DD HH:mm" に変換 */
function formatLocalTime(isoString: string): string {
  const d = new Date(isoString);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day} ${h}:${min}`;
}

program
  .name("mnemo")
  .description("Mnemo - Knowledge memory system for Claude Code")
  .version("0.2.0")
  .hook("preAction", async () => {
    await checkAndMigrate();
  });

// --- learn ---
program
  .command("learn <title>")
  .description("Record a piece of knowledge")
  .requiredOption(
    "-t, --type <type>",
    "Type: lesson, pitfall, preference, pattern, solution"
  )
  .option("-c, --content <content>", "Detailed content (if omitted, title is used)")
  .option("-p, --project <project>", "Project name")
  .option("--tags <tags>", "Comma-separated tags")
  .option("-l, --language <language>", "Programming language")
  .option("-f, --framework <framework>", "Framework")
  .action(async (title: string, opts) => {
    try {
      const entry = await learn({
        type: opts.type as KnowledgeType,
        title,
        content: opts.content ?? title,
        project: opts.project,
        tags: opts.tags ? opts.tags.split(",").map((t: string) => t.trim()) : undefined,
        language: opts.language,
        framework: opts.framework,
      });
      console.log(`Stored: [${entry.type}] ${entry.title} (${entry.id})`);
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

// --- recall ---
program
  .command("recall <query>")
  .description("Search the knowledge base (semantic + keyword)")
  .option(
    "-t, --type <type>",
    "Filter: lesson, pitfall, preference, pattern, solution"
  )
  .option("-p, --project <project>", "Filter by project")
  .option("-l, --language <language>", "Filter by language")
  .option("-f, --framework <framework>", "Filter by framework")
  .option("-n, --limit <number>", "Max results", "10")
  .option("--format <format>", "Output format: text, json", "text")
  .action(async (query: string, opts) => {
    try {
      const results = await recall(query, {
        type: opts.type as KnowledgeType | undefined,
        project: opts.project,
        language: opts.language,
        framework: opts.framework,
        limit: parseInt(opts.limit),
      });

      if (results.length === 0) {
        console.log("No matching knowledge found.");
        return;
      }

      if (opts.format === "json") {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      console.log(`Found ${results.length} results:\n`);
      for (const [i, r] of results.entries()) {
        console.log(
          `${i + 1}. [${r.type}] ${r.title} (score: ${r.score.toFixed(3)})`
        );
        if (r.project) console.log(`   Project: ${r.project}`);
        if (r.language) console.log(`   Language: ${r.language}`);
        console.log(`   ${r.content.slice(0, 200)}${r.content.length > 200 ? "..." : ""}`);
        console.log();
      }
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

// --- stats ---
program
  .command("stats")
  .description("Show knowledge base statistics")
  .action(async () => {
    try {
      const s = await stats();
      console.log(`Mnemo Statistics`);
      console.log(`================`);
      console.log(`Total entries: ${s.totalEntries}\n`);

      if (Object.keys(s.byType).length > 0) {
        console.log("By Type:");
        for (const [type, count] of Object.entries(s.byType)) {
          console.log(`  ${type}: ${count}`);
        }
        console.log();
      }

      if (Object.keys(s.byProject).length > 0) {
        console.log("By Project:");
        for (const [project, count] of Object.entries(s.byProject)) {
          console.log(`  ${project}: ${count}`);
        }
        console.log();
      }

      if (Object.keys(s.byLanguage).length > 0) {
        console.log("By Language:");
        for (const [lang, count] of Object.entries(s.byLanguage)) {
          console.log(`  ${lang}: ${count}`);
        }
      }
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

// --- export ---
program
  .command("export")
  .description("Export knowledge to Markdown or Obsidian vault")
  .option("-o, --output <dir>", "Output directory")
  .option("-t, --type <type>", "Filter by type")
  .option("-p, --project <project>", "Filter by project")
  .option(
    "-f, --format <format>",
    "Export format: markdown or obsidian",
    "markdown"
  )
  .action(async (opts) => {
    try {
      if (opts.format === "obsidian") {
        const result = await exportToObsidian(opts.output, {
          type: opts.type,
          project: opts.project,
        });
        console.log(`Obsidian vault exported to: ${result.dir}`);
        console.log(
          `  Knowledge: ${result.counts.knowledge}, Projects: ${result.counts.projects}, Tasks: ${result.counts.tasks}, Docs: ${result.counts.docs}`
        );
      } else {
        const dir = await exportToMarkdown(opts.output, {
          type: opts.type,
          project: opts.project,
        });
        console.log(`Exported to: ${dir}`);
      }
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

// --- project ---
const projectCmd = program
  .command("project")
  .description("プロジェクト管理");

projectCmd
  .command("register <name>")
  .description("プロジェクトを登録")
  .requiredOption("--path <path>", "プロジェクトのルートパス")
  .option("--desc <description>", "説明")
  .option("--tech <techs>", "カンマ区切りの技術スタック")
  .option("-l, --language <language>", "主要言語")
  .option("-f, --framework <framework>", "主要フレームワーク")
  .action(async (name: string, opts) => {
    try {
      const project = await registerProject({
        name,
        path: opts.path,
        description: opts.desc,
        techStack: opts.tech
          ? opts.tech.split(",").map((t: string) => t.trim())
          : undefined,
        language: opts.language,
        framework: opts.framework,
      });
      console.log(`プロジェクトを登録しました: ${project.name} (${project.path})`);
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

projectCmd
  .command("list")
  .description("登録済みプロジェクト一覧")
  .action(async () => {
    try {
      const projects = await listProjects();
      if (projects.length === 0) {
        console.log("登録済みプロジェクトはありません。");
        return;
      }
      console.log(`登録済みプロジェクト (${projects.length}件):\n`);
      for (const p of projects) {
        const tech = JSON.parse(p.techStack || "[]").join(", ");
        console.log(`  ${p.name} — ${p.description || "(説明なし)"}`);
        console.log(`    Path: ${p.path}`);
        if (tech) console.log(`    Tech: ${tech}`);
        console.log();
      }
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

projectCmd
  .command("info <name>")
  .description("プロジェクトの詳細情報")
  .action(async (name: string) => {
    try {
      const ps = await getProjectStats(name);
      if (!ps) {
        console.log(`プロジェクト "${name}" が見つかりません。`);
        return;
      }
      const { project: p, knowledgeCount, knowledgeByType, taskCounts } = ps;
      const tech = JSON.parse(p.techStack || "[]").join(", ");
      console.log(`プロジェクト: ${p.name}`);
      console.log(`パス: ${p.path}`);
      console.log(`説明: ${p.description || "-"}`);
      console.log(`技術スタック: ${tech || "-"}`);
      console.log(`言語: ${p.language || "-"}`);
      console.log(`フレームワーク: ${p.framework || "-"}`);
      console.log();
      console.log(`ナレッジ: ${knowledgeCount}件`);
      if (Object.keys(knowledgeByType).length > 0) {
        for (const [type, count] of Object.entries(knowledgeByType)) {
          console.log(`  ${type}: ${count}`);
        }
      }
      console.log();
      console.log(
        `タスク: todo: ${taskCounts.todo} | 進行中: ${taskCounts.inProgress} | 完了: ${taskCounts.done}`
      );
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

projectCmd
  .command("detect")
  .description("現在のディレクトリからプロジェクトを検出")
  .option("--path <dir>", "検出対象のパス", process.cwd())
  .action(async (opts) => {
    try {
      const detected = await detectProject(opts.path);
      if (!detected) {
        console.log(
          `パス "${opts.path}" に対応する登録済みプロジェクトが見つかりません。`
        );
        return;
      }
      console.log(`現在のプロジェクト: ${detected.name} (${detected.path})`);
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

// --- task ---
const taskCmd = program.command("task").description("タスク管理");

taskCmd
  .command("add <title>")
  .description("タスクを追加")
  .requiredOption("-p, --project <project>", "プロジェクト名")
  .option("-d, --description <desc>", "タスクの詳細説明")
  .option("--priority <priority>", "優先度: low, medium, high", "medium")
  .option("--parent <parentId>", "親タスクID（サブタスク用）")
  .option("--tags <tags>", "カンマ区切りのタグ")
  .action(async (title: string, opts) => {
    try {
      const task = await addTask({
        projectName: opts.project,
        title,
        description: opts.description,
        priority: opts.priority as TaskPriority,
        parentId: opts.parent,
        tags: opts.tags
          ? opts.tags.split(",").map((t: string) => t.trim())
          : undefined,
      });
      const priorityLabel: Record<string, string> = {
        high: "高",
        medium: "中",
        low: "低",
      };
      console.log(
        `タスクを追加しました: ${task.title} (ID: ${task.id.slice(0, 8)}) [優先度: ${priorityLabel[task.priority] ?? task.priority}]`
      );
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

taskCmd
  .command("list")
  .description("タスク一覧")
  .option("-p, --project <project>", "プロジェクト名")
  .option(
    "-s, --status <status>",
    "フィルタ: todo, in_progress, done"
  )
  .option("--format <format>", "出力形式: text, json", "text")
  .action(async (opts) => {
    try {
      if (!opts.project) {
        // Try to auto-detect project
        const detected = await detectProject(process.cwd());
        if (!detected) {
          console.error(
            "Error: --project を指定するか、登録済みプロジェクトのディレクトリで実行してください。"
          );
          process.exit(1);
        }
        opts.project = detected.name;
      }

      const tasks = await listTasks(opts.project, {
        status: opts.status as TaskStatus | undefined,
      });

      if (tasks.length === 0) {
        console.log(`${opts.project} のタスクはありません。`);
        return;
      }

      if (opts.format === "json") {
        console.log(JSON.stringify(tasks, null, 2));
        return;
      }

      const statusIcon: Record<string, string> = {
        todo: "[ ]",
        in_progress: "[>]",
        done: "[x]",
      };
      const priorityLabel: Record<string, string> = {
        high: "高",
        medium: "中",
        low: "低",
      };

      console.log(`${opts.project} のタスク一覧:\n`);
      for (const t of tasks) {
        const icon = statusIcon[t.status] ?? "[ ]";
        const pri = priorityLabel[t.priority] ?? t.priority;
        let line = `  [${pri}] ${icon} ${t.title} (${t.id.slice(0, 8)})`;
        if (t.completedAt)
          line += ` — 完了: ${formatLocalTime(t.completedAt)}`;
        console.log(line);
        if (t.description) console.log(`       ${t.description.slice(0, 100)}`);
      }
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

taskCmd
  .command("update <taskId>")
  .description("タスクを更新")
  .option("-s, --status <status>", "新しいステータス: todo, in_progress, done")
  .option("-t, --title <title>", "新しいタイトル")
  .option("--priority <priority>", "新しい優先度: low, medium, high")
  .action(async (taskId: string, opts) => {
    try {
      const updated = await updateTask(taskId, {
        status: opts.status as TaskStatus | undefined,
        title: opts.title,
        priority: opts.priority as TaskPriority | undefined,
      });
      console.log(`タスクを更新しました: ${updated.title}`);
      console.log(
        `  Status: ${updated.status} | Priority: ${updated.priority}`
      );
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

taskCmd
  .command("done <taskId>")
  .description("タスクを完了にする")
  .action(async (taskId: string) => {
    try {
      const completed = await updateTaskStatus(taskId, "done");
      console.log(`タスクを完了にしました: ${completed.title}`);
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

// --- backup ---
const backupCmd = program.command("backup").description("データのバックアップ・リストア");

backupCmd
  .command("create")
  .description("バックアップを作成")
  .option("-o, --output <path>", "出力ファイルパス")
  .action(async (opts) => {
    try {
      const backupPath = await createBackup(opts.output);
      console.log(`バックアップを作成しました: ${backupPath}`);
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

backupCmd
  .command("restore <path>")
  .description("バックアップからリストア（ベクトルは自動再生成）")
  .action(async (inputPath: string) => {
    try {
      console.log("リストアを開始します（ベクトル再生成のため時間がかかります）...");
      const counts = await restoreBackup(inputPath);
      console.log(`リストアが完了しました:`);
      console.log(`  ナレッジ: ${counts.knowledge}件`);
      console.log(`  プロジェクト: ${counts.projects}件`);
      console.log(`  タスク: ${counts.tasks}件`);
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

backupCmd
  .command("list")
  .description("バックアップ一覧を表示")
  .action(() => {
    try {
      const backups = listBackups();
      if (backups.length === 0) {
        console.log("バックアップはありません。");
        return;
      }
      console.log(`バックアップ一覧 (${backups.length}件):\n`);
      for (const [i, b] of backups.entries()) {
        console.log(`  ${i + 1}. ${b.path}`);
        console.log(`     サイズ: ${b.size} | 作成日: ${b.createdAt.slice(0, 19)}`);
      }
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

// --- generate ---
program
  .command("generate [project]")
  .description("プロジェクトの CLAUDE.md を Mnemo の知識から自動生成")
  .option("--dry-run", "ファイルに書き出さず内容を標準出力に表示")
  .action(async (projectArg: string | undefined, opts) => {
    try {
      let projectName = projectArg;
      if (!projectName) {
        const detected = await detectProject(process.cwd());
        if (!detected) {
          console.error(
            "Error: プロジェクト名を指定するか、登録済みプロジェクトのディレクトリで実行してください。"
          );
          process.exit(1);
        }
        projectName = detected.name;
      }

      if (opts.dryRun) {
        const content = await generateClaudeMdSection(projectName);
        console.log(content);
      } else {
        const filePath = await writeClaudeMd(projectName);
        console.log(`CLAUDE.md を生成しました: ${filePath}`);
      }
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

// --- delete ---
const deleteCmd = program
  .command("delete")
  .description("ナレッジ・タスク・プロジェクトの削除（短縮ID対応）");

deleteCmd
  .command("knowledge <id>")
  .description("ナレッジを削除")
  .action(async (id: string) => {
    try {
      const entry = await remove(id);
      console.log(`ナレッジを削除しました: [${entry.type}] ${entry.title} (${entry.id.slice(0, 8)})`);
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

deleteCmd
  .command("task <id>")
  .description("タスクを削除")
  .action(async (id: string) => {
    try {
      const task = await removeTask(id);
      console.log(`タスクを削除しました: ${task.title} (${task.id.slice(0, 8)})`);
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

deleteCmd
  .command("project <id>")
  .description("プロジェクトを削除（紐づくタスクもカスケード削除）")
  .action(async (id: string) => {
    try {
      const { project, deletedTasks } = await removeProject(id);
      console.log(`プロジェクトを削除しました: ${project.name} (${project.id.slice(0, 8)})`);
      if (deletedTasks > 0) {
        console.log(`  紐づくタスク ${deletedTasks}件 も削除しました。`);
      }
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

// --- doc ---
const docCmd = program.command("doc").description("プロジェクト仕様ドキュメント管理");

docCmd
  .command("create <title>")
  .description("ドキュメントを作成")
  .requiredOption("-p, --project <project>", "プロジェクト名")
  .requiredOption("-s, --summary <summary>", "一行サマリー（120文字以内）")
  .option("--scope <scope>", "スコープ: global, feature, api", "feature")
  .option("--id <id>", "カスタムID/スラッグ")
  .option("--tags <tags>", "カンマ区切りのタグ")
  .option("--related <files>", "カンマ区切りの関連ファイルパス")
  .option("-c, --content <content>", "Markdownコンテンツ（省略時は空）")
  .action(async (title: string, opts) => {
    try {
      const doc = await createDoc({
        projectName: opts.project,
        title,
        content: opts.content ?? "",
        summary: opts.summary,
        scope: opts.scope as DocScope,
        relatedFiles: opts.related
          ? opts.related.split(",").map((f: string) => f.trim())
          : undefined,
        tags: opts.tags
          ? opts.tags.split(",").map((t: string) => t.trim())
          : undefined,
        id: opts.id,
      });
      console.log(`ドキュメントを作成しました: ${doc.title} (${doc.id})`);
      console.log(`  File: .claude/docs/${doc.filename}`);
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

docCmd
  .command("list")
  .description("ドキュメント一覧")
  .option("-p, --project <project>", "プロジェクト名")
  .action(async (opts) => {
    try {
      let projectName = opts.project;
      if (!projectName) {
        const detected = await detectProject(process.cwd());
        if (!detected) {
          console.error(
            "Error: --project を指定するか、登録済みプロジェクトのディレクトリで実行してください。"
          );
          process.exit(1);
        }
        projectName = detected.name;
      }
      const docs = await listDocs(projectName);
      if (docs.length === 0) {
        console.log(`${projectName} のドキュメントはありません。`);
        return;
      }
      console.log(`${projectName} のドキュメント (${docs.length}件):\n`);
      for (const d of docs) {
        console.log(`  [${d.scope}] ${d.title} (${d.id})`);
        console.log(`    ${d.summary}`);
        console.log();
      }
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

docCmd
  .command("get <id>")
  .description("ドキュメントの内容を表示")
  .requiredOption("-p, --project <project>", "プロジェクト名")
  .action(async (id: string, opts) => {
    try {
      const doc = await getDoc(opts.project, id);
      console.log(`# ${doc.title}\n`);
      console.log(`Scope: ${doc.scope} | Tags: ${doc.tags.join(", ") || "-"}`);
      console.log(`Related: ${doc.relatedFiles.join(", ") || "-"}`);
      console.log(`Updated: ${formatLocalTime(doc.updatedAt)}`);
      console.log(`\n${doc.content}`);
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

docCmd
  .command("delete <id>")
  .description("ドキュメントを削除")
  .requiredOption("-p, --project <project>", "プロジェクト名")
  .action(async (id: string, opts) => {
    try {
      const deleted = await deleteDoc(opts.project, id);
      console.log(`ドキュメントを削除しました: ${deleted.title} (${deleted.id})`);
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

program.parse();
