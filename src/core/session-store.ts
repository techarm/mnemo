import * as fs from "node:fs";
import * as path from "node:path";
import { getConfig } from "../types/index.js";
import type {
  SessionLogEntry,
  SessionIndex,
  SessionIndexEntry,
} from "../types/index.js";

// --- Helpers ---

function getSessionsDir(): string {
  const config = getConfig();
  return path.join(config.dataDir, "sessions");
}

function sanitizeProjectName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function ensureSessionsDir(project: string): string {
  const sessionsDir = getSessionsDir();
  const projectDir = path.join(sessionsDir, sanitizeProjectName(project));
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
  return projectDir;
}

function readIndex(): SessionIndex {
  const indexPath = path.join(getSessionsDir(), "index.json");
  if (!fs.existsSync(indexPath)) {
    return {
      version: "1.0",
      rollingWindowDays: 3,
      maxRetentionDays: 30,
      entries: [],
    };
  }
  return JSON.parse(fs.readFileSync(indexPath, "utf-8")) as SessionIndex;
}

function writeIndex(index: SessionIndex): void {
  const sessionsDir = getSessionsDir();
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }
  const indexPath = path.join(sessionsDir, "index.json");
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n", "utf-8");
}

function getDateString(date?: Date): string {
  const d = date ?? new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function formatLocalTime(date?: Date): string {
  const d = date ?? new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day} ${h}:${min}`;
}

// --- Core functions ---

/**
 * Write a session log entry. Prepends to the current date's file (newest first).
 */
export function writeSessionLog(entry: SessionLogEntry): SessionIndexEntry {
  const projectDir = ensureSessionsDir(entry.project);
  const dateStr = getDateString();
  const filename = `${dateStr}.md`;
  const filePath = path.join(projectDir, filename);
  const relPath = `${sanitizeProjectName(entry.project)}/${filename}`;

  // Build Markdown content
  const lines: string[] = [];
  lines.push(`## Session: ${formatLocalTime()}`);
  lines.push("");

  lines.push("### Summary");
  lines.push(entry.summary);
  lines.push("");

  if (entry.tasksWorkedOn && entry.tasksWorkedOn.length > 0) {
    lines.push("### Tasks Worked On");
    for (const task of entry.tasksWorkedOn) {
      lines.push(`- ${task}`);
    }
    lines.push("");
  }

  if (entry.keyDecisions && entry.keyDecisions.length > 0) {
    lines.push("### Key Decisions");
    for (const decision of entry.keyDecisions) {
      lines.push(`- ${decision}`);
    }
    lines.push("");
  }

  if (entry.filesModified && entry.filesModified.length > 0) {
    lines.push("### Files Modified");
    for (const file of entry.filesModified) {
      lines.push(`- ${file}`);
    }
    lines.push("");
  }

  if (entry.errorsSolutions && entry.errorsSolutions.length > 0) {
    lines.push("### Errors & Solutions");
    for (const item of entry.errorsSolutions) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (entry.nextSteps && entry.nextSteps.length > 0) {
    lines.push("### Next Steps");
    for (const step of entry.nextSteps) {
      lines.push(`- ${step}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");

  // Prepend new session to file (newest first)
  const newContent = lines.join("\n");
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf-8");
    fs.writeFileSync(filePath, newContent + existing, "utf-8");
  } else {
    fs.writeFileSync(filePath, newContent, "utf-8");
  }

  // Update index
  const index = readIndex();
  const existingIdx = index.entries.findIndex(
    (e) => e.date === dateStr && e.project === entry.project
  );
  const now = new Date().toISOString();

  if (existingIdx >= 0) {
    index.entries[existingIdx].sessionCount += 1;
    index.entries[existingIdx].lastUpdated = now;
  } else {
    index.entries.push({
      date: dateStr,
      project: entry.project,
      filePath: relPath,
      sessionCount: 1,
      lastUpdated: now,
    });
  }

  writeIndex(index);

  return index.entries.find(
    (e) => e.date === dateStr && e.project === entry.project
  )!;
}

/**
 * Get recent session logs for a project within the rolling window.
 * Returns concatenated Markdown content, newest first.
 */
export function getRecentSessionLogs(
  project: string,
  days?: number
): string {
  const index = readIndex();
  const windowDays = days ?? index.rollingWindowDays;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffStr = getDateString(cutoff);

  // Filter entries for this project within the window
  const relevant = index.entries
    .filter((e) => e.project === project && e.date >= cutoffStr)
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first

  if (relevant.length === 0) return "";

  const sessionsDir = getSessionsDir();
  const parts: string[] = [];

  for (const entry of relevant) {
    const filePath = path.join(sessionsDir, entry.filePath);
    if (fs.existsSync(filePath)) {
      parts.push(fs.readFileSync(filePath, "utf-8").trim());
    }
  }

  return parts.join("\n\n");
}

/**
 * List session log entries for a project (or all projects).
 */
export function listSessionLogs(project?: string): SessionIndexEntry[] {
  const index = readIndex();
  let entries = index.entries;
  if (project) {
    entries = entries.filter((e) => e.project === project);
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Get the content of a specific session log file.
 */
export function getSessionLog(project: string, date: string): string {
  const sessionsDir = getSessionsDir();
  const filePath = path.join(
    sessionsDir,
    sanitizeProjectName(project),
    `${date}.md`
  );
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `セッションログ "${project}/${date}" が見つかりません。`
    );
  }
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * Clean up old session logs beyond the retention window.
 * Called during startup maintenance (checkAndMigrate).
 */
export function cleanupOldSessionLogs(retentionDays?: number): number {
  const index = readIndex();
  const maxDays = retentionDays ?? index.maxRetentionDays;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxDays);
  const cutoffStr = getDateString(cutoff);

  const sessionsDir = getSessionsDir();
  let deleted = 0;

  const toRemove = index.entries.filter((e) => e.date < cutoffStr);
  for (const entry of toRemove) {
    const filePath = path.join(sessionsDir, entry.filePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      deleted++;
    }
  }

  if (toRemove.length > 0) {
    index.entries = index.entries.filter((e) => e.date >= cutoffStr);
    writeIndex(index);
  }

  return deleted;
}

/**
 * Get a concise context string for session-start injection.
 * Returns formatted Markdown ready for hook output.
 */
export function getSessionContext(
  project: string,
  days?: number
): string {
  const logs = getRecentSessionLogs(project, days);
  if (!logs) return "";

  return `## Mnemo: 最近のセッションログ\n\n${logs}`;
}
