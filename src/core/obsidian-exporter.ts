import * as fs from "node:fs";
import * as path from "node:path";
import { getAllKnowledgeEntries } from "../db/lance-client.js";
import { getAllProjects, getAllTasks } from "../db/project-client.js";
import { listDocs, getDoc } from "./doc-store.js";
import { getConfig } from "../types/index.js";
import type {
  KnowledgeEntry,
  ProjectEntry,
  TaskEntry,
} from "../types/index.js";
import type { DocWithContent } from "./doc-store.js";

// ============================================================
// Types
// ============================================================

export interface ExportCounts {
  knowledge: number;
  projects: number;
  tasks: number;
  docs: number;
}

interface FileRecord {
  relativePath: string; // e.g. "Knowledge/Pitfalls/title.md"
  displayName: string;
}

// ============================================================
// Filename helpers
// ============================================================

/**
 * Sanitize a title for use as a filename.
 * Preserves Japanese/Unicode characters; removes filesystem-unsafe chars.
 */
function sanitizeFilename(title: string): string {
  let name = title
    .replace(/[/\\:*?"<>|]/g, "-") // replace unsafe chars
    .replace(/\s+/g, " ") // normalize whitespace
    .trim()
    .replace(/^\.+|\.+$/g, ""); // strip leading/trailing dots

  if (name.length === 0) name = "untitled";
  return name;
}

/**
 * Capitalize first letter of a knowledge type for folder names.
 * e.g. "pitfall" → "Pitfalls"
 */
function typeFolderName(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1) + "s";
}

// ============================================================
// YAML frontmatter
// ============================================================

/**
 * Build a YAML frontmatter block from a flat key/value map.
 * No external YAML library needed — values are simple scalars, arrays, and strings.
 */
function toYamlFrontmatter(meta: Record<string, unknown>): string {
  const lines: string[] = ["---"];

  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined || value === null || value === "") continue;

    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${String(item)}`);
      }
    } else if (typeof value === "number") {
      lines.push(`${key}: ${value}`);
    } else {
      // String — quote if it contains special YAML chars
      const s = String(value);
      if (/[:#{}[\],&*?|>!%@`]/.test(s) || s.includes("\n")) {
        lines.push(`${key}: "${s.replace(/"/g, '\\"')}"`);
      } else {
        lines.push(`${key}: ${s}`);
      }
    }
  }

  lines.push("---");
  return lines.join("\n");
}

// ============================================================
// Tag parsing helper
// ============================================================

/**
 * Parse tags that may be stored as JSON string or native array.
 */
function parseTags(tags: string | string[]): string[] {
  if (Array.isArray(tags)) return tags;
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ============================================================
// Link path helpers
// ============================================================

function knowledgeLinkPath(entry: KnowledgeEntry): string {
  return `Knowledge/${typeFolderName(entry.type)}/${sanitizeFilename(entry.title)}`;
}

function projectLinkPath(project: ProjectEntry): string {
  return `Projects/${sanitizeFilename(project.name)}`;
}

function taskLinkPath(task: TaskEntry): string {
  const statusFolder = task.status === "done" ? "Done" : "Active";
  return `Tasks/${statusFolder}/${sanitizeFilename(task.title)}`;
}

function docLinkPath(projectName: string, title: string): string {
  return `Docs/${sanitizeFilename(projectName)}/${sanitizeFilename(title)}`;
}

// ============================================================
// Note renderers
// ============================================================

function renderKnowledgeNote(
  entry: KnowledgeEntry,
  projectMap: Map<string, string>
): string {
  const tags = parseTags(entry.tags);

  const frontmatterData: Record<string, unknown> = {
    type: entry.type,
    project: entry.project || undefined,
    tags,
    language: entry.language || undefined,
    framework: entry.framework || undefined,
    confidence: Math.round(entry.confidence * 100) / 100,
    access_count: entry.accessCount,
    mnemo_id: entry.id,
    created: entry.createdAt.split("T")[0],
    updated: entry.updatedAt.split("T")[0],
  };

  // Reference-specific frontmatter
  if (entry.type === "reference") {
    if (entry.sourceUrl) frontmatterData.source_url = entry.sourceUrl;
    if (entry.sourceType) frontmatterData.source_type = entry.sourceType;
    if (entry.fetchedAt) frontmatterData.fetched = entry.fetchedAt.split("T")[0];
    if (entry.ttlDays) frontmatterData.ttl_days = entry.ttlDays;
  }

  const frontmatter = toYamlFrontmatter(frontmatterData);

  const lines: string[] = [frontmatter, "", `# ${entry.title}`, "", entry.content];

  // Add rawContent section for references
  if (entry.type === "reference" && entry.rawContent) {
    lines.push("", "## Full Content", "", entry.rawContent);
  }

  // Footer with wikilinks
  const footerLinks: string[] = [];
  if (entry.project) {
    footerLinks.push(`**Project:** [[${projectLinkPath({ name: entry.project } as ProjectEntry)}|${entry.project}]]`);
  }

  if (footerLinks.length > 0) {
    lines.push("", "---", ...footerLinks);
  }

  return lines.join("\n") + "\n";
}

function renderProjectNote(
  project: ProjectEntry,
  knowledgeEntries: KnowledgeEntry[],
  tasks: TaskEntry[]
): string {
  const techStack = parseTags(project.techStack);

  const frontmatter = toYamlFrontmatter({
    type: "project",
    language: project.language || undefined,
    framework: project.framework || undefined,
    tech_stack: techStack,
    mnemo_id: project.id,
    created: project.createdAt.split("T")[0],
    updated: project.updatedAt.split("T")[0],
  });

  const lines: string[] = [frontmatter, "", `# ${project.name}`];

  if (project.description) {
    lines.push("", project.description);
  }

  lines.push("", `**Path:** \`${project.path}\``);

  if (techStack.length > 0) {
    lines.push(`**Tech Stack:** ${techStack.join(", ")}`);
  }

  // Related knowledge
  const relatedKnowledge = knowledgeEntries.filter(
    (e) => e.project === project.name
  );
  if (relatedKnowledge.length > 0) {
    lines.push("", "## Knowledge", "");
    for (const entry of relatedKnowledge) {
      lines.push(`- [[${knowledgeLinkPath(entry)}|${entry.title}]] (${entry.type})`);
    }
  }

  // Related tasks
  const relatedTasks = tasks.filter((t) => t.projectId === project.id);
  if (relatedTasks.length > 0) {
    lines.push("", "## Tasks", "");
    for (const task of relatedTasks) {
      const checkbox = task.status === "done" ? "[x]" : "[ ]";
      lines.push(`- ${checkbox} [[${taskLinkPath(task)}|${task.title}]]`);
    }
  }

  return lines.join("\n") + "\n";
}

function renderTaskNote(
  task: TaskEntry,
  projectMap: Map<string, string>
): string {
  const tags = parseTags(task.tags);
  const projectName = projectMap.get(task.projectId) ?? "";

  const frontmatter = toYamlFrontmatter({
    type: "task",
    status: task.status,
    priority: task.priority,
    project: projectName || undefined,
    tags,
    mnemo_id: task.id,
    created: task.createdAt.split("T")[0],
    updated: task.updatedAt.split("T")[0],
    completed: task.completedAt ? task.completedAt.split("T")[0] : undefined,
  });

  const lines: string[] = [frontmatter, "", `# ${task.title}`];

  if (task.description) {
    lines.push("", task.description);
  }

  lines.push(
    "",
    `**Status:** ${task.status}`,
    `**Priority:** ${task.priority}`
  );

  // Footer with wikilinks
  if (projectName) {
    lines.push(
      "",
      "---",
      `**Project:** [[${projectLinkPath({ name: projectName } as ProjectEntry)}|${projectName}]]`
    );
  }

  return lines.join("\n") + "\n";
}

function renderDocNote(
  doc: DocWithContent,
  projectName: string
): string {
  const frontmatter = toYamlFrontmatter({
    type: "doc",
    scope: doc.scope,
    project: projectName,
    tags: doc.tags,
    mnemo_id: doc.id,
    created: doc.createdAt.split("T")[0],
    updated: doc.updatedAt.split("T")[0],
  });

  const lines: string[] = [frontmatter, "", doc.content];

  // Footer with wikilinks
  lines.push(
    "",
    "---",
    `**Project:** [[${projectLinkPath({ name: projectName } as ProjectEntry)}|${projectName}]]`
  );

  return lines.join("\n") + "\n";
}

// ============================================================
// Index (MOC) renderer
// ============================================================

function renderIndex(
  files: FileRecord[],
  counts: ExportCounts
): string {
  const lines: string[] = [
    "---",
    "type: index",
    `exported: ${new Date().toISOString().split("T")[0]}`,
    "---",
    "",
    "# Mnemo Knowledge Vault",
    "",
    `Exported: ${new Date().toISOString().split("T")[0]} | Knowledge: ${counts.knowledge} | Projects: ${counts.projects} | Tasks: ${counts.tasks} | Docs: ${counts.docs}`,
    "",
  ];

  // Group files by top-level folder
  const grouped = new Map<string, FileRecord[]>();
  for (const f of files) {
    const topFolder = f.relativePath.split("/")[0];
    const list = grouped.get(topFolder) ?? [];
    list.push(f);
    grouped.set(topFolder, list);
  }

  const folderOrder = ["Knowledge", "Projects", "Tasks", "Docs"];
  for (const folder of folderOrder) {
    const entries = grouped.get(folder);
    if (!entries || entries.length === 0) continue;

    lines.push(`## ${folder}`, "");

    // Sub-group by second-level folder if exists
    const subGrouped = new Map<string, FileRecord[]>();
    for (const f of entries) {
      const parts = f.relativePath.split("/");
      const subFolder = parts.length > 2 ? parts[1] : "";
      const list = subGrouped.get(subFolder) ?? [];
      list.push(f);
      subGrouped.set(subFolder, list);
    }

    for (const [subFolder, subEntries] of subGrouped) {
      if (subFolder) {
        lines.push(`### ${subFolder}`, "");
      }
      for (const f of subEntries) {
        lines.push(`- [[${f.relativePath}|${f.displayName}]]`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ============================================================
// Main export function
// ============================================================

export async function exportToObsidian(
  outputDir?: string,
  filter?: { type?: string; project?: string }
): Promise<{ dir: string; counts: ExportCounts }> {
  const config = getConfig();
  const dir = outputDir ?? path.join(config.dataDir, "obsidian-vault");

  // --- 1. Fetch all data ---
  let knowledgeEntries = await getAllKnowledgeEntries();
  const allProjects = await getAllProjects();
  let allTasks = await getAllTasks();

  // --- 2. Build projectMap (id → name) ---
  const projectMap = new Map<string, string>();
  for (const p of allProjects) {
    projectMap.set(p.id, p.name);
  }

  // --- 3. Apply filters ---
  if (filter?.type) {
    knowledgeEntries = knowledgeEntries.filter((e) => e.type === filter.type);
  }
  if (filter?.project) {
    knowledgeEntries = knowledgeEntries.filter(
      (e) => e.project === filter.project
    );
    allTasks = allTasks.filter((t) => {
      const projName = projectMap.get(t.projectId);
      return projName === filter.project;
    });
  }

  // Determine which projects to export
  let projectsToExport = allProjects;
  if (filter?.project) {
    projectsToExport = allProjects.filter((p) => p.name === filter.project);
  }

  // --- 4. Create folder structure ---
  const knowledgeTypes = ["pitfall", "pattern", "lesson", "solution", "preference", "reference"];
  for (const t of knowledgeTypes) {
    fs.mkdirSync(path.join(dir, "Knowledge", typeFolderName(t)), {
      recursive: true,
    });
  }
  fs.mkdirSync(path.join(dir, "Projects"), { recursive: true });
  fs.mkdirSync(path.join(dir, "Tasks", "Active"), { recursive: true });
  fs.mkdirSync(path.join(dir, "Tasks", "Done"), { recursive: true });
  fs.mkdirSync(path.join(dir, "Docs"), { recursive: true });

  const allFiles: FileRecord[] = [];
  const counts: ExportCounts = { knowledge: 0, projects: 0, tasks: 0, docs: 0 };

  // --- 5. Write Knowledge notes ---
  for (const entry of knowledgeEntries) {
    const filename = sanitizeFilename(entry.title) + ".md";
    const relPath = `Knowledge/${typeFolderName(entry.type)}/${filename}`;
    const filePath = path.join(dir, relPath);

    const content = renderKnowledgeNote(entry, projectMap);
    fs.writeFileSync(filePath, content, "utf-8");

    allFiles.push({ relativePath: relPath.replace(/\.md$/, ""), displayName: entry.title });
    counts.knowledge++;
  }

  // --- 6. Write Project notes ---
  for (const project of projectsToExport) {
    const filename = sanitizeFilename(project.name) + ".md";
    const relPath = `Projects/${filename}`;
    const filePath = path.join(dir, relPath);

    const content = renderProjectNote(project, knowledgeEntries, allTasks);
    fs.writeFileSync(filePath, content, "utf-8");

    allFiles.push({ relativePath: relPath.replace(/\.md$/, ""), displayName: project.name });
    counts.projects++;
  }

  // --- 7. Write Task notes ---
  for (const task of allTasks) {
    const statusFolder = task.status === "done" ? "Done" : "Active";
    const filename = sanitizeFilename(task.title) + ".md";
    const relPath = `Tasks/${statusFolder}/${filename}`;
    const filePath = path.join(dir, relPath);

    const content = renderTaskNote(task, projectMap);
    fs.writeFileSync(filePath, content, "utf-8");

    allFiles.push({ relativePath: relPath.replace(/\.md$/, ""), displayName: task.title });
    counts.tasks++;
  }

  // --- 8. Write Doc notes ---
  for (const project of projectsToExport) {
    let docs;
    try {
      docs = await listDocs(project.name);
    } catch {
      continue; // project may not have docs dir
    }

    if (docs.length === 0) continue;

    const projectDocsDir = path.join(dir, "Docs", sanitizeFilename(project.name));
    fs.mkdirSync(projectDocsDir, { recursive: true });

    for (const docEntry of docs) {
      let docWithContent: DocWithContent;
      try {
        docWithContent = await getDoc(project.name, docEntry.id);
      } catch {
        continue; // skip if doc file missing
      }

      const filename = sanitizeFilename(docEntry.title) + ".md";
      const relPath = `Docs/${sanitizeFilename(project.name)}/${filename}`;
      const filePath = path.join(dir, relPath);

      const content = renderDocNote(docWithContent, project.name);
      fs.writeFileSync(filePath, content, "utf-8");

      allFiles.push({ relativePath: relPath.replace(/\.md$/, ""), displayName: docEntry.title });
      counts.docs++;
    }
  }

  // --- 9. Write _Index.md (MOC) ---
  const indexContent = renderIndex(allFiles, counts);
  fs.writeFileSync(path.join(dir, "_Index.md"), indexContent, "utf-8");

  return { dir, counts };
}
