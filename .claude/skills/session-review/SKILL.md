---
name: session-review
description: Review the current session to extract learnings and mark completed tasks. Use at the end of a session, or when the user wants to reflect on what was accomplished and what should be recorded.
---

# Session Review

Analyze this session and perform two actions: (1) extract knowledge worth recording, and (2) mark completed tasks as done.

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

## Step 3: Update CLAUDE.md (if knowledge was recorded)

If new knowledge was recorded in Step 1, suggest running `mnemo_generate` to update the project's CLAUDE.md with the latest knowledge. This ensures the next session starts with up-to-date context.

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

### CLAUDE.md
- Updated / No update needed
```
