import { v4 as uuidv4 } from "uuid";
import { embedText } from "../embedding/ollama.js";
import {
  addKnowledgeEntry,
  deleteKnowledgeEntry,
  resolveKnowledgeById,
  countKnowledgeEntries,
  getAllKnowledgeEntries,
  batchUpdateConfidence,
} from "../db/lance-client.js";
import { hybridSearch } from "./hybrid-search.js";
import type {
  KnowledgeEntry,
  KnowledgeType,
  SearchOptions,
  SearchResult,
} from "../types/index.js";

export interface LearnInput {
  type: KnowledgeType;
  title: string;
  content: string;
  project?: string;
  tags?: string[];
  language?: string;
  framework?: string;
}

export async function learn(input: LearnInput): Promise<KnowledgeEntry> {
  const textToEmbed = `${input.title}\n${input.content}`;
  const vector = await embedText(textToEmbed);

  const now = new Date().toISOString();
  const entry: KnowledgeEntry = {
    id: uuidv4(),
    type: input.type,
    title: input.title,
    content: input.content,
    vector,
    project: input.project ?? "",
    tags: JSON.stringify(input.tags ?? []),
    language: input.language ?? "",
    framework: input.framework ?? "",
    confidence: 1.0,
    accessCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  await addKnowledgeEntry(entry);
  return entry;
}

export async function recall(
  query: string,
  options?: SearchOptions
): Promise<SearchResult[]> {
  const results = await hybridSearch(query, options);

  // Boost confidence of accessed entries (fire and forget)
  if (results.length > 0) {
    const boosts = results
      .filter((r) => r.confidence < 1.0)
      .map((r) => ({
        id: r.id,
        confidence: Math.min(1.0, r.confidence + 0.1),
      }));
    if (boosts.length > 0) {
      batchUpdateConfidence(boosts).catch(() => {
        // Non-critical: ignore boost failures
      });
    }
  }

  return results;
}

export async function remove(id: string): Promise<KnowledgeEntry> {
  const entry = await resolveKnowledgeById(id);
  await deleteKnowledgeEntry(entry.id);
  return entry;
}

export interface KnowledgeStats {
  totalEntries: number;
  byType: Record<string, number>;
  byProject: Record<string, number>;
  byLanguage: Record<string, number>;
}

export async function stats(): Promise<KnowledgeStats> {
  const count = await countKnowledgeEntries();
  const entries = await getAllKnowledgeEntries();

  const byType: Record<string, number> = {};
  const byProject: Record<string, number> = {};
  const byLanguage: Record<string, number> = {};

  for (const entry of entries) {
    byType[entry.type] = (byType[entry.type] ?? 0) + 1;

    const proj = entry.project || "(global)";
    byProject[proj] = (byProject[proj] ?? 0) + 1;

    if (entry.language) {
      byLanguage[entry.language] = (byLanguage[entry.language] ?? 0) + 1;
    }
  }

  return { totalEntries: count, byType, byProject, byLanguage };
}

/** Confidence decay time constant in days (τ = 180 days: ~37% at 180 days, ~13% at 365 days) */
const CONFIDENCE_TIME_CONSTANT = 180;

/** Minimum confidence floor (entries never fully disappear) */
const CONFIDENCE_FLOOR = 0.1;

/**
 * Apply time-based confidence decay to all knowledge entries.
 * Uses exponential decay based on age since last update.
 *
 * Formula: confidence = max(FLOOR, e^(-ageDays / τ))
 * where τ = CONFIDENCE_TIME_CONSTANT (180 days)
 *
 * Returns the number of entries updated.
 */
export async function decayConfidence(): Promise<number> {
  const entries = await getAllKnowledgeEntries();
  const now = Date.now();

  const updates: { id: string; confidence: number }[] = [];

  for (const entry of entries) {
    const ageMs = now - new Date(entry.updatedAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    const newConfidence = Math.max(
      CONFIDENCE_FLOOR,
      Math.exp(-ageDays / CONFIDENCE_TIME_CONSTANT)
    );

    // Only update if change is significant (> 0.01)
    if (Math.abs(entry.confidence - newConfidence) > 0.01) {
      updates.push({ id: entry.id, confidence: newConfidence });
    }
  }

  if (updates.length > 0) {
    await batchUpdateConfidence(updates);
  }

  return updates.length;
}
