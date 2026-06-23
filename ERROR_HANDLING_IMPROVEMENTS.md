# Error Handling & UX Improvements for Redmine MCP

## Summary of Changes

This update improves error messages and tool documentation to help agents use Redmine MCP more effectively, especially when they make common mistakes like using usernames instead of numeric IDs.

### What Changed

#### 1. **Client Error Parsing** (`src/client.ts`)
- **Before**: Raw HTTP 422 errors with no field information
  ```
  Redmine API error on POST /issues.json: 422
  ```
- **After**: Field-specific validation errors with helpful hints
  ```
  Redmine API error on POST /issues.json:
  project: not found
  💡 Hint: Use list_projects to find valid project_id (must be numeric)
  ```

#### 2. **Contextual Error Hints** (`src/client.ts`)
Added intelligent error hints for common mistakes:
- Using username instead of numeric `user_id` → "Use numeric user_id from list_users (not username)"
- Using "open" string in `create_issue` → "Use numeric status_id (status strings only work in list filters)"
- Missing both `issue_id` and `project_id` in time entry → "Time entry must reference either issue_id OR project_id, but not both"
- Invalid date format → "Use YYYY-MM-DD format for date fields"

#### 3. **Improved Tool Descriptions** (`src/tools.ts`)
All tool descriptions now:
- Clarify which parameters require numeric IDs
- Explain how to find valid IDs (which `list_*` tools to use)
- Distinguish between different contexts (e.g., "open" works in list filters but not in create_issue)
- Add parameter-level hints in Zod schema descriptions

**Example improvements:**
- `list_assigned_issues`: Now explains that status_id accepts "open"/"closed" only in list context
- `create_issue`: Clarifies that status_id must be numeric, and tracker_id/priority_id vary by instance
- `create_time_entry`: Emphasizes requiring either issue_id OR project_id (not both)

#### 4. **Skill File for Agents** (`.claude/skills/redmine-mcp.md`)
Created a comprehensive guide covering:
- Quick start pattern: "List first → Validate IDs → Operate"
- Reference table of common mistakes with solutions
- Tool reference with required vs optional parameters
- Safe patterns for creating and updating issues
- Error message decoder
- Tips for agents debugging

## Common Scenarios Now Handled Better

### Scenario 1: Agent Tries to Assign Using Username
```
create_issue({project_id: 1, subject: "Bug", assigned_to_id: "john"})
→ 422: assigned_to: not found
→ 💡 Hint: Use numeric user_id from list_users (not username); alternatively use "me"
```

### Scenario 2: Agent Uses Project Key Instead of ID
```
create_issue({project_id: "my-project", subject: "Feature"})
→ 422: project: not found
→ 💡 Hint: Use list_projects to find valid project_id (must be numeric)
```

### Scenario 3: Agent Forgets to Specify Issue or Project in Time Entry
```
create_time_entry({hours: 2, activity_id: 9})
→ 422: Either issue_id or project_id must be provided
→ 💡 Hint: Time entry must reference either an issue_id OR a project_id, but not both
```

### Scenario 4: Agent Uses String Status in Create
```
create_issue({project_id: 1, subject: "Bug", status_id: "open"})
→ 422: status: not found
→ 💡 Hint: Use numeric status_id (status strings only work in list filters, not in create/update)
```

## Files Modified

1. **`src/client.ts`**
   - Added `parseErrorMessage()` method to extract field-specific errors from 422 responses
   - Added `getErrorHint()` method to provide contextual hints for common mistakes
   - Updated `request()` to parse and include hints in error messages
   - Added status-specific context for 401, 403, 404 errors

2. **`src/tools.ts`**
   - Improved descriptions for all 13 tools to clarify parameter requirements
   - Added parameter-level hints in Zod schema descriptions
   - Emphasized which tools to use for discovery (list_projects, list_users)

3. **`.claude/skills/redmine-mcp.md`** (new)
   - Comprehensive agent guide
   - Quick reference tables
   - Safe usage patterns
   - Error message decoder
   - Debugging workflow

4. **`dist/`** (auto-generated)
   - Recompiled JavaScript with improvements

## No Breaking Changes

- All existing tool signatures remain unchanged
- Error messages are strictly additive (more info, not different info)
- Implementation is backward compatible

## Future Enhancements (Optional)

These improvements provide better immediate feedback. Future enhancements could include:
- Enumeration tools (list_trackers, list_issue_statuses, list_priorities) to dynamically discover instance-specific IDs
- Schema validation on the client side before making API calls
- Caching of common lookups (projects, users) for faster resolution

## Testing the Improvements

To see the improvements in action:

```bash
# Start the server with test credentials
REDMINE_URL="https://redmine.eneopt.hu" \
REDMINE_API_KEY="efb32516e925657c384bb54309640763c7b35b39" \
npm start

# In another terminal, test with Hermes or any MCP client:
# - Try creating an issue with wrong project_id
# - Try assigning to a username instead of user_id
# - Try using "open" in create_issue instead of numeric status_id

# The error messages will now include field-specific hints
```

---

**Version**: 1.0.1
**Date**: 2026-06-23
