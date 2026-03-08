---
name: session-review
description: Review the current session to extract learnings, mark completed tasks, and check if project docs need updating. Use at the end of a session, or when the user wants to reflect on what was accomplished.
---

# Session Review

Analyze this session and perform five actions: (1) extract knowledge, (2) mark completed tasks, (3) check project docs, (4) update CLAUDE.md, and (5) write session log.

## Step 1: Identify Knowledge Worth Recording

Review the session for non-trivial learnings. Skip this step if the session only involved simple, routine operations.

Look for these categories:

- **Pitfalls**: Errors encountered, surprising behaviors, gotchas that cost time. These are the highest-value recordings because they prevent repeating mistakes.
- **Lessons**: Insights gained through debugging, research, or experimentation.
- **Solutions**: Specific fixes or workarounds for concrete problems.
- **Patterns**: Reusable approaches, architecture decisions, or workflow optimizations that worked well.
- **Preferences**: Coding conventions or tool choices the user established or reinforced.
  - **Tip**: For persistent user-level preferences (name, preferred tools like pnpm/oxlint, coding style, communication language), suggest storing them in the user profile via `mnemo_profile(action: set, category: ..., key: ..., value: ...)` instead of creating a preference knowledge entry. The profile is always available in CLAUDE.md and session context without confidence decay, while preference entries decay over time.
- **References**: Web research results (from Web Search, WebFetch, or Context7) that were used in this session and would be valuable to persist for future sessions. Use `/research` skill or `mnemo_learn(type: "reference")` to save these.

### For each finding:

1. Briefly explain what was learned and why it matters.
2. Ask the user if they want to record it.
3. If yes, use `mnemo_learn` with:
   - Appropriate type (pitfall/lesson/solution/pattern/preference/reference)
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

## Step 5: Write Session Log

Record a session log so the next session can continue where this one left off. This bridges the context gap between sessions.

1. Detect the project: `mnemo_project(action: detect)`
2. Gather session information:
   - **summary**: 1-2 sentences describing the main work done in this session
   - **tasksWorkedOn**: List from Step 2 — use `[x]` for completed, `[>]` for in-progress
   - **keyDecisions**: Any architectural or design decisions made during the session
   - **filesModified**: Key files that were changed (use `git diff --name-only HEAD~1` or session knowledge)
   - **errorsSolutions**: From Step 1, any errors that were encountered and resolved
   - **nextSteps**: Unfinished work, pending items, or follow-up tasks for the next session
3. Write the session log:
   ```
   mnemo_session(action: write, project: <detected-project>,
     summary: "...",
     tasksWorkedOn: ["[x] task1", "[>] task2"],
     keyDecisions: ["decision1"],
     filesModified: ["file1.ts", "file2.ts"],
     errorsSolutions: ["error: solution"],
     nextSteps: ["next1", "next2"])
   ```
4. Keep the summary concise — it will be injected into the next session's context window.

### Skip session log if:
- The session was trivially short (quick question, single command)
- No meaningful work was done (research/discussion only with no actionable outcome)

## Output Format

Summarize concisely:

```
## Session Review

### Recorded Knowledge
- [pitfall] タイトル — 簡単な説明
- [reference] タイトル — ソース情報
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

### Session Log
- Recorded: [summary]
- (skipped — trivial session)
```
