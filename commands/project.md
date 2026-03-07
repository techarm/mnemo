---
description: Register or view project information in Mnemo
allowed-tools: [mnemo_project]
---

# /project - Project Management

Manage project registration and information in Mnemo.

## Steps

1. If the user wants to register a project:
   - Detect project info from the current directory (check package.json, .git, tech stack)
   - Call `mnemo_project` with action "register", providing name, path, and detected metadata

2. If the user wants project info:
   - Call `mnemo_project` with action "get" and the project name

3. If the user wants to list all projects:
   - Call `mnemo_project` with action "list"

4. If no specific request:
   - Call `mnemo_project` with action "detect" using the current working directory
   - Show the current project context
