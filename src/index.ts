#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { learn, recall, stats, remove, computeTtlStatus } from "./core/knowledge-store.js";
import {
  writeSessionLog,
  listSessionLogs,
  getSessionLog,
  getRecentSessionLogs,
} from "./core/session-store.js";
import { getKnowledgeById } from "./db/lance-client.js";
import { exportToMarkdown } from "./core/exporter.js";
import { exportToObsidian } from "./core/obsidian-exporter.js";
import {
  generateClaudeMdSection,
  writeClaudeMd,
} from "./core/claude-md-generator.js";
import {
  registerProject,
  listProjects,
  getProject,
  detectProject,
  getProjectStats,
  removeProject,
} from "./core/project-store.js";
import {
  addTask,
  listTasks,
  updateTask,
  updateTaskStatus,
  removeTask,
} from "./core/task-store.js";
import {
  createBackup,
  restoreBackup,
  listBackups,
  checkAndMigrate,
} from "./core/backup.js";
import {
  createDoc,
  listDocs,
  getDoc,
  updateDoc,
  deleteDoc,
} from "./core/doc-store.js";
import {
  loadProfile,
  setProfileValue,
  getProfileValue,
  deleteProfileValue,
  resetProfile,
  formatProfile,
} from "./core/profile-store.js";
import type { KnowledgeType, TaskStatus, TaskPriority, DocScope, ProfileCategory } from "./types/index.js";

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

const server = new McpServer({
  name: "mnemo",
  version: "0.3.0",
});

// --- mnemo_learn ---
server.tool(
  "mnemo_learn",
  "Store a piece of knowledge (lesson, pitfall, pattern, preference, solution, reference, procedure) into Mnemo. Automatically generates semantic embeddings for intelligent retrieval. Use type 'reference' for web research results with TTL. Use type 'procedure' for structured setup/configuration guides (no decay, no TTL).",
  {
    type: z
      .enum(["lesson", "pitfall", "preference", "pattern", "solution", "reference", "procedure"])
      .describe("Type of knowledge. 'reference' for web research with TTL. 'procedure' for setup guides (no decay)"),
    title: z.string().describe("Short title summarizing the knowledge"),
    content: z
      .string()
      .describe("Detailed content / summary of the knowledge entry (used for embedding & search)"),
    project: z
      .string()
      .optional()
      .describe("Project name (omit for cross-project knowledge)"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Tags for categorization"),
    language: z
      .string()
      .optional()
      .describe("Programming language (e.g. typescript, python)"),
    framework: z
      .string()
      .optional()
      .describe("Framework (e.g. nextjs, react)"),
    rawContent: z
      .string()
      .optional()
      .describe("Full fetched text content (for reference type). Not used for embedding."),
    sourceUrl: z
      .string()
      .optional()
      .describe("Source URL or Context7 libraryId (for reference type)"),
    sourceType: z
      .enum(["web", "context7"])
      .optional()
      .describe("Source type (for reference type)"),
    ttlDays: z
      .number()
      .optional()
      .describe("Days until content expires (for reference type). 0 = never expires. Guidelines: docs 90, blog 180, news 30, spec 365"),
  },
  async (args) => {
    try {
      const entry = await learn({
        type: args.type as KnowledgeType,
        title: args.title,
        content: args.content,
        project: args.project,
        tags: args.tags,
        language: args.language,
        framework: args.framework,
        rawContent: args.rawContent,
        sourceUrl: args.sourceUrl,
        sourceType: args.sourceType,
        ttlDays: args.ttlDays,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Knowledge stored successfully!\n\nID: ${entry.id}\nType: ${entry.type}\nTitle: ${entry.title}${entry.project ? `\nProject: ${entry.project}` : ""}${entry.sourceUrl ? `\nSource: ${entry.sourceUrl}` : ""}${entry.ttlDays ? `\nTTL: ${entry.ttlDays} days` : ""}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to store knowledge: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- mnemo_recall ---
server.tool(
  "mnemo_recall",
  "Search the Mnemo knowledge base using hybrid retrieval (semantic vector search + full-text keyword search). Returns the most relevant knowledge entries ranked by a multi-dimensional score. Use 'id' parameter for direct lookup with full details including rawContent.",
  {
    query: z
      .string()
      .optional()
      .describe("Search query (natural language or keywords). Required unless 'id' is specified."),
    id: z
      .string()
      .optional()
      .describe("Direct lookup by ID (full or short prefix). Returns full entry including rawContent."),
    type: z
      .enum(["lesson", "pitfall", "preference", "pattern", "solution", "reference", "procedure"])
      .optional()
      .describe("Filter by knowledge type"),
    project: z.string().optional().describe("Filter by project name"),
    language: z.string().optional().describe("Filter by language"),
    framework: z.string().optional().describe("Filter by framework"),
    limit: z
      .number()
      .optional()
      .default(10)
      .describe("Maximum results to return"),
  },
  async (args) => {
    try {
      // Direct lookup by ID — returns full entry including rawContent
      if (args.id) {
        const { resolveKnowledgeById } = await import("./db/lance-client.js");
        const entry = await resolveKnowledgeById(args.id);
        const ttl = computeTtlStatus(entry);
        const ttlLine = ttl
          ? ttl.expired
            ? `\n**⚠️ TTL expired** (${Math.abs(ttl.daysRemaining)} days ago)`
            : `\n**TTL:** ${ttl.daysRemaining} days remaining`
          : "";
        const sourceLine = entry.sourceUrl ? `\n**Source:** ${entry.sourceUrl} (${entry.sourceType})` : "";

        let text = `# ${entry.title}\n\n` +
          `**ID:** ${entry.id}\n` +
          `**Type:** ${entry.type}` +
          (entry.project ? ` | **Project:** ${entry.project}` : "") +
          (entry.language ? ` | **Language:** ${entry.language}` : "") +
          (entry.framework ? ` | **Framework:** ${entry.framework}` : "") +
          sourceLine + ttlLine +
          `\n**Confidence:** ${entry.confidence.toFixed(2)}` +
          `\n**Created:** ${formatLocalTime(entry.createdAt)}` +
          `\n\n## Content\n\n${entry.content}`;

        if (entry.rawContent) {
          text += `\n\n## Full Content\n\n${entry.rawContent}`;
        }

        return {
          content: [{ type: "text" as const, text }],
        };
      }

      // Search mode — requires query
      if (!args.query) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: 'query' or 'id' is required.",
            },
          ],
          isError: true,
        };
      }

      const results = await recall(args.query, {
        type: args.type as KnowledgeType | undefined,
        project: args.project,
        language: args.language,
        framework: args.framework,
        limit: args.limit,
      });

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No matching knowledge found.",
            },
          ],
        };
      }

      const formatted = results
        .map((r, i) => {
          let line =
            `### ${i + 1}. ${r.title} (score: ${r.score.toFixed(3)})\n` +
            `**Type:** ${r.type}` +
            (r.project ? ` | **Project:** ${r.project}` : "") +
            (r.language ? ` | **Language:** ${r.language}` : "") +
            (r.framework ? ` | **Framework:** ${r.framework}` : "");

          // Add source info for references
          if (r.type === "reference") {
            // Fetch full entry for TTL/source info
            const entry = results[i] as unknown as Record<string, unknown>;
            const sourceUrl = (entry.sourceUrl as string) || "";
            if (sourceUrl) line += `\n**Source:** ${sourceUrl}`;
          }

          // TTL status (check via underlying data if available)
          const entryData = r as unknown as Record<string, unknown>;
          if (entryData.type === "reference" && entryData.ttlDays && (entryData.ttlDays as number) > 0 && entryData.fetchedAt) {
            const fetchedMs = new Date(entryData.fetchedAt as string).getTime();
            const expiresMs = fetchedMs + (entryData.ttlDays as number) * 24 * 60 * 60 * 1000;
            const daysRemaining = Math.ceil((expiresMs - Date.now()) / (24 * 60 * 60 * 1000));
            if (daysRemaining <= 0) {
              line += ` | **⚠️ Expired** (${Math.abs(daysRemaining)} days ago)`;
            } else {
              line += ` | **TTL:** ${daysRemaining}d`;
            }
          }

          line += `\n\n${r.content}\n`;
          return line;
        })
        .join("\n---\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${results.length} results:\n\n${formatted}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- mnemo_stats ---
server.tool(
  "mnemo_stats",
  "Get statistics about the Mnemo knowledge base: total entries, breakdown by type, project, and language.",
  {},
  async () => {
    try {
      const s = await stats();

      const lines = [
        `# Mnemo Statistics\n`,
        `**Total Entries:** ${s.totalEntries}\n`,
      ];

      if (Object.keys(s.byType).length > 0) {
        lines.push("## By Type");
        for (const [type, count] of Object.entries(s.byType)) {
          lines.push(`- ${type}: ${count}`);
        }
        lines.push("");
      }

      if (Object.keys(s.byProject).length > 0) {
        lines.push("## By Project");
        for (const [project, count] of Object.entries(s.byProject)) {
          lines.push(`- ${project}: ${count}`);
        }
        lines.push("");
      }

      if (Object.keys(s.byLanguage).length > 0) {
        lines.push("## By Language");
        for (const [lang, count] of Object.entries(s.byLanguage)) {
          lines.push(`- ${lang}: ${count}`);
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: lines.join("\n"),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Stats failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- mnemo_export ---
server.tool(
  "mnemo_export",
  "Export knowledge to files. Supports two formats: 'markdown' (flat grouped files) and 'obsidian' (vault with YAML frontmatter, wikilinks, and folder structure for all data types).",
  {
    outputDir: z
      .string()
      .optional()
      .describe("Output directory (defaults to ~/.mnemo/exports/ for markdown, ~/.mnemo/obsidian-vault/ for obsidian)"),
    format: z
      .enum(["markdown", "obsidian"])
      .optional()
      .default("markdown")
      .describe("Export format: markdown (knowledge only, flat files) or obsidian (all data with frontmatter and wikilinks)"),
    type: z
      .enum(["lesson", "pitfall", "preference", "pattern", "solution", "reference", "procedure"])
      .optional()
      .describe("Filter by knowledge type"),
    project: z.string().optional().describe("Filter by project"),
  },
  async (args) => {
    try {
      if (args.format === "obsidian") {
        const result = await exportToObsidian(args.outputDir, {
          type: args.type,
          project: args.project,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Obsidian vault exported to: ${result.dir}\n  Knowledge: ${result.counts.knowledge}, Projects: ${result.counts.projects}, Tasks: ${result.counts.tasks}, Docs: ${result.counts.docs}`,
            },
          ],
        };
      }

      const dir = await exportToMarkdown(args.outputDir, {
        type: args.type,
        project: args.project,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Knowledge exported to: ${dir}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Export failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- mnemo_project ---
server.tool(
  "mnemo_project",
  "Manage Mnemo projects: register, list, get info, or detect current project from working directory.",
  {
    action: z
      .enum(["register", "list", "get", "detect"])
      .describe("Action to perform"),
    name: z
      .string()
      .optional()
      .describe("Project name (required for register/get)"),
    path: z
      .string()
      .optional()
      .describe("Project root path (required for register, used by detect)"),
    description: z.string().optional().describe("Project description"),
    techStack: z
      .array(z.string())
      .optional()
      .describe("Technologies used (e.g. ['typescript', 'react'])"),
    language: z.string().optional().describe("Primary language"),
    framework: z.string().optional().describe("Primary framework"),
  },
  async (args) => {
    try {
      switch (args.action) {
        case "register": {
          if (!args.name || !args.path) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: 'name' and 'path' are required for register action.",
                },
              ],
              isError: true,
            };
          }
          const project = await registerProject({
            name: args.name,
            path: args.path,
            description: args.description,
            techStack: args.techStack,
            language: args.language,
            framework: args.framework,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: `プロジェクトを登録しました: ${project.name}\n\nID: ${project.id}\nPath: ${project.path}${project.description ? `\nDescription: ${project.description}` : ""}${project.language ? `\nLanguage: ${project.language}` : ""}${project.framework ? `\nFramework: ${project.framework}` : ""}`,
              },
            ],
          };
        }

        case "list": {
          const projects = await listProjects();
          if (projects.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "登録済みプロジェクトはありません。",
                },
              ],
            };
          }
          const lines = projects.map((p) => {
            const tech = JSON.parse(p.techStack || "[]").join(", ");
            return `- **${p.name}** — ${p.description || "(説明なし)"}\n  Path: ${p.path}${tech ? `\n  Tech: ${tech}` : ""}`;
          });
          return {
            content: [
              {
                type: "text" as const,
                text: `# 登録済みプロジェクト (${projects.length}件)\n\n${lines.join("\n\n")}`,
              },
            ],
          };
        }

        case "get": {
          if (!args.name) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: 'name' is required for get action.",
                },
              ],
              isError: true,
            };
          }
          const projectStats = await getProjectStats(args.name);
          if (!projectStats) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `プロジェクト "${args.name}" が見つかりません。`,
                },
              ],
              isError: true,
            };
          }
          const { project: p, knowledgeCount, knowledgeByType, taskCounts } = projectStats;
          const tech = JSON.parse(p.techStack || "[]").join(", ");
          const typeBreakdown = Object.entries(knowledgeByType)
            .map(([t, c]) => `${t}: ${c}`)
            .join(", ");

          return {
            content: [
              {
                type: "text" as const,
                text: `# プロジェクト: ${p.name}\n\n` +
                  `- **Path:** ${p.path}\n` +
                  `- **説明:** ${p.description || "-"}\n` +
                  `- **技術スタック:** ${tech || "-"}\n` +
                  `- **言語:** ${p.language || "-"}\n` +
                  `- **フレームワーク:** ${p.framework || "-"}\n\n` +
                  `## ナレッジ: ${knowledgeCount}件\n` +
                  (typeBreakdown ? `${typeBreakdown}\n\n` : "\n") +
                  `## タスク: ${taskCounts.total}件\n` +
                  `todo: ${taskCounts.todo} | 進行中: ${taskCounts.inProgress} | 完了: ${taskCounts.done}`,
              },
            ],
          };
        }

        case "detect": {
          const detectPath = args.path || process.cwd();
          const detected = await detectProject(detectPath);
          if (!detected) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `パス "${detectPath}" に対応する登録済みプロジェクトが見つかりません。\nmnemo_project の register アクションで登録してください。`,
                },
              ],
            };
          }
          return {
            content: [
              {
                type: "text" as const,
                text: `検出されたプロジェクト: ${detected.name}\nPath: ${detected.path}`,
              },
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: "text" as const,
                text: `Unknown action: ${args.action}`,
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Project operation failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- mnemo_task ---
server.tool(
  "mnemo_task",
  "Manage tasks within a Mnemo project: add, list, update, or complete tasks.",
  {
    action: z
      .enum(["add", "list", "update", "done"])
      .describe("Action to perform"),
    project: z
      .string()
      .optional()
      .describe("Project name (required for add/list)"),
    title: z.string().optional().describe("Task title (required for add)"),
    description: z.string().optional().describe("Task description"),
    priority: z
      .enum(["low", "medium", "high"])
      .optional()
      .describe("Task priority"),
    parentId: z.string().optional().describe("Parent task ID for subtasks"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Tags for categorization"),
    status: z
      .enum(["todo", "in_progress", "done"])
      .optional()
      .describe("Filter by status (for list) or new status (for update)"),
    taskId: z
      .string()
      .optional()
      .describe("Task ID or short prefix (required for update/done). Supports prefix matching like git short hashes."),
    newTitle: z.string().optional().describe("New title (for update)"),
    newPriority: z
      .enum(["low", "medium", "high"])
      .optional()
      .describe("New priority (for update)"),
  },
  async (args) => {
    try {
      switch (args.action) {
        case "add": {
          if (!args.project || !args.title) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: 'project' and 'title' are required for add action.",
                },
              ],
              isError: true,
            };
          }
          const task = await addTask({
            projectName: args.project,
            title: args.title,
            description: args.description,
            priority: args.priority as TaskPriority | undefined,
            parentId: args.parentId,
            tags: args.tags,
          });
          const priorityLabel: Record<string, string> = {
            high: "高",
            medium: "中",
            low: "低",
          };
          return {
            content: [
              {
                type: "text" as const,
                text: `タスクを追加しました: ${task.title}\n\nID: ${task.id}\nProject: ${args.project}\n優先度: ${priorityLabel[task.priority] ?? task.priority}`,
              },
            ],
          };
        }

        case "list": {
          if (!args.project) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: 'project' is required for list action.",
                },
              ],
              isError: true,
            };
          }
          const tasks = await listTasks(args.project, {
            status: args.status as TaskStatus | undefined,
          });

          if (tasks.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `${args.project} のタスクはありません。`,
                },
              ],
            };
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

          const lines = tasks.map((t) => {
            const icon = statusIcon[t.status] ?? "[ ]";
            const pri = priorityLabel[t.priority] ?? t.priority;
            let line = `${icon} [${pri}] ${t.title} (${t.id.slice(0, 8)})`;
            if (t.completedAt) line += ` — 完了: ${formatLocalTime(t.completedAt)}`;
            if (t.description) line += `\n    ${t.description.slice(0, 100)}`;
            return line;
          });

          return {
            content: [
              {
                type: "text" as const,
                text: `# ${args.project} のタスク一覧 (${tasks.length}件)\n\n${lines.join("\n")}`,
              },
            ],
          };
        }

        case "update": {
          if (!args.taskId) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: 'taskId' is required for update action.",
                },
              ],
              isError: true,
            };
          }
          const updated = await updateTask(args.taskId, {
            title: args.newTitle,
            status: args.status as TaskStatus | undefined,
            priority: args.newPriority as TaskPriority | undefined,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: `タスクを更新しました: ${updated.title}\n\nStatus: ${updated.status}\nPriority: ${updated.priority}`,
              },
            ],
          };
        }

        case "done": {
          if (!args.taskId) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: 'taskId' is required for done action.",
                },
              ],
              isError: true,
            };
          }
          const completed = await updateTaskStatus(args.taskId, "done");
          return {
            content: [
              {
                type: "text" as const,
                text: `タスクを完了にしました: ${completed.title}`,
              },
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: "text" as const,
                text: `Unknown action: ${args.action}`,
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Task operation failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- mnemo_backup ---
server.tool(
  "mnemo_backup",
  "Backup or restore Mnemo data. Creates JSON backups (vectors excluded, re-generated on restore).",
  {
    action: z
      .enum(["create", "restore", "list"])
      .describe("Action: create backup, restore from backup, or list backups"),
    path: z
      .string()
      .optional()
      .describe("File path (for create: output path, for restore: input path)"),
  },
  async (args) => {
    try {
      switch (args.action) {
        case "create": {
          const backupPath = await createBackup(args.path);
          return {
            content: [
              {
                type: "text" as const,
                text: `バックアップを作成しました: ${backupPath}`,
              },
            ],
          };
        }

        case "restore": {
          if (!args.path) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: 'path' is required for restore action.",
                },
              ],
              isError: true,
            };
          }
          const counts = await restoreBackup(args.path);
          return {
            content: [
              {
                type: "text" as const,
                text: `リストアが完了しました:\n- ナレッジ: ${counts.knowledge}件\n- プロジェクト: ${counts.projects}件\n- タスク: ${counts.tasks}件`,
              },
            ],
          };
        }

        case "list": {
          const backups = listBackups();
          if (backups.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "バックアップはありません。",
                },
              ],
            };
          }
          const lines = backups.map(
            (b, i) => `${i + 1}. ${b.path}\n   サイズ: ${b.size} | 作成日: ${b.createdAt.slice(0, 19)}`
          );
          return {
            content: [
              {
                type: "text" as const,
                text: `# バックアップ一覧 (${backups.length}件)\n\n${lines.join("\n\n")}`,
              },
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: "text" as const,
                text: `Unknown action: ${args.action}`,
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Backup operation failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- mnemo_generate ---
server.tool(
  "mnemo_generate",
  "Generate or update the CLAUDE.md file for a project from Mnemo's knowledge base. Uses marker-based partial updates to preserve user-written content. The generated section includes pitfalls, preferences, patterns, lessons, solutions, and active tasks.",
  {
    project: z
      .string()
      .describe("Project name to generate CLAUDE.md for"),
    dryRun: z
      .boolean()
      .optional()
      .default(false)
      .describe("If true, return generated content without writing to file"),
  },
  async (args) => {
    try {
      if (args.dryRun) {
        const content = await generateClaudeMdSection(args.project);
        return {
          content: [
            {
              type: "text" as const,
              text: `# CLAUDE.md プレビュー (${args.project})\n\n${content}`,
            },
          ],
        };
      }

      const filePath = await writeClaudeMd(args.project);
      return {
        content: [
          {
            type: "text" as const,
            text: `CLAUDE.md を生成しました: ${filePath}\n\nユーザー手書き部分は保持されています。マーカー（MNEMO:START/END）間の内容のみ更新しました。`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `CLAUDE.md generation failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- mnemo_doc ---
server.tool(
  "mnemo_doc",
  "Manage project specification documents stored in .claude/docs/. Create, list, read, update, or delete structured docs that Claude Code can read directly. Each doc is a Markdown file with metadata in index.json.",
  {
    action: z
      .enum(["create", "list", "get", "update", "delete"])
      .describe("Action to perform"),
    project: z
      .string()
      .describe("Project name"),
    id: z
      .string()
      .optional()
      .describe("Document ID/slug (required for get/update/delete, optional for create)"),
    title: z
      .string()
      .optional()
      .describe("Document title (required for create)"),
    content: z
      .string()
      .optional()
      .describe("Markdown content body (required for create, optional for update)"),
    summary: z
      .string()
      .optional()
      .describe("One-line summary under 120 chars (required for create)"),
    scope: z
      .enum(["global", "feature", "api"])
      .optional()
      .describe("Doc scope: global (system design), feature (specific feature), api (interfaces)"),
    relatedFiles: z
      .array(z.string())
      .optional()
      .describe("Related source file paths relative to project root"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Tags for categorization"),
  },
  async (args) => {
    try {
      switch (args.action) {
        case "create": {
          if (!args.title || !args.content || !args.summary) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: 'title', 'content', and 'summary' are required for create action.",
                },
              ],
              isError: true,
            };
          }
          const doc = await createDoc({
            projectName: args.project,
            title: args.title,
            content: args.content,
            summary: args.summary,
            scope: args.scope as DocScope | undefined,
            relatedFiles: args.relatedFiles,
            tags: args.tags,
            id: args.id,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: `ドキュメントを作成しました: ${doc.title}\n\nID: ${doc.id}\nFile: .claude/docs/${doc.filename}\nScope: ${doc.scope}`,
              },
            ],
          };
        }

        case "list": {
          const docs = await listDocs(args.project);
          if (docs.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `${args.project} のドキュメントはありません。`,
                },
              ],
            };
          }
          const lines = docs.map((d) =>
            `- **${d.title}** (${d.id}) [${d.scope}]\n  ${d.summary}`
          );
          return {
            content: [
              {
                type: "text" as const,
                text: `# ${args.project} のドキュメント (${docs.length}件)\n\n${lines.join("\n\n")}`,
              },
            ],
          };
        }

        case "get": {
          if (!args.id) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: 'id' is required for get action.",
                },
              ],
              isError: true,
            };
          }
          const doc = await getDoc(args.project, args.id);
          return {
            content: [
              {
                type: "text" as const,
                text: `# ${doc.title}\n\n` +
                  `**Scope:** ${doc.scope} | **Tags:** ${doc.tags.join(", ") || "-"}\n` +
                  `**Related files:** ${doc.relatedFiles.join(", ") || "-"}\n` +
                  `**Updated:** ${formatLocalTime(doc.updatedAt)}\n\n---\n\n${doc.content}`,
              },
            ],
          };
        }

        case "update": {
          if (!args.id) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: 'id' is required for update action.",
                },
              ],
              isError: true,
            };
          }
          const updated = await updateDoc(args.project, args.id, {
            title: args.title,
            content: args.content,
            summary: args.summary,
            scope: args.scope as DocScope | undefined,
            relatedFiles: args.relatedFiles,
            tags: args.tags,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: `ドキュメントを更新しました: ${updated.title} (${updated.id})`,
              },
            ],
          };
        }

        case "delete": {
          if (!args.id) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: 'id' is required for delete action.",
                },
              ],
              isError: true,
            };
          }
          const deleted = await deleteDoc(args.project, args.id);
          return {
            content: [
              {
                type: "text" as const,
                text: `ドキュメントを削除しました: ${deleted.title} (${deleted.id})`,
              },
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: "text" as const,
                text: `Unknown action: ${args.action}`,
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Doc operation failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- mnemo_delete ---
server.tool(
  "mnemo_delete",
  "Delete a knowledge entry, task, or project from Mnemo. Supports short ID prefix matching (like git short hashes). Deleting a project also removes all its tasks (cascade delete).",
  {
    type: z
      .enum(["knowledge", "task", "project"])
      .describe("Type of entry to delete"),
    id: z
      .string()
      .describe("ID or short prefix of the entry to delete"),
  },
  async (args) => {
    try {
      switch (args.type) {
        case "knowledge": {
          const entry = await remove(args.id);
          return {
            content: [
              {
                type: "text" as const,
                text: `ナレッジを削除しました: [${entry.type}] ${entry.title} (${entry.id.slice(0, 8)})`,
              },
            ],
          };
        }

        case "task": {
          const task = await removeTask(args.id);
          return {
            content: [
              {
                type: "text" as const,
                text: `タスクを削除しました: ${task.title} (${task.id.slice(0, 8)})`,
              },
            ],
          };
        }

        case "project": {
          const { project, deletedTasks } = await removeProject(args.id);
          return {
            content: [
              {
                type: "text" as const,
                text: `プロジェクトを削除しました: ${project.name} (${project.id.slice(0, 8)})\n紐づくタスク ${deletedTasks}件 も削除しました。`,
              },
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: "text" as const,
                text: `Unknown type: ${args.type}`,
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Delete failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- mnemo_session ---
server.tool(
  "mnemo_session",
  "Manage session logs for continuity between Claude Code sessions. Write a session summary at session end, or read recent logs to restore context. Session logs record what was done, decisions made, and what's next.",
  {
    action: z
      .enum(["write", "list", "get", "recent"])
      .describe("Action: write (record log), list (show entries), get (specific date), recent (rolling window)"),
    project: z
      .string()
      .optional()
      .describe("Project name (required for write/get/recent, optional for list)"),
    summary: z
      .string()
      .optional()
      .describe("Session summary - 1-2 sentences of what was done (required for write)"),
    tasksWorkedOn: z
      .array(z.string())
      .optional()
      .describe("Tasks worked on: '[x] completed task', '[>] in progress task'"),
    keyDecisions: z
      .array(z.string())
      .optional()
      .describe("Key decisions and rationale made during the session"),
    filesModified: z
      .array(z.string())
      .optional()
      .describe("Files modified during the session"),
    errorsSolutions: z
      .array(z.string())
      .optional()
      .describe("Errors encountered and their solutions"),
    nextSteps: z
      .array(z.string())
      .optional()
      .describe("What to do next / pending items for the next session"),
    date: z
      .string()
      .optional()
      .describe("Date in YYYY-MM-DD format (for get action)"),
    days: z
      .number()
      .optional()
      .describe("Number of days to look back (for recent action, default 3)"),
  },
  async (args) => {
    try {
      switch (args.action) {
        case "write": {
          if (!args.project || !args.summary) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: 'project' and 'summary' are required for write action.",
                },
              ],
              isError: true,
            };
          }
          const entry = writeSessionLog({
            timestamp: new Date().toISOString(),
            project: args.project,
            summary: args.summary,
            tasksWorkedOn: args.tasksWorkedOn,
            keyDecisions: args.keyDecisions,
            filesModified: args.filesModified,
            errorsSolutions: args.errorsSolutions,
            nextSteps: args.nextSteps,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: `セッションログを記録しました: ${args.project} (${entry.date})\nSessions today: ${entry.sessionCount}`,
              },
            ],
          };
        }

        case "list": {
          const entries = listSessionLogs(args.project);
          if (entries.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: args.project
                    ? `${args.project} のセッションログはありません。`
                    : "セッションログはありません。",
                },
              ],
            };
          }
          const lines = entries.map(
            (e) =>
              `- ${e.date} [${e.project}] — ${e.sessionCount} session(s)`
          );
          return {
            content: [
              {
                type: "text" as const,
                text: `セッションログ一覧 (${entries.length}件)\n\n${lines.join("\n")}`,
              },
            ],
          };
        }

        case "get": {
          if (!args.project || !args.date) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: 'project' and 'date' are required for get action.",
                },
              ],
              isError: true,
            };
          }
          const content = getSessionLog(args.project, args.date);
          return {
            content: [
              {
                type: "text" as const,
                text: `# ${args.project} — ${args.date}\n\n${content}`,
              },
            ],
          };
        }

        case "recent": {
          if (!args.project) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: 'project' is required for recent action.",
                },
              ],
              isError: true,
            };
          }
          const logs = getRecentSessionLogs(args.project, args.days);
          if (!logs) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `${args.project} の最近のセッションログはありません。`,
                },
              ],
            };
          }
          return {
            content: [
              {
                type: "text" as const,
                text: `# ${args.project} — 最近のセッションログ\n\n${logs}`,
              },
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: "text" as const,
                text: `Unknown action: ${args.action}`,
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Session operation failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- mnemo_profile ---
server.tool(
  "mnemo_profile",
  "Manage the global user profile for personalized Claude Code behavior. Profile is stored at ~/.mnemo/profile.json and injected at session start. Categories: identity (name, role, expertise), technical (languages, frameworks, os, editor), tools (packageManager, linter, formatter, testRunner, bundler), communication (language, style, verbosity), codingStyle (naming, patterns, conventions), customNotes (free-form text).",
  {
    action: z
      .enum(["show", "set", "get", "delete"])
      .describe(
        "Action: show (full profile), set (set a value), get (get category/key), delete (remove a key)"
      ),
    category: z
      .enum([
        "identity",
        "technical",
        "tools",
        "communication",
        "codingStyle",
        "customNotes",
      ])
      .optional()
      .describe("Profile category (required for set/get/delete)"),
    key: z
      .string()
      .optional()
      .describe(
        "Key within the category (required for set/delete, optional for get). For customNotes, key is ignored."
      ),
    value: z
      .string()
      .optional()
      .describe("Value to set (required for set action)"),
  },
  async (args) => {
    try {
      switch (args.action) {
        case "show": {
          const text = formatProfile();
          return {
            content: [{ type: "text" as const, text }],
          };
        }

        case "set": {
          if (!args.category || !args.value) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: 'category' and 'value' are required for set action.",
                },
              ],
              isError: true,
            };
          }
          const key = args.category === "customNotes" ? "_" : args.key;
          if (!key) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: 'key' is required for set action (except customNotes).",
                },
              ],
              isError: true,
            };
          }
          setProfileValue(
            args.category as ProfileCategory,
            key,
            args.value
          );
          return {
            content: [
              {
                type: "text" as const,
                text:
                  args.category === "customNotes"
                    ? `プロフィールを更新しました: customNotes`
                    : `プロフィールを更新しました: ${args.category}.${key} = ${args.value}`,
              },
            ],
          };
        }

        case "get": {
          if (!args.category) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: 'category' is required for get action.",
                },
              ],
              isError: true,
            };
          }
          if (args.category === "customNotes") {
            const notes = getProfileValue(args.category as ProfileCategory, "_");
            return {
              content: [
                {
                  type: "text" as const,
                  text: notes ? `customNotes: ${notes}` : "customNotes は空です。",
                },
              ],
            };
          }
          if (args.key) {
            const val = getProfileValue(
              args.category as ProfileCategory,
              args.key
            );
            return {
              content: [
                {
                  type: "text" as const,
                  text: val
                    ? `${args.category}.${args.key} = ${val}`
                    : `${args.category}.${args.key} は設定されていません。`,
                },
              ],
            };
          }
          // Return entire category
          const profile = loadProfile();
          const data = profile[
            args.category as keyof typeof profile
          ] as Record<string, string>;
          if (typeof data !== "object" || Object.keys(data).length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `${args.category} は空です。`,
                },
              ],
            };
          }
          const lines = Object.entries(data)
            .map(([k, v]) => `- ${k}: ${v}`)
            .join("\n");
          return {
            content: [
              {
                type: "text" as const,
                text: `# ${args.category}\n\n${lines}`,
              },
            ],
          };
        }

        case "delete": {
          if (!args.category) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: 'category' is required for delete action.",
                },
              ],
              isError: true,
            };
          }
          const delKey = args.category === "customNotes" ? "_" : args.key;
          if (!delKey) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: 'key' is required for delete action (except customNotes).",
                },
              ],
              isError: true,
            };
          }
          deleteProfileValue(args.category as ProfileCategory, delKey);
          return {
            content: [
              {
                type: "text" as const,
                text:
                  args.category === "customNotes"
                    ? `プロフィールから customNotes をクリアしました。`
                    : `プロフィールから ${args.category}.${delKey} を削除しました。`,
              },
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: "text" as const,
                text: `Unknown action: ${args.action}`,
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Profile operation failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- Start server ---
async function main() {
  // Check for schema migration on startup
  await checkAndMigrate();

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Mnemo MCP Server failed to start:", error);
  process.exit(1);
});
