# Redmine MCP: Validation Layer Guide

## Overview

This document describes the comprehensive client-side validation layer added to the Redmine MCP client. Validation happens **before API calls**, catching common mistakes early with helpful error messages.

## What Was Added

### 1. Validation Module (`src/validation.ts`)
- Validates individual parameter types and ranges
- Provides detailed error messages for each constraint
- Covers numeric, string, date, and special value types

### 2. Filter Module (`src/filters.ts`)
- Specialized validation for list operation filters
- Handles complex filter syntax (f[], op[], v[])
- Supports all filter operators and date range formats
- Includes helpful `FilterBuilder` class for safe filter construction

### 3. Integration with Client (`src/client.ts`)
- All public methods validate parameters before API calls
- Validation errors throw immediately with clear messages
- Prevents unnecessary API calls that would fail

## Validation Coverage

### Parameter Types

#### Numeric IDs (Always Positive Integers)
- `project_id` — Must be positive integer from `list_projects`
- `issue_id` — Must be positive integer; used in GET/PUT endpoints
- `tracker_id` — Must be positive integer; instance-specific values
- `priority_id` — Must be positive integer; instance-specific values
- `activity_id` — Must be positive integer
- `user_id` — Numeric OR special value `"me"`
- `status_id` — Context-sensitive:
  - **In filters**: Can be `"open"`, `"closed"`, `"*"`, or numeric
  - **In create/update**: Must be numeric only

**Error if invalid:**
```
Error: project_id must be a numeric ID from list_projects
Error: user_id must be a numeric ID from list_users or "me"
Error: status_id must be numeric (not "open"/"closed" which only work in filters)
```

#### String Parameters
- `subject` — Non-empty, max 255 characters
- `description` — Optional; must be string if provided
- `query` — Non-empty string for search
- `wiki_title` — Non-empty, max 255 characters
- `include` — Comma-separated valid values: journals, attachments, relations, children

**Error if invalid:**
```
Error: subject is required and must be <= 255 characters
Error: query must be a non-empty string
Error: include unknown value "invalid"; valid: journals, attachments, relations, children
```

#### Numeric Ranges
- `hours` — Positive number (supports decimals like 1.5)
- `done_ratio` — Integer 0-100
- `limit` — Integer 1-100 (pagination max per Redmine)
- `offset` — Non-negative integer (pagination)

**Error if invalid:**
```
Error: hours must be a positive number (e.g., 1.5 for 1h 30m), got 0
Error: done_ratio must be between 0 and 100, got 150
Error: limit must be between 1 and 100
```

#### Date Parameters
- `spent_on` — YYYY-MM-DD format, valid calendar date
- `from_date` — YYYY-MM-DD format
- `to_date` — YYYY-MM-DD format; must be >= from_date
- `period` — One of: today, yesterday, current_week, last_week, current_month, last_month, current_year

**Error if invalid:**
```
Error: spent_on must be in YYYY-MM-DD format, got "06/23/2026"
Error: spent_on is not a valid calendar date: "2026-13-01"
Error: from_date must be <= to_date
Error: period must be one of: today, yesterday, current_week, ..., got "next_week"
```

### Mutual Exclusivity Constraints

#### Time Entry Creation
- **Requirement**: Specify either `issue_id` OR `project_id`, but not both, not neither
- **Validation**:
  ```typescript
  validator.validateIssueIdOrProjectId(issue_id, project_id);
  ```

**Error if invalid:**
```
Error: Either issue_id or project_id must be provided (but not both)
Error: Provide either issue_id or project_id, not both
```

### Filter-Specific Validation

Filters use a special three-parameter syntax that's validated carefully.

#### Supported Operators
| Operator | Type | Example | Valid For |
|----------|------|---------|-----------|
| `=` | Equality | project_id = 1 | All fields |
| `!=` | Inequality | status_id != 5 | All fields |
| `>` | Greater | created_on > 2025-01-01 | Dates, numbers |
| `<` | Less | done_ratio < 50 | Dates, numbers |
| `>=` | Greater/Equal | updated_on >= 2025-06-01 | Dates, numbers |
| `<=` | Less/Equal | priority_id <= 2 | Dates, numbers |
| `~` | Contains | subject ~ "bug" | Text fields |
| `!~` | Not contains | subject !~ "closed" | Text fields |
| `<>` | Multiple (OR) | status_id: 1 or 2 or 3 | All fields |
| `><` | Range/Between | spent_on: 2025-01-01 to 2025-12-31 | Dates |

#### Date Range Format
- **Syntax**: `start_date|end_date` (pipe-delimited)
- **Operator**: `><`
- **Example**: `spent_on: 2025-06-01|2025-06-30`

**Error if invalid:**
```
Error: Range filter (><) requires format "start|end" for field "spent_on", got "2025-06-01-2025-06-30"
Error: Date range start (2025-12-31) must be <= end (2025-01-01) for field "spent_on"
```

#### Period Shortcuts (Time Entries Only)
- `today` — Current date
- `yesterday` — Previous date
- `current_week` — This calendar week
- `last_week` — Previous calendar week
- `current_month` — This month
- `last_month` — Previous month
- `current_year` — This year

**Error if invalid:**
```
Error: period must be one of: today, yesterday, current_week, last_week, current_month, last_month, current_year, got "next_week"
```

## How Validation Works

### Automatic Validation in Client Methods

Every public method in `RedmineClient` validates parameters before API calls:

```typescript
async createIssue(options) {
  // ✓ Validates project_id is positive integer
  validator.validateProjectId(options.project_id);
  
  // ✓ Validates subject is non-empty string, max 255 chars
  validator.validateSubject(options.subject);
  
  // ✓ Validates optional status_id (if provided)
  if (options.status_id !== undefined) {
    validator.validateStatusId(options.status_id, false); // false = not in filter context
  }
  
  // ✓ Now safe to make API call
  const data = await this.request('POST', '/issues.json', ...);
}
```

### Error Flow

```
Agent calls: create_issue(project_id="my-project", ...)
    ↓
Client validates: validator.validateProjectId("my-project")
    ↓
Validation fails: project_id must be numeric
    ↓
Error thrown immediately: Error: project_id must be a numeric ID from list_projects
    ↓
Agent receives error BEFORE API call wasted
    ↓
Agent can self-correct (call list_projects to find ID)
    ↓
Agent retries with valid project_id: create_issue(project_id=1, ...)
```

### Validation Methods Available

**Numeric ID Validators**:
```typescript
validator.validateProjectId(projectId)
validator.validateIssueId(issueId)
validator.validateTrackerId(trackerId)
validator.validatePriorityId(priorityId)
validator.validateUserId(userId, fieldName) // Supports "me"
validator.validateStatusId(statusId, inFilterContext) // Context-aware
```

**String Validators**:
```typescript
validator.validateSubject(subject)
validator.validateDescription(description)
validator.validateQueryString(query)
validator.validateWikiTitle(title)
validator.validateInclude(include) // Comma-separated
```

**Numeric Range Validators**:
```typescript
validator.validateHours(hours) // Positive number
validator.validateDoneRatio(doneRatio) // 0-100
validator.validateLimit(limit) // 1-100
validator.validateOffset(offset) // Non-negative
```

**Date Validators**:
```typescript
validator.validateSpentOn(spentOn) // YYYY-MM-DD format
validator.validateFromDate(fromDate, toDate) // Date range logic
validator.validatePeriod(period) // Predefined period values
```

**Constraint Validators**:
```typescript
validator.validateIssueIdOrProjectId(issueId, projectId) // Mutual exclusivity
validator.validateCustomFields(customFields) // Array format
```

## FilterBuilder Class

For safe filter construction, use the `FilterBuilder` helper:

```typescript
import { FilterBuilder } from './filters.js';

// Build filters safely with validation
const filter = new FilterBuilder()
  .addEqual('project_id', 1)
  .addIn('status_id', [1, 2, 5]) // OR logic
  .addDateRange('spent_on', '2025-06-01', '2025-06-30')
  .addContains('subject', 'bug')
  .build()

// Result: Ready for client.buildQueryString(filter)
```

### FilterBuilder Methods

```typescript
// Equality
.addEqual(field, value)           // field = value
.addNotEqual(field, value)        // field != value

// Multiple values (OR logic)
.addIn(field, [val1, val2, ...])  // field in [val1, val2, ...]

// Comparison
.addGreaterThan(field, value)     // field > value
.addLessThan(field, value)        // field < value
.addGreaterThanOrEqual(field, value)  // field >= value
.addLessThanOrEqual(field, value)     // field <= value

// Text matching
.addContains(field, value)        // field ~ value (substring)
.addNotContains(field, value)     // field !~ value

// Date ranges
.addDateRange(field, start, end)  // field between start and end

// Periods (time entries only)
.addPeriod(field, period)         // field = period (today, yesterday, etc.)

// Utilities
.build()                          // Get filter params object
.getFilters()                     // Inspect current filters
.clear()                          // Reset all filters
```

### Example: Complex Filtered List

```typescript
import { FilterBuilder } from './filters.js';

// Build complex filter
const filter = new FilterBuilder()
  .addEqual('assigned_to_id', 'me')           // Issues assigned to me
  .addIn('status_id', ['open', 'in_progress']) // Status is open or in progress
  .addGreaterThan('updated_on', '2025-06-01') // Updated after June 1
  .build();

// Use in client
const result = await client.listIssues({
  ...filter,
  limit: 50,
  offset: 0
});

// Filters are validated during build(), so result is safe
```

## Error Message Quality

### Before Validation
```
POST /issues.json → 422 Unprocessable Entity
{ "errors": ["project: not found", "status: not found"] }
```
**Problem**: Agent doesn't know what went wrong or how to fix it

### With Validation
```
Validation Error:
project: not found
status: not found

Hint: Use list_projects to find valid project_id (must be numeric)
Hint: Use numeric status_id (status strings only work in list filters)
```
**Better**: Agent gets specific field errors AND hints on how to fix them

## Edge Cases Handled

### 1. Status ID Context Awareness
```typescript
// In list filter: "open", "closed", "*" are valid
validator.validateStatusId("open", true) // ✓ passes

// In create/update: only numeric
validator.validateStatusId("open", false) // ✗ fails: must be numeric
```

### 2. User ID Special Value
```typescript
// "me" is always valid
validator.validateUserId("me") // ✓ passes

// Numeric is always valid
validator.validateUserId(42) // ✓ passes

// But username is never valid
validator.validateUserId("john") // ✗ fails: not recognized
```

### 3. Period vs Date Range Conflict
```typescript
// Can't specify both
if (period && (from_date || to_date)) {
  throw new Error('Specify either period OR date range, not both');
}
```

### 4. Mutually Exclusive Constraints
```typescript
// Either issue_id OR project_id, but not both
validator.validateIssueIdOrProjectId(undefined, undefined); // ✗ both missing
validator.validateIssueIdOrProjectId(1, 2); // ✗ both provided
validator.validateIssueIdOrProjectId(1, undefined); // ✓ only issue_id
validator.validateIssueIdOrProjectId(undefined, 2); // ✓ only project_id
```

## Integration with Error Handling

Validation errors combine with API errors for complete context:

```
Validation Error (caught immediately):
  Error: project_id must be a numeric ID from list_projects
  
API Error (from Redmine):
  Error: Redmine API error on POST /issues.json:
  project: not found
  💡 Hint: Use list_projects to find valid project_id (must be numeric)
```

## Performance Notes

- **Validation overhead**: Negligible (microseconds per call)
- **API calls prevented**: Major (no failed requests for obvious validation errors)
- **Network savings**: Large (fewer retries due to caught validation errors)
- **Debugging time**: Reduced significantly (errors are specific before hitting API)

## Testing Validation

```typescript
import { validator } from './validation.js';
import { FilterBuilder } from './filters.js';

// Test parameter validation
try {
  validator.validateProjectId("my-project"); // Should throw
} catch (e) {
  console.log(e.message); // "project_id must be a numeric ID..."
}

// Test filter validation
try {
  new FilterBuilder()
    .addDateRange('spent_on', '2025-12-31', '2025-01-01') // Invalid range
    .build();
} catch (e) {
  console.log(e.message); // "Date range start must be <= end"
}
```

## Instance-Specific Notes

Some validations are **instance-specific** and cannot be fully validated client-side:

- `tracker_id` — Valid values vary per instance
- `priority_id` — Valid values vary per instance  
- `status_id` — Workflow determines valid transitions
- `activity_id` — Available activities vary per instance

**Client-side validation ensures**: Value is numeric, not just format
**API validation ensures**: Value is actually valid for instance

## Summary

| Aspect | Benefit |
|--------|---------|
| **Early feedback** | Errors caught before API calls |
| **Clearer errors** | Specific field + hint, not generic HTTP status |
| **Fewer retries** | Obvious mistakes fail immediately |
| **Better documentation** | Parameter constraints explicit in code |
| **Safe filters** | FilterBuilder validates syntax |
| **Context awareness** | Status strings only in filters, etc. |
| **Edge cases** | Mutual exclusivity, date ranges, periods |

---

**Version**: 1.0.0
**Date**: 2026-06-23
