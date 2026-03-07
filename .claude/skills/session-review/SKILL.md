---
name: session-review
description: Review the current session to extract learnings, mark completed tasks, and check if project docs need updating. Use at the end of a session, or when the user wants to reflect on what was accomplished.
---

# Session Review

Analyze this session and perform four actions: (1) extract knowledge, (2) mark completed tasks, (3) check project docs, and (4) update CLAUDE.md.

## Step 1: Identify Knowledge Worth Recording

Review the session for non-trivial learnings. Skip this step if the session only involved simple, routine operations.

Look for these categories:

- **Pitfalls**: Errors encountered, surprising behaviors, gotchas that cost time. These are the highest-value recordings because they prevent repeating mistakes.
- **Lessons**: Insights gained through debugging, research, or experimentation.
- **Solutions**: Specific fixes or workarounds for concrete problems.
- **Patterns**: Reusable approaches, architecture decisions, or workflow optimizations that worked well.
- **Preferences**: Coding conventions or tool choices the user established or reinforced.

### For each finding:

1. Briefly explain what was learned and why it matters.
2. Ask the user if they want to record it.
3. If yes, use `mnemo_learn` with:
   - Appropriate type (pitfall/lesson/solution/pattern/preference)
   - Concise title (under 60 characters)
   - Detailed content including context, cause, and how to apply it
   - Detected project via `mnemo_project(action: detect)`
   - 2-4 relevant tags

### Skip recording if:

- The session was purely routine (file edits, simple commands)
- The knowledge is already recorded in Mnemo (check with `mnemo_recall` if unsure)
- The insight is too project-specific to be useful in the future

## Step 2: Mark Completed Tasks

1. Get the current task list: `mnemo_task(action: list, project: <detected-project>)`
2. Review which tasks were worked on or completed during this session.
3. For each completed task, use `mnemo_task(action: done, taskId: <id>)`.
4. Report what was marked as done.

## Step 3: Check Project Docs

Check if project specification documents need updating or creating.

1. Get existing docs: `mnemo_doc(action: list, project: <detected-project>)`
2. Review the session for:

   **Docs that need updating** — Check if files related to existing docs were modified:
   - Compare files changed in this session with each doc's `relatedFiles`
   - If a match is found, suggest updating:
     ```
     このセッションで変更したファイルは以下のドキュメントに関連しています:
     - [doc-title] (.claude/docs/[filename])
     更新しますか？
     ```
   - If user agrees, use `/doc [topic]` to update the doc

   **New docs needed** — If the session involved:
   - New feature implementation
   - Architecture changes (new modules, data flow changes)
   - New APIs or interfaces
   - And no existing doc covers it, suggest:
     ```
     このセッションで [feature/change] を実装しました。
     `/doc [topic]` でドキュメントを作成しますか？
     ```

### Skip doc check if:
- The session only involved minor fixes or cosmetic changes
- No code changes were made (research/discussion only)

## Step 4: Update CLAUDE.md

If any of the following happened in Steps 1-3, run `mnemo_generate` to update CLAUDE.md:
- New knowledge was recorded
- Tasks were marked as done
- Project docs were created or updated

## Output Format

Summarize concisely:

```
## Session Review

### Recorded Knowledge
- [pitfall] タイトル — 簡単な説明
- (none — this session had no non-trivial learnings)

### Completed Tasks
- [x] タスクタイトル
- (none)

### Project Docs
- Updated: [doc-title]
- Suggested: `/doc [topic]`
- (no updates needed)

### CLAUDE.md
- Updated / No update needed
```
