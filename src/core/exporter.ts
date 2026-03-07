import * as fs from "node:fs";
import * as path from "node:path";
import { getAllKnowledgeEntries } from "../db/lance-client.js";
import { getConfig } from "../types/index.js";
import type { KnowledgeEntry } from "../types/index.js";

export async function exportToMarkdown(
  outputDir?: string,
  filter?: { type?: string; project?: string }
): Promise<string> {
  const config = getConfig();
  const dir = outputDir ?? path.join(config.dataDir, "exports");
  fs.mkdirSync(dir, { recursive: true });

  let entries = await getAllKnowledgeEntries();

  if (filter?.type) {
    entries = entries.filter((e) => e.type === filter.type);
  }
  if (filter?.project) {
    entries = entries.filter((e) => e.project === filter.project);
  }

  const grouped = new Map<string, KnowledgeEntry[]>();
  for (const entry of entries) {
    const key = entry.type;
    const list = grouped.get(key) ?? [];
    list.push(entry);
    grouped.set(key, list);
  }

  const files: string[] = [];

  for (const [type, items] of grouped) {
    const lines: string[] = [`# ${type.charAt(0).toUpperCase() + type.slice(1)}s\n`];

    for (const item of items) {
      const tags = JSON.parse(item.tags) as string[];
      lines.push(`## ${item.title}\n`);
      lines.push(`- **Type:** ${item.type}`);
      if (item.project) lines.push(`- **Project:** ${item.project}`);
      if (item.language) lines.push(`- **Language:** ${item.language}`);
      if (item.framework) lines.push(`- **Framework:** ${item.framework}`);
      if (tags.length > 0) lines.push(`- **Tags:** ${tags.join(", ")}`);
      lines.push(`- **Date:** ${item.createdAt.split("T")[0]}`);
      lines.push("");
      lines.push(item.content);
      lines.push("\n---\n");
    }

    const filePath = path.join(dir, `${type}s.md`);
    fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
    files.push(filePath);
  }

  return dir;
}
