import * as fs from "node:fs";
import * as path from "node:path";
import { getConfig } from "../types/index.js";
import type { UserProfile, ProfileCategory } from "../types/index.js";

// --- Helpers ---

function getProfilePath(): string {
  const config = getConfig();
  return path.join(config.dataDir, "profile.json");
}

function createEmptyProfile(): UserProfile {
  const now = new Date().toISOString();
  return {
    version: "1.0",
    identity: {},
    technical: {},
    tools: {},
    communication: {},
    codingStyle: {},
    customNotes: "",
    createdAt: now,
    updatedAt: now,
  };
}

// --- Core functions ---

/**
 * Load the user profile. Returns empty profile if none exists.
 * Always normalizes to ensure all categories exist (forward-compatible).
 */
export function loadProfile(): UserProfile {
  const filePath = getProfilePath();
  if (!fs.existsSync(filePath)) {
    return createEmptyProfile();
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw) as Partial<UserProfile>;
  return {
    version: parsed.version ?? "1.0",
    identity: parsed.identity ?? {},
    technical: parsed.technical ?? {},
    tools: parsed.tools ?? {},
    communication: parsed.communication ?? {},
    codingStyle: parsed.codingStyle ?? {},
    customNotes: parsed.customNotes ?? "",
    createdAt: parsed.createdAt ?? new Date().toISOString(),
    updatedAt: parsed.updatedAt ?? new Date().toISOString(),
  };
}

/**
 * Save the profile to disk.
 */
export function saveProfile(profile: UserProfile): void {
  const config = getConfig();
  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
  }
  const filePath = getProfilePath();
  profile.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(profile, null, 2) + "\n", "utf-8");
}

/**
 * Set a key-value pair in a profile category.
 * For customNotes, the value replaces the entire notes string (key is ignored).
 */
export function setProfileValue(
  category: ProfileCategory,
  key: string,
  value: string
): UserProfile {
  const profile = loadProfile();
  if (category === "customNotes") {
    profile.customNotes = value;
  } else {
    profile[category][key] = value;
  }
  saveProfile(profile);
  return profile;
}

/**
 * Get a specific value from a profile category.
 * For customNotes, key is ignored and the entire notes string is returned.
 */
export function getProfileValue(
  category: ProfileCategory,
  key: string
): string | undefined {
  const profile = loadProfile();
  if (category === "customNotes") {
    return profile.customNotes || undefined;
  }
  return profile[category][key];
}

/**
 * Delete a key from a profile category.
 * For customNotes, clears the entire notes string.
 */
export function deleteProfileValue(
  category: ProfileCategory,
  key: string
): UserProfile {
  const profile = loadProfile();
  if (category === "customNotes") {
    profile.customNotes = "";
  } else {
    delete profile[category][key];
  }
  saveProfile(profile);
  return profile;
}

/**
 * Reset the entire profile to empty.
 */
export function resetProfile(): void {
  const filePath = getProfilePath();
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Check if the profile has any content.
 */
export function hasProfile(): boolean {
  const profile = loadProfile();
  return (
    Object.keys(profile.identity).length > 0 ||
    Object.keys(profile.technical).length > 0 ||
    Object.keys(profile.tools).length > 0 ||
    Object.keys(profile.communication).length > 0 ||
    Object.keys(profile.codingStyle).length > 0 ||
    profile.customNotes.length > 0
  );
}

// --- カテゴリラベル定義 ---

const CATEGORY_LABELS: Record<string, string> = {
  identity: "Identity",
  technical: "Technical",
  tools: "Tools",
  communication: "Communication",
  codingStyle: "Coding Style",
};

/**
 * Format the full profile as Markdown for display.
 */
export function formatProfile(): string {
  const profile = loadProfile();
  if (!hasProfile()) {
    return "プロフィールが設定されていません。";
  }

  const lines: string[] = ["# User Profile", ""];

  for (const [cat, label] of Object.entries(CATEGORY_LABELS)) {
    const data = profile[cat as keyof UserProfile] as Record<string, string>;
    if (typeof data === "object" && Object.keys(data).length > 0) {
      lines.push(`## ${label}`);
      for (const [k, v] of Object.entries(data)) {
        lines.push(`- **${k}:** ${v}`);
      }
      lines.push("");
    }
  }

  if (profile.customNotes) {
    lines.push("## Notes");
    lines.push(profile.customNotes);
    lines.push("");
  }

  lines.push(`---`);
  lines.push(`更新日時: ${profile.updatedAt}`);

  return lines.join("\n");
}

/**
 * Generate a formatted context string for hook injection.
 * Returns empty string if no profile data exists.
 */
export function getProfileContext(): string {
  if (!hasProfile()) return "";

  const profile = loadProfile();
  const lines: string[] = ["## Mnemo: ユーザープロフィール", ""];

  for (const [cat, label] of Object.entries(CATEGORY_LABELS)) {
    const data = profile[cat as keyof UserProfile] as Record<string, string>;
    if (typeof data === "object" && Object.keys(data).length > 0) {
      lines.push(`### ${label}`);
      for (const [k, v] of Object.entries(data)) {
        lines.push(`- ${k}: ${v}`);
      }
      lines.push("");
    }
  }

  if (profile.customNotes) {
    lines.push("### Notes");
    lines.push(profile.customNotes);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Generate the CLAUDE.md profile section.
 * Returns null if no profile data exists.
 */
export function getProfileSummary(): string | null {
  if (!hasProfile()) return null;

  const profile = loadProfile();
  const lines: string[] = ["## 👤 User Profile", ""];

  for (const [cat, label] of Object.entries(CATEGORY_LABELS)) {
    const data = profile[cat as keyof UserProfile] as Record<string, string>;
    if (typeof data === "object" && Object.keys(data).length > 0) {
      const pairs = Object.entries(data)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      lines.push(`- **${label}:** ${pairs}`);
    }
  }

  if (profile.customNotes) {
    lines.push(`- **Notes:** ${profile.customNotes.slice(0, 200)}`);
  }

  lines.push("");
  return lines.join("\n");
}
