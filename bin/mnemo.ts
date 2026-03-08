#!/usr/bin/env node

import { program } from "commander";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { learn, recall, stats, remove, computeTtlStatus } from "../src/core/knowledge-store.js";
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
import {
  writeSessionLog,
  listSessionLogs,
  getSessionLog,
  getRecentSessionLogs,
  getSessionContext,
} from "../src/core/session-store.js";
import {
  loadProfile,
  setProfileValue,
  getProfileValue,
  deleteProfileValue,
  resetProfile,
  formatProfile,
  getProfileContext,
} from "../src/core/profile-store.js";
import type { KnowledgeType, TaskStatus, TaskPriority, DocScope, ProfileCategory } from "../src/types/index.js";

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
  .version("0.4.0")
  .hook("preAction", async () => {
    await checkAndMigrate();
  });

// --- learn ---
program
  .command("learn <title>")
  .description("Record a piece of knowledge")
  .requiredOption(
    "-t, --type <type>",
    "Type: lesson, pitfall, preference, pattern, solution, reference, procedure"
  )
  .option("-c, --content <content>", "Detailed content (if omitted, title is used)")
  .option("-p, --project <project>", "Project name")
  .option("--tags <tags>", "Comma-separated tags")
  .option("-l, --language <language>", "Programming language")
  .option("-f, --framework <framework>", "Framework")
  .option("--source-url <url>", "Source URL or Context7 libraryId (for reference type)")
  .option("--source-type <type>", "Source type: web or context7 (for reference type)")
  .option("--raw-content <content>", "Full fetched text content (for reference type)")
  .option("--ttl <days>", "TTL in days (for reference type, 0 = no expiry)", "0")
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
        sourceUrl: opts.sourceUrl,
        sourceType: opts.sourceType,
        rawContent: opts.rawContent,
        ttlDays: parseInt(opts.ttl),
      });
      let msg = `Stored: [${entry.type}] ${entry.title} (${entry.id})`;
      if (entry.sourceUrl) msg += `\n  Source: ${entry.sourceUrl}`;
      if (entry.ttlDays) msg += `\n  TTL: ${entry.ttlDays} days`;
      console.log(msg);
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
    "Filter: lesson, pitfall, preference, pattern, solution, reference, procedure"
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

        // TTL status for reference type
        const entryData = r as unknown as Record<string, unknown>;
        if (entryData.sourceUrl) console.log(`   Source: ${entryData.sourceUrl}`);
        const ttl = computeTtlStatus(r as unknown as import("../src/types/index.js").KnowledgeEntry);
        if (ttl) {
          if (ttl.expired) {
            console.log(`   ⚠️ TTL expired (${Math.abs(ttl.daysRemaining)} days ago)`);
          } else {
            console.log(`   TTL: ${ttl.daysRemaining} days remaining`);
          }
        }

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

// --- session ---

const sessionCmd = program
  .command("session")
  .description("セッションログ管理");

sessionCmd
  .command("write")
  .description("セッションログを記録")
  .requiredOption("-p, --project <project>", "プロジェクト名")
  .requiredOption("-s, --summary <summary>", "セッション要約")
  .option("--tasks <tasks>", "カンマ区切りの作業タスク")
  .option("--decisions <decisions>", "カンマ区切りの決定事項")
  .option("--files <files>", "カンマ区切りの変更ファイル")
  .option("--errors <errors>", "カンマ区切りのエラーと解決策")
  .option("--next <next>", "カンマ区切りの次のステップ")
  .action(async (opts) => {
    try {
      const entry = writeSessionLog({
        timestamp: new Date().toISOString(),
        project: opts.project,
        summary: opts.summary,
        tasksWorkedOn: opts.tasks
          ?.split(",")
          .map((s: string) => s.trim()),
        keyDecisions: opts.decisions
          ?.split(",")
          .map((s: string) => s.trim()),
        filesModified: opts.files
          ?.split(",")
          .map((s: string) => s.trim()),
        errorsSolutions: opts.errors
          ?.split(",")
          .map((s: string) => s.trim()),
        nextSteps: opts.next
          ?.split(",")
          .map((s: string) => s.trim()),
      });
      console.log(
        `セッションログを記録しました: ${opts.project} (${entry.date}, ${entry.sessionCount} session(s))`
      );
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

sessionCmd
  .command("list")
  .description("セッションログ一覧")
  .option("-p, --project <project>", "プロジェクト名でフィルタ")
  .action(async (opts) => {
    try {
      let projectName = opts.project;
      if (!projectName) {
        const detected = await detectProject(process.cwd());
        if (detected) projectName = detected.name;
      }
      const entries = listSessionLogs(projectName);
      if (entries.length === 0) {
        console.log("セッションログはありません。");
        return;
      }
      console.log(`セッションログ一覧 (${entries.length}件):\n`);
      for (const e of entries) {
        console.log(
          `  ${e.date} [${e.project}] — ${e.sessionCount} session(s)`
        );
      }
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

sessionCmd
  .command("get <date>")
  .description("特定日のセッションログを表示")
  .requiredOption("-p, --project <project>", "プロジェクト名")
  .action(async (date: string, opts) => {
    try {
      const content = getSessionLog(opts.project, date);
      console.log(content);
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

sessionCmd
  .command("recent")
  .description("最近のセッションログを表示")
  .option("-p, --project <project>", "プロジェクト名")
  .option("-d, --days <days>", "遡る日数", "3")
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
      const logs = getRecentSessionLogs(projectName, parseInt(opts.days));
      if (!logs) {
        console.log("最近のセッションログはありません。");
        return;
      }
      console.log(logs);
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

sessionCmd
  .command("context")
  .description("セッション開始時のコンテキスト出力（hook用）")
  .option("-p, --project <project>", "プロジェクト名")
  .option("-d, --days <days>", "遡る日数", "3")
  .action(async (opts) => {
    try {
      let projectName = opts.project;
      if (!projectName) {
        const detected = await detectProject(process.cwd());
        if (!detected) {
          // Silently return empty — hook should not fail
          return;
        }
        projectName = detected.name;
      }
      const context = getSessionContext(projectName, parseInt(opts.days));
      if (context) {
        console.log(context);
      }
    } catch {
      // Silently fail — hook should not break session start
    }
  });

// --- profile ---

const VALID_CATEGORIES = [
  "identity",
  "technical",
  "tools",
  "communication",
  "codingStyle",
  "customNotes",
];

const profileCmd = program
  .command("profile")
  .description("ユーザープロフィール管理");

profileCmd
  .command("show")
  .description("プロフィールを表示")
  .action(() => {
    try {
      console.log(formatProfile());
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

profileCmd
  .command("set <category> <key> <value>")
  .description(
    "プロフィール値を設定 (カテゴリ: identity, technical, tools, communication, codingStyle, customNotes)"
  )
  .action((category: string, key: string, value: string) => {
    try {
      if (!VALID_CATEGORIES.includes(category)) {
        console.error(
          `Error: 無効なカテゴリ "${category}"。有効: ${VALID_CATEGORIES.join(", ")}`
        );
        process.exit(1);
      }
      setProfileValue(category as ProfileCategory, key, value);
      if (category === "customNotes") {
        console.log(`プロフィールを更新しました: customNotes`);
      } else {
        console.log(
          `プロフィールを更新しました: ${category}.${key} = ${value}`
        );
      }
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

profileCmd
  .command("get <category> [key]")
  .description("プロフィール値を取得")
  .action((category: string, key?: string) => {
    try {
      if (!VALID_CATEGORIES.includes(category)) {
        console.error(
          `Error: 無効なカテゴリ "${category}"。有効: ${VALID_CATEGORIES.join(", ")}`
        );
        process.exit(1);
      }
      if (category === "customNotes") {
        const notes = getProfileValue(
          category as ProfileCategory,
          "_"
        );
        console.log(notes || "(空)");
        return;
      }
      if (key) {
        const val = getProfileValue(category as ProfileCategory, key);
        console.log(val || `(${category}.${key} は設定されていません)`);
      } else {
        // Show entire category
        const profile = loadProfile();
        const data = profile[
          category as keyof typeof profile
        ] as Record<string, string>;
        if (typeof data !== "object" || Object.keys(data).length === 0) {
          console.log(`${category} は空です。`);
          return;
        }
        console.log(`${category}:`);
        for (const [k, v] of Object.entries(data)) {
          console.log(`  ${k}: ${v}`);
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

profileCmd
  .command("delete <category> <key>")
  .description("プロフィール値を削除")
  .action((category: string, key: string) => {
    try {
      if (!VALID_CATEGORIES.includes(category)) {
        console.error(
          `Error: 無効なカテゴリ "${category}"。有効: ${VALID_CATEGORIES.join(", ")}`
        );
        process.exit(1);
      }
      deleteProfileValue(category as ProfileCategory, key);
      if (category === "customNotes") {
        console.log("customNotes をクリアしました。");
      } else {
        console.log(`${category}.${key} を削除しました。`);
      }
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

profileCmd
  .command("reset")
  .description("プロフィールをリセット（全削除）")
  .option("--confirm", "確認フラグ（必須）")
  .action((opts) => {
    try {
      if (!opts.confirm) {
        console.error(
          "Error: リセットするには --confirm フラグが必要です。"
        );
        process.exit(1);
      }
      resetProfile();
      console.log("プロフィールをリセットしました。");
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

profileCmd
  .command("context")
  .description("プロフィールコンテキスト出力（hook用）")
  .action(() => {
    try {
      const context = getProfileContext();
      if (context) {
        console.log(context);
      }
    } catch {
      // Silently fail — hook should not break session start
    }
  });

// ===== init / cleanup =====

const __mnemo_filename = fileURLToPath(import.meta.url);
// dist/bin/mnemo.js → ../../ = mnemo root
const MNEMO_ROOT = path.resolve(path.dirname(__mnemo_filename), "..", "..");
const HOME_DIR = process.env.HOME || os.homedir();
const MNEMO_DATA_DIR = path.join(HOME_DIR, ".mnemo");

function isProjectRoot(dir: string): boolean {
  return [
    ".git",
    "package.json",
    "Cargo.toml",
    "pyproject.toml",
    "go.mod",
    "Makefile",
    "build.gradle",
    "pom.xml",
  ].some((f) => fs.existsSync(path.join(dir, f)));
}

function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function removeDirIfEmpty(dirPath: string): void {
  try {
    if (fs.existsSync(dirPath) && fs.readdirSync(dirPath).length === 0) {
      fs.rmdirSync(dirPath);
    }
  } catch {
    // ignore
  }
}

function buildHooksConfig(hooksDir: string): Record<string, unknown[]> {
  return {
    SessionStart: [
      {
        matcher: "startup|resume",
        hooks: [
          {
            type: "command",
            command: `bash ${hooksDir}/session-start.sh`,
            timeout: 15,
          },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: "Bash",
        hooks: [
          {
            type: "command",
            command: `bash ${hooksDir}/post-tool-use.sh`,
            timeout: 10,
          },
        ],
      },
    ],
    Stop: [
      {
        matcher: "",
        hooks: [
          {
            type: "prompt",
            prompt: "/session-review を実行してください。",
          },
        ],
      },
    ],
  };
}

function mergeHooksToSettings(settingsPath: string, hooksDir: string): void {
  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  }
  if (settings.hooks) {
    console.log("  ⚠ Existing hooks will be replaced.");
  }
  settings.hooks = buildHooksConfig(hooksDir);
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}

function removeHooksFromSettings(settingsPath: string): boolean {
  if (!fs.existsSync(settingsPath)) return false;
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  if (!settings.hooks) return false;
  delete settings.hooks;
  if (Object.keys(settings).length === 0) {
    fs.unlinkSync(settingsPath);
  } else {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  }
  return true;
}

function checkOllama(): void {
  try {
    execSync("command -v ollama", { stdio: "pipe" });
    try {
      execSync("curl -s http://localhost:11434/api/tags", {
        stdio: "pipe",
        timeout: 3000,
      });
      console.log("  ✓ Ollama: running");
    } catch {
      console.log(
        "  ⚠ Ollama is installed but not running. Start it before using Mnemo."
      );
    }
  } catch {
    console.log(
      "  ⚠ Ollama is not installed. Install from https://ollama.com/download"
    );
    console.log("    After installing, run: ollama pull nomic-embed-text");
  }
}

async function initProject(): Promise<void> {
  const projectDir = process.cwd();

  // 1. Project root check
  if (!isProjectRoot(projectDir)) {
    console.error("Error: プロジェクトのルートディレクトリで実行してください。");
    console.error(
      "  .git, package.json 等のプロジェクトファイルが見つかりません。"
    );
    console.error(`  現在のディレクトリ: ${projectDir}`);
    process.exit(1);
  }

  const projectName = path.basename(projectDir);
  console.log(`\n=== Mnemo Init (project: ${projectName}) ===\n`);

  // 2. Create data directory
  fs.mkdirSync(MNEMO_DATA_DIR, { recursive: true });
  console.log(`  ✓ Data directory: ${MNEMO_DATA_DIR}`);

  // 3. Ollama check
  checkOllama();

  // 4. .mcp.json — add MCP server config
  const mcpJsonPath = path.join(projectDir, ".mcp.json");
  let mcpConfig: Record<string, unknown> = {};
  if (fs.existsSync(mcpJsonPath)) {
    mcpConfig = JSON.parse(fs.readFileSync(mcpJsonPath, "utf8"));
  }
  if (!mcpConfig.mcpServers) {
    mcpConfig.mcpServers = {};
  }
  (mcpConfig.mcpServers as Record<string, unknown>).mnemo = {
    command: "node",
    args: [path.join(MNEMO_ROOT, "dist/src/index.js")],
    env: {
      MNEMO_DATA_DIR: MNEMO_DATA_DIR,
      OLLAMA_URL: "http://localhost:11434",
    },
  };
  fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2) + "\n");
  console.log("  ✓ .mcp.json: MCP server configured");

  // 5. Copy hook scripts to .claude/hooks/
  const hooksDestDir = path.join(projectDir, ".claude", "hooks");
  fs.mkdirSync(hooksDestDir, { recursive: true });
  const hookFiles = ["session-start.sh", "post-tool-use.sh"];
  for (const file of hookFiles) {
    fs.copyFileSync(
      path.join(MNEMO_ROOT, "hooks", file),
      path.join(hooksDestDir, file)
    );
    fs.chmodSync(path.join(hooksDestDir, file), 0o755);
  }
  console.log("  ✓ .claude/hooks/: hook scripts copied");

  // 6. Merge hooks into .claude/settings.json
  const settingsPath = path.join(projectDir, ".claude", "settings.json");
  mergeHooksToSettings(settingsPath, ".claude/hooks");
  console.log("  ✓ .claude/settings.json: hooks configured");

  // 7. Copy skills to .claude/skills/
  const skillsSrc = path.join(MNEMO_ROOT, ".claude", "skills");
  const skillsDest = path.join(projectDir, ".claude", "skills");
  if (fs.existsSync(skillsSrc)) {
    copyDirRecursive(skillsSrc, skillsDest);
    console.log("  ✓ .claude/skills/: skills copied");
  }

  // 8. Register project (if not already registered)
  try {
    const detected = await detectProject(projectDir);
    if (!detected) {
      await registerProject({ name: projectName, path: projectDir });
      console.log(`  ✓ Project registered: ${projectName}`);
    } else {
      console.log(`  ✓ Project already registered: ${detected.name}`);
    }
  } catch {
    // If detectProject fails (no DB yet), register anyway
    try {
      await registerProject({ name: projectName, path: projectDir });
      console.log(`  ✓ Project registered: ${projectName}`);
    } catch {
      console.log("  ⚠ Project registration skipped (will register on first use)");
    }
  }

  // 9. Summary
  console.log("\n=== Setup Complete ===\n");
  console.log("Next steps:");
  console.log("  1. Start a new Claude Code session in this project");
  console.log(
    "  2. Mnemo will automatically inject knowledge at session start"
  );
  console.log(
    "  3. Use /learn to record knowledge, /session-review at session end"
  );
  console.log("\nTo set up globally for all projects:");
  console.log("  mnemo init --global\n");
}

async function initGlobal(): Promise<void> {
  console.log("\n=== Mnemo Init (global) ===\n");

  // 1. Create data directory
  fs.mkdirSync(MNEMO_DATA_DIR, { recursive: true });
  console.log(`  ✓ Data directory: ${MNEMO_DATA_DIR}`);

  // 2. Ollama check
  checkOllama();

  // 3. Register MCP server globally via claude mcp add
  try {
    execSync(
      [
        "claude",
        "mcp",
        "add",
        "--transport",
        "stdio",
        "--scope",
        "user",
        "-e",
        `MNEMO_DATA_DIR=${MNEMO_DATA_DIR}`,
        "-e",
        "OLLAMA_URL=http://localhost:11434",
        "mnemo",
        "--",
        "node",
        path.join(MNEMO_ROOT, "dist/src/index.js"),
      ].join(" "),
      { stdio: "pipe" }
    );
    console.log("  ✓ MCP server: registered globally (claude mcp add)");
  } catch {
    console.error(
      "  ✗ MCP server registration failed. Is Claude Code CLI installed?"
    );
    console.error(
      "    Run manually:"
    );
    console.error(
      `      claude mcp add --transport stdio --scope user \\`
    );
    console.error(
      `        -e MNEMO_DATA_DIR=${MNEMO_DATA_DIR} \\`
    );
    console.error(
      `        -e OLLAMA_URL=http://localhost:11434 \\`
    );
    console.error(
      `        mnemo -- node ${path.join(MNEMO_ROOT, "dist/src/index.js")}`
    );
  }

  // 4. Copy hook scripts to ~/.mnemo/hooks/
  const hooksDestDir = path.join(MNEMO_DATA_DIR, "hooks");
  fs.mkdirSync(hooksDestDir, { recursive: true });
  const hookFiles = ["session-start.sh", "post-tool-use.sh"];
  for (const file of hookFiles) {
    fs.copyFileSync(
      path.join(MNEMO_ROOT, "hooks", file),
      path.join(hooksDestDir, file)
    );
    fs.chmodSync(path.join(hooksDestDir, file), 0o755);
  }
  console.log(`  ✓ ${hooksDestDir}: hook scripts copied`);

  // 5. Merge hooks into ~/.claude/settings.json
  const settingsPath = path.join(HOME_DIR, ".claude", "settings.json");
  mergeHooksToSettings(settingsPath, path.join(MNEMO_DATA_DIR, "hooks"));
  console.log("  ✓ ~/.claude/settings.json: hooks configured");

  // 6. Summary
  console.log("\n=== Global Setup Complete ===\n");
  console.log("Mnemo MCP server is now available in all Claude Code sessions.");
  console.log("\nNote:");
  console.log("  Skills (slash commands) are project-specific.");
  console.log('  Run "mnemo init" in each project to add skills.\n');
}

async function cleanupProject(): Promise<void> {
  const projectDir = process.cwd();
  const projectName = path.basename(projectDir);

  console.log(`\n=== Mnemo Cleanup (project: ${projectName}) ===\n`);

  // 1. Remove mnemo from .mcp.json
  const mcpJsonPath = path.join(projectDir, ".mcp.json");
  if (fs.existsSync(mcpJsonPath)) {
    const mcpConfig = JSON.parse(fs.readFileSync(mcpJsonPath, "utf8"));
    if (mcpConfig.mcpServers?.mnemo) {
      delete mcpConfig.mcpServers.mnemo;
      if (Object.keys(mcpConfig.mcpServers).length === 0) {
        delete mcpConfig.mcpServers;
      }
      if (Object.keys(mcpConfig).length === 0) {
        fs.unlinkSync(mcpJsonPath);
        console.log("  ✓ .mcp.json: deleted (was empty)");
      } else {
        fs.writeFileSync(
          mcpJsonPath,
          JSON.stringify(mcpConfig, null, 2) + "\n"
        );
        console.log("  ✓ .mcp.json: mnemo entry removed");
      }
    } else {
      console.log("  - .mcp.json: no mnemo entry found");
    }
  } else {
    console.log("  - .mcp.json: not found");
  }

  // 2. Remove hooks from .claude/settings.json
  const settingsPath = path.join(projectDir, ".claude", "settings.json");
  if (removeHooksFromSettings(settingsPath)) {
    console.log("  ✓ .claude/settings.json: hooks removed");
  } else {
    console.log("  - .claude/settings.json: no hooks found");
  }

  // 3. Remove hook scripts from .claude/hooks/
  const hooksDir = path.join(projectDir, ".claude", "hooks");
  for (const file of ["session-start.sh", "post-tool-use.sh"]) {
    const filePath = path.join(hooksDir, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  removeDirIfEmpty(hooksDir);
  console.log("  ✓ .claude/hooks/: hook scripts removed");

  // 4. Remove skills from .claude/skills/
  const skillsDir = path.join(projectDir, ".claude", "skills");
  const skillDirs = [
    "learn",
    "research",
    "setup",
    "session-review",
    "doc",
    "code-reuse-finder",
  ];
  for (const dir of skillDirs) {
    const dirPath = path.join(skillsDir, dir);
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true });
    }
  }
  removeDirIfEmpty(skillsDir);
  console.log("  ✓ .claude/skills/: skills removed");

  // Clean up .claude/ directory if empty
  removeDirIfEmpty(path.join(projectDir, ".claude"));

  // 5. Summary
  console.log("\n=== Cleanup Complete ===\n");
  console.log(`Data in ${MNEMO_DATA_DIR} has been preserved.`);
  console.log(`To delete all data: rm -rf ${MNEMO_DATA_DIR}\n`);
}

async function cleanupGlobal(): Promise<void> {
  console.log("\n=== Mnemo Cleanup (global) ===\n");

  // 1. Remove MCP server via claude mcp remove
  try {
    execSync("claude mcp remove mnemo", { stdio: "pipe" });
    console.log("  ✓ MCP server: removed (claude mcp remove)");
  } catch {
    console.log("  - MCP server: not found or already removed");
  }

  // 2. Remove hooks from ~/.claude/settings.json
  const settingsPath = path.join(HOME_DIR, ".claude", "settings.json");
  if (removeHooksFromSettings(settingsPath)) {
    console.log("  ✓ ~/.claude/settings.json: hooks removed");
  } else {
    console.log("  - ~/.claude/settings.json: no hooks found");
  }

  // 3. Remove hook scripts from ~/.mnemo/hooks/
  const hooksDir = path.join(MNEMO_DATA_DIR, "hooks");
  if (fs.existsSync(hooksDir)) {
    fs.rmSync(hooksDir, { recursive: true });
    console.log("  ✓ ~/.mnemo/hooks/: removed");
  } else {
    console.log("  - ~/.mnemo/hooks/: not found");
  }

  // 4. Summary
  console.log("\n=== Global Cleanup Complete ===\n");
  console.log(`Data in ${MNEMO_DATA_DIR} has been preserved.`);
  console.log(`To delete all data: rm -rf ${MNEMO_DATA_DIR}\n`);
}

// --- init command ---
program
  .command("init")
  .description("Initialize Mnemo for the current project or globally")
  .option("--global", "Set up globally for all projects (MCP + hooks in user scope)")
  .action(async (opts) => {
    try {
      if (opts.global) {
        await initGlobal();
      } else {
        await initProject();
      }
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

// --- cleanup command ---
program
  .command("cleanup")
  .description("Remove Mnemo configuration from the current project or globally")
  .option("--global", "Remove global configuration")
  .action(async (opts) => {
    try {
      if (opts.global) {
        await cleanupGlobal();
      } else {
        await cleanupProject();
      }
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

program.parse();
