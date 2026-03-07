import * as fs from "node:fs";
import * as path from "node:path";
import { getAllKnowledgeEntries } from "../db/lance-client.js";
import { getTasksByProject } from "../db/project-client.js";
import { getProject } from "./project-store.js";
import { getDocsSummary } from "./doc-store.js";
import type { KnowledgeEntry, TaskEntry } from "../types/index.js";

const MARKER_START =
  "<!-- MNEMO:START - この部分は Mnemo が自動生成します。手動で編集しないでください -->";
const MARKER_END = "<!-- MNEMO:END -->";

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

/** 知識タイプごとのセクション設定 */
const SECTION_CONFIG: {
  type: string;
  emoji: string;
  label: string;
}[] = [
  { type: "pitfall", emoji: "⚠️", label: "Pitfalls（既知の落とし穴）" },
  { type: "preference", emoji: "🎯", label: "Preferences（コーディング規約・好み）" },
  { type: "pattern", emoji: "📐", label: "Patterns（確立されたパターン）" },
  { type: "lesson", emoji: "💡", label: "Lessons（教訓）" },
  { type: "solution", emoji: "🔧", label: "Solutions（解決策）" },
];

/**
 * CLAUDE.md の Mnemo セクション（マーカー付き）を生成
 */
export async function generateClaudeMdSection(
  projectName: string
): Promise<string> {
  const project = await getProject(projectName);
  if (!project) {
    throw new Error(`プロジェクト "${projectName}" が見つかりません。`);
  }

  // --- 知識の取得・フィルタリング ---
  const allEntries = await getAllKnowledgeEntries();
  const relevant = allEntries.filter(
    (e) =>
      (e.project === projectName || e.project === "") && e.confidence >= 0.5
  );

  // タイプ別にグルーピング
  const byType = new Map<string, KnowledgeEntry[]>();
  for (const entry of relevant) {
    const list = byType.get(entry.type) ?? [];
    list.push(entry);
    byType.set(entry.type, list);
  }

  // 各グループ内で更新日降順ソート
  for (const entries of byType.values()) {
    entries.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  // --- タスクの取得 ---
  const tasks = await getTasksByProject(project.id);
  const activeTasks = tasks.filter((t) => t.status !== "done");
  // ソート: in_progress → todo, 高 → 中 → 低
  const priorityOrder: Record<string, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  const statusOrder: Record<string, number> = {
    in_progress: 0,
    todo: 1,
  };
  activeTasks.sort((a, b) => {
    const sd = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
    if (sd !== 0) return sd;
    return (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
  });

  // --- Markdown 生成 ---
  const lines: string[] = [];
  lines.push(MARKER_START);
  lines.push(`<!-- 最終更新: ${formatLocalTime(new Date().toISOString())} -->`);
  lines.push("");

  // プロジェクト情報
  const techStack = JSON.parse(project.techStack || "[]") as string[];
  lines.push("## プロジェクト情報");
  lines.push(`- **名前:** ${project.name}`);
  if (project.description) lines.push(`- **説明:** ${project.description}`);
  if (project.language) lines.push(`- **言語:** ${project.language}`);
  if (project.framework)
    lines.push(`- **フレームワーク:** ${project.framework}`);
  if (techStack.length > 0)
    lines.push(`- **技術スタック:** ${techStack.join(", ")}`);
  lines.push("");

  // ドキュメントセクション
  const docsSummary = await getDocsSummary(projectName);
  if (docsSummary) {
    lines.push(docsSummary);
  }

  // 知識セクション（エントリがあるタイプのみ出力）
  for (const sec of SECTION_CONFIG) {
    const entries = byType.get(sec.type);
    if (!entries || entries.length === 0) continue;

    lines.push(`## ${sec.emoji} ${sec.label}`);
    for (const entry of entries) {
      const scope = entry.project === "" ? " _(グローバル)_" : "";
      // title を太字、content を本文
      const contentOneLine = entry.content
        .replace(/\n/g, " ")
        .slice(0, 200);
      lines.push(`- **${entry.title}**${scope}: ${contentOneLine}`);
    }
    lines.push("");
  }

  // Active Tasks セクション
  if (activeTasks.length > 0) {
    lines.push("## 📋 Active Tasks");
    const priorityLabel: Record<string, string> = {
      high: "高",
      medium: "中",
      low: "低",
    };
    for (const t of activeTasks) {
      const icon = t.status === "in_progress" ? "[>]" : "[ ]";
      const pri = priorityLabel[t.priority] ?? t.priority;
      lines.push(`- ${icon} [${pri}] ${t.title}`);
    }
    lines.push("");
  }

  lines.push(MARKER_END);

  return lines.join("\n");
}

/**
 * CLAUDE.md にマーカーベースで書き出し（ユーザー手書き部分を保護）
 */
export async function writeClaudeMd(
  projectName: string
): Promise<string> {
  const project = await getProject(projectName);
  if (!project) {
    throw new Error(`プロジェクト "${projectName}" が見つかりません。`);
  }

  const section = await generateClaudeMdSection(projectName);
  const filePath = path.join(project.path, "CLAUDE.md");

  let content: string;

  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf-8");
    const startIdx = existing.indexOf(MARKER_START);
    const endIdx = existing.indexOf(MARKER_END);

    if (startIdx !== -1 && endIdx !== -1) {
      // マーカーが既にある → マーカー間を置換
      content =
        existing.slice(0, startIdx) +
        section +
        existing.slice(endIdx + MARKER_END.length);
    } else {
      // マーカーがない → 末尾に追記
      content = existing.trimEnd() + "\n\n" + section + "\n";
    }
  } else {
    // ファイルが存在しない → 新規作成
    content = section + "\n";
  }

  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}
