# Redmine MCP: Error Handling & Agent Fluency Implementation

## 🎯 Objective
Improve error messages and tool documentation so agents can use Redmine MCP effectively, especially when they make common mistakes.

## 📋 What Was Delivered

### 1. Enhanced Error Messages
- **Field-specific parsing**: 422 errors now show which field failed (e.g., "project: not found" vs just "422")
- **Contextual hints**: 8+ common mistake scenarios now include helpful hints
- **Status-specific context**: Different hints for 401 (check API key), 403 (check permissions), 404 (check plugin)
- **Multi-field support**: Shows all validation errors when multiple fields fail

### 2. Improved Tool Documentation
All 13 tools now clarify:
- Which parameters require numeric IDs (vs strings vs special values like "me")
- How to find valid ID values (which list_* tools to call)
- Context-specific behavior (e.g., "open" works in filters but not in create)
- Required vs optional parameters

### 3. Agent Skill Guide
Comprehensive guide at `.claude/skills/redmine-mcp.md` covering:
- Quick start patterns
- Common mistakes with solutions
- Full tool reference
- Error message decoder
- Safe usage patterns
- Debugging workflow

### 4. Documentation
- `ERROR_HANDLING_IMPROVEMENTS.md` — Technical summary of changes
- `EXAMPLES_BEFORE_AFTER.md` — Real before/after error message examples
- `IMPROVEMENTS_CHECKLIST.md` — Detailed completion checklist

## 🔧 Technical Changes

### Client-side (`src/client.ts`)
```typescript
// New methods:
parseErrorMessage(statusCode, body)     // Extracts field details from 422 responses
getErrorHint(statusCode, message)       // Provides contextual hints for common mistakes
```

### Tool Descriptions (`src/tools.ts`)
- Clarified all parameter types
- Added discovery hints ("use list_projects to find project_id")
- Explained context-specific behavior
- Added parameter-level Zod descriptions

### Startup (`src/index.ts`)
- Removed console.log() messages that were breaking JSONRPC protocol

## 📊 Coverage

### Error Scenarios Handled (8)
1. ✅ Username instead of numeric user_id
2. ✅ Project key/identifier instead of numeric project_id
3. ✅ String tracker name instead of numeric tracker_id
4. ✅ String status in create_issue (not numeric)
5. ✅ Missing both issue_id and project_id in time entry
6. ✅ Invalid date format (not YYYY-MM-DD)
7. ✅ Invalid/missing API key
8. ✅ Time entries plugin disabled

### Tools Documented (13)
- list_projects
- list_users
- list_assigned_issues
- search_issues
- get_issue
- create_issue ⭐ (major improvements)
- update_issue
- add_issue_note
- create_time_entry ⭐ (major improvements)
- list_time_entries
- get_issue_time_entries
- get_project_wiki
- list_wiki_pages

## 🎓 How Agents Use This

### Before
```
Error: "Redmine API error on POST /issues.json: 422"
→ Agent has no idea what's wrong
```

### After
```
Error: "Redmine API error on POST /issues.json:
project: not found

💡 Hint: Use list_projects to find valid project_id (must be numeric)"

→ Agent can self-correct by calling list_projects
```

## 📚 Documentation Locations

| File | Purpose |
|------|---------|
| `.claude/skills/redmine-mcp.md` | Agent skill guide (245 lines) |
| `src/client.ts` | Error parsing logic |
| `src/tools.ts` | Tool descriptions & parameters |
| `ERROR_HANDLING_IMPROVEMENTS.md` | Technical change summary |
| `EXAMPLES_BEFORE_AFTER.md` | Real examples of improvements |
| `IMPROVEMENTS_CHECKLIST.md` | Detailed completion tracking |
| `IMPLEMENTATION_SUMMARY.md` | This file |

## ✅ Quality Checks

- [x] No breaking changes to existing tool signatures
- [x] Error messages are strictly additive (more info, same structure)
- [x] TypeScript compiles with no errors
- [x] JSONRPC protocol not polluted with console output
- [x] All 13 tools documented with improved descriptions
- [x] Common mistakes covered in error hints
- [x] Skill file provides comprehensive guidance

## 🚀 Testing Recommendations

Test these scenarios to verify improvements:

```bash
# 1. Wrong project ID
create_issue({project_id: "my-project", subject: "Test"})
# Should show hint about using list_projects

# 2. Username instead of ID
create_issue({project_id: 1, subject: "Test", assigned_to_id: "john"})
# Should show hint about using list_users

# 3. String status in create
create_issue({project_id: 1, subject: "Test", status_id: "open"})
# Should show hint about numeric status_id requirement

# 4. Invalid date
create_time_entry({issue_id: 1, hours: 2, spent_on: "June 23"})
# Should show hint about YYYY-MM-DD format
```

## 🎯 Expected Impact

### For Agents
- **Faster learning curve** — Tool descriptions now explain parameter requirements
- **Self-correction** — Error hints guide agents to fix mistakes
- **Fewer retries** — Agents understand what went wrong immediately
- **Better patterns** — Skill guide shows safe usage patterns

### For Users
- **Clearer errors** — Field-specific feedback instead of HTTP status
- **Reduced debugging** — Error hints point to solutions
- **Better UX** — Agents use tools more effectively with fewer missteps

## 📈 Metrics

| Metric | Value |
|--------|-------|
| Tools documented | 13/13 |
| Error scenarios handled | 8/8 common mistakes |
| Skill guide lines | 245 |
| Documentation files | 4 |
| Breaking changes | 0 |
| Build errors | 0 |

## 🔮 Future Enhancements (Optional)

1. **Enumeration tools** — Expose list_trackers, list_issue_statuses, list_priorities
2. **Client-side validation** — Validate parameters before making API calls
3. **Value caching** — Cache discovered project/user IDs for faster resolution
4. **Integration** — Better error recovery with Hermes

## 📝 Files Modified

- `src/client.ts` — Error parsing and hints (+100 lines)
- `src/tools.ts` — Improved descriptions and parameters (+50 lines)
- `src/index.ts` — Removed console.log noise (-20 lines)
- `.claude/skills/redmine-mcp.md` — New skill guide (245 lines)

## ✨ Key Takeaway

**Agents can now self-correct on common mistakes without consulting documentation.**

Instead of generic "422 error", they get:
```
project: not found
💡 Hint: Use list_projects to find valid project_id (must be numeric)
```

This makes the entire Redmine MCP tool more usable for agents and the Hermes tool.

---

**Status**: ✅ Complete & Ready
**Date**: 2026-06-23
**Version**: 1.0.1
