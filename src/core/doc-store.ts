import * as fs from "node:fs";
import * as path from "node:path";
import type { DocEntry, DocIndex, DocScope } from "../types/index.js";
import { getProject } from "./project-store.js";

// --- Helpers ---

async function getDocsDir(projectName: string): Promise<string> {
  const project = await getProject(projectName);
  if (!project) {
    throw new Error(`プロジェクト "${projectName}" が見つかりません。`);
  }
  return path.join(project.path, ".claude", "docs");
}

async function ensureDocsDir(projectName: string): Promise<string> {
  const docsDir = await getDocsDir(projectName);
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }
  return docsDir;
}

function readIndex(docsDir: string): DocIndex {
  const indexPath = path.join(docsDir, "index.json");
  if (!fs.existsSync(indexPath)) {
    return { version: "1.0", docs: [] };
  }
  const raw = fs.readFileSync(indexPath, "utf-8");
  return JSON.parse(raw) as DocIndex;
}

function writeIndex(docsDir: string, index: DocIndex): void {
  const indexPath = path.join(docsDir, "index.json");
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n", "utf-8");
}

function slugify(title: string): string {
  // ASCII slug
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length >= 3) return slug;
  // Fallback for non-ASCII (e.g. Japanese)
  return `doc-${Date.now()}`;
}

// --- Input types ---

export interface CreateDocInput {
  projectName: string;
  title: string;
  content: string;
  summary: string;
  scope?: DocScope;
  relatedFiles?: string[];
  tags?: string[];
  id?: string;
}

export interface UpdateDocInput {
  title?: string;
  content?: string;
  summary?: string;
  scope?: DocScope;
  relatedFiles?: string[];
  tags?: string[];
}

export interface DocWithContent extends DocEntry {
  content: string;
}

// --- Core functions ---

export async function createDoc(input: CreateDocInput): Promise<DocEntry> {
  const docsDir = await ensureDocsDir(input.projectName);
  const index = readIndex(docsDir);

  const id = input.id || slugify(input.title);

  // Check for duplicate ID
  if (index.docs.some((d) => d.id === id)) {
    throw new Error(
      `ドキュメント ID "${id}" は既に存在します。別の ID を指定してください。`
    );
  }

  const filename = `${id}.md`;
  const now = new Date().toISOString();

  const entry: DocEntry = {
    id,
    filename,
    title: input.title,
    summary: input.summary.slice(0, 120),
    scope: input.scope ?? "feature",
    relatedFiles: input.relatedFiles ?? [],
    tags: input.tags ?? [],
    createdAt: now,
    updatedAt: now,
  };

  // Write the Markdown file
  const filePath = path.join(docsDir, filename);
  const mdContent = `# ${input.title}\n\n${input.content}`;
  fs.writeFileSync(filePath, mdContent, "utf-8");

  // Update index
  index.docs.push(entry);
  writeIndex(docsDir, index);

  return entry;
}

export async function listDocs(projectName: string): Promise<DocEntry[]> {
  let docsDir: string;
  try {
    docsDir = await getDocsDir(projectName);
  } catch {
    return [];
  }
  if (!fs.existsSync(docsDir)) return [];
  const index = readIndex(docsDir);
  return index.docs;
}

export async function getDoc(
  projectName: string,
  docId: string
): Promise<DocWithContent> {
  const docsDir = await getDocsDir(projectName);
  const index = readIndex(docsDir);
  const entry = index.docs.find((d) => d.id === docId);
  if (!entry) {
    throw new Error(`ドキュメント "${docId}" が見つかりません。`);
  }

  const filePath = path.join(docsDir, entry.filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `ドキュメントファイル "${entry.filename}" が見つかりません。`
    );
  }

  const content = fs.readFileSync(filePath, "utf-8");
  return { ...entry, content };
}

export async function updateDoc(
  projectName: string,
  docId: string,
  updates: UpdateDocInput
): Promise<DocEntry> {
  const docsDir = await getDocsDir(projectName);
  const index = readIndex(docsDir);
  const entryIdx = index.docs.findIndex((d) => d.id === docId);
  if (entryIdx === -1) {
    throw new Error(`ドキュメント "${docId}" が見つかりません。`);
  }

  const entry = index.docs[entryIdx];
  const now = new Date().toISOString();

  // Update metadata
  if (updates.title !== undefined) entry.title = updates.title;
  if (updates.summary !== undefined)
    entry.summary = updates.summary.slice(0, 120);
  if (updates.scope !== undefined) entry.scope = updates.scope;
  if (updates.relatedFiles !== undefined)
    entry.relatedFiles = updates.relatedFiles;
  if (updates.tags !== undefined) entry.tags = updates.tags;
  entry.updatedAt = now;

  // Update content if provided
  if (updates.content !== undefined) {
    const filePath = path.join(docsDir, entry.filename);
    const title = updates.title ?? entry.title;
    const mdContent = `# ${title}\n\n${updates.content}`;
    fs.writeFileSync(filePath, mdContent, "utf-8");
  }

  index.docs[entryIdx] = entry;
  writeIndex(docsDir, index);

  return entry;
}

export async function deleteDoc(
  projectName: string,
  docId: string
): Promise<DocEntry> {
  const docsDir = await getDocsDir(projectName);
  const index = readIndex(docsDir);
  const entryIdx = index.docs.findIndex((d) => d.id === docId);
  if (entryIdx === -1) {
    throw new Error(`ドキュメント "${docId}" が見つかりません。`);
  }

  const entry = index.docs[entryIdx];

  // Delete the Markdown file
  const filePath = path.join(docsDir, entry.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  // Remove from index
  index.docs.splice(entryIdx, 1);
  writeIndex(docsDir, index);

  return entry;
}

/**
 * Generate a summary of project docs for CLAUDE.md integration.
 * Groups docs by scope and returns formatted Markdown.
 */
export async function getDocsSummary(
  projectName: string
): Promise<string | null> {
  const docs = await listDocs(projectName);
  if (docs.length === 0) return null;

  const lines: string[] = [];
  lines.push("## 📖 Project Docs\n");

  const scopeLabels: Record<DocScope, string> = {
    global: "System Design",
    feature: "Features",
    api: "API / Interfaces",
  };

  const byScope = new Map<DocScope, DocEntry[]>();
  for (const doc of docs) {
    const list = byScope.get(doc.scope) ?? [];
    list.push(doc);
    byScope.set(doc.scope, list);
  }

  // Output in fixed order: global → feature → api
  const scopeOrder: DocScope[] = ["global", "feature", "api"];
  for (const scope of scopeOrder) {
    const entries = byScope.get(scope);
    if (!entries || entries.length === 0) continue;

    lines.push(`### ${scopeLabels[scope]}\n`);
    for (const doc of entries) {
      lines.push(
        `- **${doc.title}** (\`.claude/docs/${doc.filename}\`): ${doc.summary}`
      );
    }
    lines.push("");
  }

  lines.push(
    `_${docs.length}件のドキュメント。詳細は \`.claude/docs/\` を Read tool で参照。_\n`
  );

  return lines.join("\n");
}
