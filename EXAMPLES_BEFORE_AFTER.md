# Real Examples: Before & After Error Messages

This document shows actual error message improvements when using Redmine MCP with agents or the Hermes tool.

## Example 1: Wrong Project ID (Most Common)

**Agent tries:**
```python
create_issue(project_id="my-project", subject="Bug: Login broken")
```

### ❌ BEFORE
```
Redmine API error on POST /issues.json: 422
```
(Agent has no idea what went wrong or how to fix it)

### ✅ AFTER
```
Redmine API error on POST /issues.json:
project: not found

💡 Hint: Use list_projects to find valid project_id (must be numeric)
```
(Agent understands: must use numeric ID, can call list_projects to find it)

---

## Example 2: Username Instead of User ID

**Agent tries:**
```python
update_issue(issue_id=42, assigned_to_id="john")
```

### ❌ BEFORE
```
Redmine API error on PUT /issues/42.json: 422
```
(No clue that username is the problem)

### ✅ AFTER
```
Redmine API error on PUT /issues/42.json:
assigned_to: not found

💡 Hint: Use numeric user_id from list_users (not username); alternatively use "me" for current user
```
(Agent knows: use numeric ID from list_users, or use "me" for self)

---

## Example 3: String Status in Create Operation

**Agent tries:**
```python
create_issue(
  project_id=1,
  subject="New Feature",
  status_id="open"  # ← Wrong! "open" only works in list filters
)
```

### ❌ BEFORE
```
Redmine API error on POST /issues.json: 422
```

### ✅ AFTER
```
Redmine API error on POST /issues.json:
status: not found

💡 Hint: Use numeric status_id (status strings like "open"/"closed" only work in list filters, not in create/update)
```
(Agent learns the distinction: strings work in list_assigned_issues, numeric required in create_issue)

---

## Example 4: Missing Issue or Project in Time Entry

**Agent tries:**
```python
create_time_entry(hours=2, activity_id=9)  # ← Missing both issue_id and project_id
```

### ❌ BEFORE
```
Redmine API error on POST /time_entries.json: 422
```

### ✅ AFTER
```
Redmine API error on POST /time_entries.json:
Either issue_id or project_id must be provided

💡 Hint: Time entry must reference either an issue_id OR a project_id, but not both
```
(Agent understands: need exactly one, and can pick either)

---

## Example 5: Invalid Date Format

**Agent tries:**
```python
create_time_entry(
  issue_id=42,
  hours=3,
  spent_on="June 23, 2026"  # ← Wrong format
)
```

### ❌ BEFORE
```
Redmine API error on POST /time_entries.json: 422
```

### ✅ AFTER
```
Redmine API error on POST /time_entries.json:
spent_on: has invalid format

💡 Hint: Use YYYY-MM-DD format for date fields
```
(Agent knows exactly what format to use)

---

## Example 6: Multiple Validation Errors

**Agent tries:**
```python
create_issue(
  project_id="my-project",     # ← Wrong: string instead of numeric
  subject="Test",
  status_id="open",            # ← Wrong: string instead of numeric
  assigned_to_id="alice"       # ← Wrong: username instead of numeric
)
```

### ❌ BEFORE
```
Redmine API error on POST /issues.json: 422
```
(No detail on which fields failed)

### ✅ AFTER
```
Redmine API error on POST /issues.json:
project: not found
status: not found
assigned_to: not found

💡 Hint: Use list_projects to find valid project_id (must be numeric)
```
(Agent sees all three errors and gets relevant hint for the first field)

---

## Example 7: API Key Issue

**Agent tries:**
```python
# Server started with REDMINE_API_KEY="wrong_key"
create_issue(project_id=1, subject="Test")
```

### ❌ BEFORE
```
Redmine API error on POST /issues.json: 401
```

### ✅ AFTER
```
Redmine API error on POST /issues.json:
Unauthorized

💡 Hint: Check your API key (REDMINE_API_KEY environment variable)
```
(Agent knows to check the API key configuration)

---

## Example 8: Plugin Not Enabled

**Agent tries:**
```python
# time_entries plugin is disabled on this Redmine instance
create_time_entry(issue_id=42, hours=2)
```

### ❌ BEFORE
```
Redmine API error on POST /time_entries.json: 404
```

### ✅ AFTER
```
Redmine API error on POST /time_entries.json:
Not found

💡 Hint: Time entries may not be available. The time_entries plugin may not be enabled on this Redmine instance.
```
(Agent understands: plugin may need to be enabled, not just "resource not found")

---

## Safe Pattern Now Clear from Tool Descriptions

**Tool descriptions now guide agents:**

```
create_issue: 
  "Create a new issue in a project. Required: project_id (numeric, use list_projects), 
   subject. Optional fields must use numeric IDs: tracker_id (issue type), 
   status_id (numeric, not "open"/"closed"), priority_id (urgency), 
   assigned_to_id (use list_users for numeric ID, or "me")."
```

This means an agent reading the description understands:
1. Must use list_projects to get project_id
2. status_id must be numeric, not the strings it sees in list_assigned_issues
3. Can use "me" for current user in assigned_to_id
4. Other fields reference specific helpers

---

## Skill Guide Available

Agents can now use the `.claude/skills/redmine-mcp.md` skill which provides:

1. **Quick patterns** — Safe way to create/update issues
2. **Common mistakes table** — See common errors and solutions
3. **Full tool reference** — All parameters documented
4. **Error decoder** — What 422 errors mean and how to fix them
5. **Tips for agents** — Best practices for using Redmine MCP

Example from skill:

```
| Mistake | Error | Fix |
|---------|-------|-----|
| Using username in assigned_to_id | assigned_to: not found | Call list_users to get numeric ID |
| Using project key in create_issue | project: not found | Call list_projects and use numeric project_id |
| Using "open" in create_issue | status: not found | Use numeric status ID (get from similar issue) |
```

---

## Integration with Hermes

When using this MCP server with Hermes:

1. **MCP protocol stays clean** — No console.log pollution, only JSONRPC on stdout
2. **Error parsing improves** — Agents get structured error messages
3. **Retry logic can be smarter** — Error hints let agents self-correct vs blindly retry
4. **Discovery works** — Agents can call list_projects/list_users to find valid IDs

---

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| Error clarity | HTTP status only | Field + actionable hint |
| Agent guidance | None | Tool descriptions + skill |
| Self-correction | Difficult | Clear from error hint |
| Common mistakes | Blind guessing | Documented with solutions |
| Tool usage | Unclear parameters | All parameters explained |
| Parameter format | Confusing (string vs numeric) | Explicitly documented |

---

**Note**: All examples use pseudocode. Real API calls go through the MCP protocol with tool parameters validated by Zod schemas.
