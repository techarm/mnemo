import * as fs from "node:fs";
import * as path from "node:path";
import { getConfig } from "../types/index.js";
import { getAllKnowledgeEntries } from "../db/lance-client.js";
import { getAllProjects, getAllTasks } from "../db/project-client.js";
import type {
  KnowledgeEntry,
  ProjectEntry,
  TaskEntry,
} from "../types/index.js";

// Current schema version
export const SCHEMA_VERSION = "0.2.0";

export interface BackupData {
  version: string;
  createdAt: string;
  knowledge: KnowledgeEntry[];
  projects: ProjectEntry[];
  tasks: TaskEntry[];
}

/**
 * Export all data to a JSON backup file.
 * Vectors are excluded to keep file size small.
 */
export async function createBackup(outputPath?: string): Promise<string> {
  const config = getConfig();
  const backupDir = path.join(config.dataDir, "backups");
  fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filePath =
    outputPath ?? path.join(backupDir, `mnemo-backup-${timestamp}.json`);

  // Collect all data
  const knowledge = await getAllKnowledgeEntries();
  const projects = await getAllProjects();
  const tasks = await getAllTasks();

  // Strip vectors from knowledge entries (they can be regenerated)
  const knowledgeWithoutVectors = knowledge.map((k) => ({
    ...k,
    vector: [] as number[], // Exclude vectors to save space
  }));

  const backup: BackupData = {
    version: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    knowledge: knowledgeWithoutVectors,
    projects,
    tasks,
  };

  fs.writeFileSync(filePath, JSON.stringify(backup, null, 2), "utf-8");

  return filePath;
}

/**
 * Restore data from a JSON backup file.
 * Re-generates vector embeddings during restore.
 */
export async function restoreBackup(
  inputPath: string
): Promise<{ knowledge: number; projects: number; tasks: number }> {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`バックアップファイルが見つかりません: ${inputPath}`);
  }

  const raw = fs.readFileSync(inputPath, "utf-8");
  const backup: BackupData = JSON.parse(raw);

  // Validate backup structure
  if (!backup.version || !backup.knowledge || !backup.projects || !backup.tasks) {
    throw new Error("無効なバックアップファイル形式です。");
  }

  // Import dynamically to avoid circular dependency issues
  const { embedText } = await import("../embedding/ollama.js");
  const { addKnowledgeEntry } = await import("../db/lance-client.js");
  const { addProject, addTaskEntry, getProjectByName } = await import(
    "../db/project-client.js"
  );

  let knowledgeCount = 0;
  let projectCount = 0;
  let taskCount = 0;

  // Restore projects first (tasks depend on project IDs)
  for (const project of backup.projects) {
    try {
      const existing = await getProjectByName(project.name);
      if (!existing) {
        await addProject(project);
        projectCount++;
      }
    } catch {
      // Skip on error
    }
  }

  // Restore knowledge (re-generate embeddings)
  for (const entry of backup.knowledge) {
    try {
      const text = `${entry.title} ${entry.content}`;
      const vector = await embedText(text);
      const restored: KnowledgeEntry = {
        ...entry,
        vector,
      };
      await addKnowledgeEntry(restored);
      knowledgeCount++;
    } catch {
      // Skip on error
    }
  }

  // Restore tasks
  for (const task of backup.tasks) {
    try {
      await addTaskEntry(task);
      taskCount++;
    } catch {
      // Skip on error
    }
  }

  return { knowledge: knowledgeCount, projects: projectCount, tasks: taskCount };
}

/**
 * List available backup files.
 */
export function listBackups(): { path: string; createdAt: string; size: string }[] {
  const config = getConfig();
  const backupDir = path.join(config.dataDir, "backups");

  if (!fs.existsSync(backupDir)) {
    return [];
  }

  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith("mnemo-backup-") && f.endsWith(".json"))
    .sort()
    .reverse();

  return files.map((f) => {
    const filePath = path.join(backupDir, f);
    const stat = fs.statSync(filePath);
    const sizeKB = (stat.size / 1024).toFixed(1);
    return {
      path: filePath,
      createdAt: stat.mtime.toISOString(),
      size: `${sizeKB} KB`,
    };
  });
}

/**
 * Write/read schema version to config.json for migration tracking.
 */
export function getStoredVersion(): string | null {
  const config = getConfig();
  const configPath = path.join(config.dataDir, "config.json");

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed.schemaVersion ?? parsed.version ?? null;
  } catch {
    return null;
  }
}

export function updateStoredVersion(): void {
  const config = getConfig();
  const configPath = path.join(config.dataDir, "config.json");
  fs.mkdirSync(config.dataDir, { recursive: true });

  let existing: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch {
      // Start fresh
    }
  }

  existing.schemaVersion = SCHEMA_VERSION;
  existing.lastUpdated = new Date().toISOString();

  fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), "utf-8");
}

/**
 * Check if migration is needed and auto-backup before migration.
 * Also runs periodic maintenance tasks (confidence decay).
 */
export async function checkAndMigrate(): Promise<string | null> {
  const stored = getStoredVersion();
  let migrated: string | null = null;

  if (stored !== SCHEMA_VERSION) {
    // Auto-backup before any migration
    if (stored !== null) {
      const backupPath = await createBackup();
      console.error(
        `[Mnemo] スキーマ更新検出 (${stored} → ${SCHEMA_VERSION})。自動バックアップ作成: ${backupPath}`
      );
    }

    // Update version
    updateStoredVersion();
    migrated = stored;
  }

  // Run periodic maintenance (confidence decay) on every startup
  try {
    const { decayConfidence } = await import("./knowledge-store.js");
    const decayed = await decayConfidence();
    if (decayed > 0) {
      console.error(`[Mnemo] 信頼度減衰: ${decayed}件のナレッジを更新しました`);
    }
  } catch {
    // Non-critical: ignore decay errors on startup
  }

  return migrated;
}
