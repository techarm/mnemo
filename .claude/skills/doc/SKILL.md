---
name: doc
description: Create or update project specification documents. Use "/doc init" to generate initial docs for an existing project, or "/doc [topic]" to create/update a specific document.
argument-hint: "init or [topic to document]"
---

# Project Specification Document

Write and manage structured specification documents stored in the project's `.claude/docs/` directory.

## Mode Detection

Check `$ARGUMENTS`:
- If `$ARGUMENTS` is `init` → **Initialization Mode**
- Otherwise → **Single Doc Mode** (topic = `$ARGUMENTS`)

---

## Initialization Mode (`/doc init`)

Generate initial documentation for an existing project by surveying its codebase.

### Steps

1. **Detect project**: `mnemo_project(action: detect)`

2. **Check existing docs**: `mnemo_doc(action: list, project: <name>)`
   - If docs already exist, ask the user if they want to add more or skip.

3. **Survey the codebase**:
   - Use `Glob` to understand the directory structure
   - Read key files: entry points, type definitions, config files, README
   - Identify the main architectural layers, features, and APIs

4. **Plan documentation**:
   Present a list of proposed documents to the user:
   ```
   以下のドキュメントを作成します:
   1. [global] システムアーキテクチャ — 全体構成、技術スタック、データフロー
   2. [feature] ○○機能 — 設計判断、主要インターフェース
   3. [feature] △△機能 — ...
   4. [api] APIインターフェース — ...

   作成してよろしいですか？
   ```
   Wait for user confirmation before proceeding.

5. **Create each document**:
   For each approved doc, research the relevant code and call:
   ```
   mnemo_doc(action: create, project: <name>, title: ..., content: ..., summary: ..., scope: ..., relatedFiles: [...], tags: [...])
   ```

6. **Update CLAUDE.md**: `mnemo_generate(project: <name>)`

7. **Report**: Show what was created.

### Guidelines for init

- Start with **architecture** (scope: global) — always create this first
- Then **features** — one doc per major feature or module
- Then **API** — if the project has external APIs or interfaces
- Aim for 3-8 documents total (not too many, not too few)
- Each doc should be **under 200 lines**

---

## Single Doc Mode (`/doc [topic]`)

Create or update a single specification document about the given topic.

### Steps

1. **Detect project**: `mnemo_project(action: detect)`

2. **Check existing docs**: `mnemo_doc(action: list, project: <name>)`
   - If a doc already exists for this topic, use `update` action instead of `create`

3. **Research the codebase**:
   - Read relevant source files for the topic
   - Identify key design decisions and their rationale
   - Note important patterns, constraints, and gotchas

4. **Write the document** following this structure:

   ```markdown
   ## Overview
   What this is and why it exists (1-2 paragraphs).

   ## Design Decisions
   Key design choices and their rationale (the "why").
   - Decision 1: [choice] — [reason]
   - Decision 2: [choice] — [reason]

   ## Architecture
   - File structure or component layout
   - Data flow (as text description)
   - Key modules and their responsibilities

   ## Key Interfaces
   Important types, functions, or APIs with brief code snippets.

   ## Constraints & Gotchas
   Known limitations, gotchas, or important caveats.

   ## Related
   - Links to related docs or files
   ```

   Adapt sections as needed — not all sections are required for every doc.

5. **Save the document**:
   ```
   mnemo_doc(action: create, project: ..., title: ..., content: ..., summary: ..., scope: ..., relatedFiles: [...], tags: [...])
   ```
   Or if updating:
   ```
   mnemo_doc(action: update, project: ..., id: ..., content: ..., summary: ..., relatedFiles: [...])
   ```

6. **Suggest CLAUDE.md update**: Tell the user to run `mnemo_generate` to reflect the new doc.

---

## Document Writing Guidelines

- **Under 200 lines**: Split if longer
- **Focus on "why" over "what"**: Code shows what; docs explain why
- **Include concrete examples**: Type names, function signatures, file paths
- **Keep current**: Document the actual state, not aspirational design
- **Match user's language**: Default to Japanese if the user uses Japanese
- **Summary is key**: The summary appears in CLAUDE.md — make it descriptive enough that the AI knows whether to read the full doc
- **relatedFiles matter**: These are used by session-review to detect when docs need updating
