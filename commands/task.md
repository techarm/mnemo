---
description: Add, list, or update tasks for the current project in Mnemo
argument-hint: [task description or action]
allowed-tools: [mnemo_task, mnemo_project]
---

# /task - Task Management

Manage project tasks in Mnemo.

## Steps

1. Detect the current project using `mnemo_project` with action "detect".

2. Based on user intent:
   - **Adding a task**: parse the title, priority, and description, then call `mnemo_task` with action "add"
   - **Listing tasks**: call `mnemo_task` with action "list"
   - **Completing a task**: call `mnemo_task` with action "done" and the task ID
   - **Updating a task**: call `mnemo_task` with action "update" with taskId and changes

3. Show results in a clear format with status icons:
   - `[ ]` = todo
   - `[>]` = in_progress
   - `[x]` = done
