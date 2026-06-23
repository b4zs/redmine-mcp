# Redmine MCP Tool Guide

This skill helps Claude agents and other tools use the Redmine MCP server effectively.

## Quick Start

When using Redmine MCP tools, follow this pattern:
1. **List first** — Use `list_projects` and `list_users` to find numeric IDs
2. **Validate IDs** — All create/update operations require numeric IDs (not names)
3. **Parse errors** — If you get a 422 error, read the field-specific hint provided
4. **Check status** — Use `get_issue` to inspect current state before updating

## Core Concepts

### The Golden Rule: Numeric IDs Only
- **project_id**: Always numeric (from `list_projects`)
- **user_id**: Numeric OR `"me"` for current user (from `list_users`)
- **tracker_id**: Numeric only (varies per instance; Bug=1, Feature=2, etc.)
- **status_id**: In list filters use "open"/"closed"/"*"; in create/update use numeric only
- **priority_id**: Numeric only (varies per instance)
- **activity_id**: Numeric only (found in time entries)

### Common Mistakes & How to Fix Them

| Mistake | Error | Fix |
|---------|-------|-----|
| Using username in `assigned_to_id` | `assigned_to: not found` | Call `list_users` to get numeric ID |
| Using project key like "my-project" in issue create | `project: not found` | Call `list_projects` and use numeric `project_id` |
| Using "open" string in `create_issue` | `status: not found` | Use numeric status ID (get it from a similar issue via `get_issue`) |
| Missing both `issue_id` and `project_id` in time entry | Validation error | Provide exactly one: either issue_id OR project_id |
| Date format like "June 23" in time entry | `spent_on: has invalid format` | Use YYYY-MM-DD format |

## Tool Reference

### 📋 Discovery Tools
Use these FIRST to find valid IDs for your operations.

**list_projects** — Find numeric project_id
```
list_projects()  # Gets all projects with their numeric IDs
```

**list_users** — Find numeric user_id
```
list_users()  # Gets all users with their numeric IDs
```

### 🐛 Issue Tools
For creating, reading, and updating issues.

**create_issue** — Create a new issue
```
create_issue(
  project_id: <numeric>,  # Required: from list_projects
  subject: "...",         # Required: issue title
  description: "...",     # Optional
  tracker_id: <numeric>,  # Optional: from /trackers.json (varies by instance)
  status_id: <numeric>,   # Optional: numeric only, not "open"/"closed"
  priority_id: <numeric>, # Optional: from /enumerations/issue_priorities.json
  assigned_to_id: <numeric or "me">  # Optional
)
```

**get_issue** — Fetch full issue details
```
get_issue(
  issue_id: <numeric>,
  include: "journals,attachments,relations,children"  # Optional
)
```

**list_assigned_issues** — Find issues assigned to a user
```
list_assigned_issues(
  user_id: <numeric or "me">,  # Defaults to "me" (current user)
  project_id: <numeric>,       # Optional filter
  status_id: "open|closed|*"   # Optional filter (strings work here!)
)
```

**search_issues** — Full-text search
```
search_issues(
  query: "...",           # Text to search in subject/description
  project_id: <numeric>,  # Optional filter
  status_id: "open|closed|*"  # Optional filter
)
```

**update_issue** — Modify an issue
```
update_issue(
  issue_id: <numeric>,
  status_id: <numeric>,       # Numeric only, not "open"/"closed"
  assigned_to_id: <numeric or "me">,
  notes: "comment text",      # Add a comment
  done_ratio: 0-100           # Set completion percentage
)
```

**add_issue_note** — Add a comment without changing fields
```
add_issue_note(
  issue_id: <numeric>,
  note: "comment text"
)
```

### ⏱️ Time Entry Tools
For logging time spent on issues or projects.

**create_time_entry** — Log time
```
create_time_entry(
  issue_id: <numeric>,    # Either this OR project_id (not both)
  project_id: <numeric>,  # Either this OR issue_id (not both)
  hours: <number>,        # Required: time spent in hours
  activity_id: <numeric>, # Optional: from time entries on similar issues
  spent_on: "YYYY-MM-DD", # Optional: defaults to today
  comments: "..."         # Optional: description of work
)
```

**list_time_entries** — Find time entries with filters
```
list_time_entries(
  user_id: <numeric or "me">,
  project_id: <numeric>,
  issue_id: <numeric>,
  from_date: "YYYY-MM-DD",  # Start of date range
  to_date: "YYYY-MM-DD",    # End of date range
  period: "today|yesterday|current_week|last_week|current_month|last_month|current_year"
)
```

**get_issue_time_entries** — Get all time logged on a specific issue
```
get_issue_time_entries(
  issue_id: <numeric>
)
```

### 📖 Wiki Tools
For accessing project wiki pages.

**get_project_wiki** — Fetch wiki page content
```
get_project_wiki(
  project_id: <numeric or identifier>,  # In URLs, identifiers work too
  title: "Wiki"  # Default is "Wiki" (home page)
)
```

**list_wiki_pages** — List all wiki page titles in a project
```
list_wiki_pages(
  project_id: <numeric or identifier>
)
```

## Pattern: Creating an Issue Safely

```
1. Call: list_projects()
   ↓ Find your project_id

2. (If assigning) Call: list_users()
   ↓ Find the numeric user_id (not username)

3. Call: create_issue({
     project_id: <found_id>,
     subject: "...",
     assigned_to_id: <found_id>
   })
   ↓ Issue created successfully

If you get a 422 error, re-read the hint message for what went wrong.
```

## Pattern: Updating an Issue Safely

```
1. Call: get_issue(issue_id: <id>)
   ↓ Inspect current state (shows current status_id, assigned_to_id)

2. If changing assignee:
   - Call: list_users() to find numeric ID
   
3. If changing status:
   - The get_issue response shows current status.id (numeric)
   - Use that or find the numeric ID you need

4. Call: update_issue({
     issue_id: <id>,
     status_id: <numeric>,
     assigned_to_id: <numeric or "me">,
     notes: "..."
   })
   ↓ Issue updated successfully
```

## Error Messages & What They Mean

### 422 Validation Error
Field-specific validation failed. The error message tells you which field:
- **"project: not found"** → project_id doesn't exist; use `list_projects`
- **"assigned_to: not found"** → user_id doesn't exist or using username; use `list_users`
- **"status: not found"** → status_id invalid; use numeric ID only in create/update
- **"spent_on: has invalid format"** → Use YYYY-MM-DD format for dates
- **"Either issue_id or project_id must be provided"** → Time entry needs one but not both

### 401 Unauthorized
API key is missing, wrong, or expired.
→ Check REDMINE_URL and REDMINE_API_KEY environment variables

### 403 Forbidden
API key lacks permission for this operation.
→ Check your user's permissions in the Redmine admin panel

### 404 Not Found
Resource doesn't exist OR plugin is disabled.
- For time entries: Check if time_entries plugin is enabled
- For other resources: The resource ID doesn't exist

## Tips for Agents

1. **Always verify before creating** — Call `list_projects` or `list_users` before using IDs
2. **Read hints on error** — Error messages include hints (look for the 💡 emoji)
3. **Use "me" when appropriate** — For current user references, use `"me"` instead of looking up your own ID
4. **Filter status strings only in list calls** — "open"/"closed" only work in `list_assigned_issues` and `search_issues`, not in `create_issue`
5. **Check instance-specific values** — tracker_id, status_id, priority_id, activity_id vary per Redmine instance

## Debugging Workflow

If a tool call fails:

1. **Read the error message** — It includes a hint (💡)
2. **Check parameter types** — Most errors are wrong ID types (string vs numeric)
3. **Use discovery tools** — Call `list_projects`, `list_users`, or `get_issue` to inspect valid values
4. **Retry with correct IDs** — Apply the hint and try again

---

**Last Updated**: 2026-06-23
**For**: Redmine MCP Server v1.0.0
