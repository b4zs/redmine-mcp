# Validation Examples: Real-World Scenarios

This document shows practical examples of how the validation layer catches common mistakes.

## Example 1: Creating Issue with Wrong Project ID

### ❌ Without Validation
```typescript
// Agent calls
client.createIssue({
  project_id: "my-project",  // String! Should be numeric
  subject: "Bug: Login broken"
})

// No immediate feedback - makes API call
// API returns: 422 Unprocessable Entity: project: not found
// Agent has to retry manually
```

### ✅ With Validation
```typescript
// Agent calls
client.createIssue({
  project_id: "my-project",  // String! Should be numeric
  subject: "Bug: Login broken"
})

// Validation runs immediately:
validator.validateProjectId("my-project")

// Error thrown instantly:
// ValidationError: project_id must be a numeric ID from list_projects

// Agent receives:
// 💡 Use list_projects to find numeric project_id
// 💡 Then retry: project_id: 1 (or whatever number list_projects returned)
```

---

## Example 2: Status ID Context Switching

### ❌ Confusing Without Context Validation
```typescript
// This works in filters (where status strings are valid)
client.listIssues({ status_id: "open" })  // ✓ OK in filter context

// But this fails in create (where only numeric is valid)
client.createIssue({
  project_id: 1,
  subject: "Test",
  status_id: "open"  // ✗ WRONG! Only numeric allowed in create
})

// API call made
// API returns: 422 Unprocessable Entity: status: not found
// Agent doesn't know why - "open" worked in filters!
```

### ✅ Clear Validation
```typescript
// Filter context: validation allows it
validator.validateStatusId("open", true)  // ✓ OK
// Returns silently - "open" is valid in filters

// Create context: validation rejects it
validator.validateStatusId("open", false)  // ✗ REJECTED

// Error message:
// ValidationError: status_id must be numeric (not "open"/"closed" which only work in filters)

// Agent learns: "open" only works in list filters
// Agent fixes: looks up numeric status ID from existing issue, then retries
```

---

## Example 3: Time Entry Mutual Exclusivity

### ❌ Without Validation
```typescript
// Forgot both issue_id and project_id
client.createTimeEntry({
  hours: 2.5,
  spent_on: "2026-06-23",
  activity_id: 9
})

// API call made
// API returns: 422 Unprocessable Entity: Either issue_id or project_id must be provided
// Agent has to figure out which one to use
```

### ✅ With Validation
```typescript
// Same code
client.createTimeEntry({
  hours: 2.5,
  spent_on: "2026-06-23",
  activity_id: 9
})

// Validation runs:
validator.validateIssueIdOrProjectId(undefined, undefined)

// Error thrown immediately:
// ValidationError: Either issue_id or project_id must be provided (but not both)

// Agent knows exactly what's needed
// Agent fixes: adds either issue_id: 123 OR project_id: 5
// Agent retries and succeeds
```

### ❌ Both Provided
```typescript
client.createTimeEntry({
  issue_id: 42,
  project_id: 1,      // ✗ Can't provide both!
  hours: 2.5,
  spent_on: "2026-06-23"
})

// Validation runs:
validator.validateIssueIdOrProjectId(42, 1)

// Error thrown immediately:
// ValidationError: Provide either issue_id or project_id, not both

// Agent fixes: removes one or the other
```

---

## Example 4: Date Range Validation

### ❌ Invalid Date Format
```typescript
client.listTimeEntries({
  from_date: "June 1, 2025",      // ✗ Wrong format!
  to_date: "2025-06-30"
})

// Without validation: API call made, returns 422
// With validation: Error caught immediately
validator.validateFromDate("June 1, 2025", "2025-06-30")

// Error:
// ValidationError: from_date must be in YYYY-MM-DD format
```

### ❌ Reversed Date Range
```typescript
client.listTimeEntries({
  from_date: "2025-06-30",   // End date!
  to_date: "2025-01-01"      // Start date! Reversed!
})

// Validation catches:
validator.validateFromDate("2025-06-30", "2025-01-01")

// Error:
// ValidationError: from_date must be <= to_date
```

### ✅ Valid Date Range
```typescript
client.listTimeEntries({
  from_date: "2025-06-01",
  to_date: "2025-06-30"
})

// Validation passes:
validator.validateFromDate("2025-06-01", "2025-06-30")

// ✓ Proceeds to API call
```

---

## Example 5: Period vs Date Range Conflict

### ❌ Both Specified
```typescript
client.listTimeEntries({
  period: "current_month",       // ✗ Can't have both!
  from_date: "2025-06-01",
  to_date: "2025-06-30"
})

// Validation logic:
if (period && (from_date || to_date)) {
  throw new Error('Specify either period OR date range, not both');
}

// Error caught immediately with clear message
```

### ✅ Using Period Shorthand
```typescript
client.listTimeEntries({
  period: "current_month"  // ✓ Use period OR date range
})

// Validation passes
validator.validatePeriod("current_month")

// ✓ Proceeds to API call
```

---

## Example 6: User ID with "me" Special Value

### ✅ Using "me"
```typescript
client.listIssues({
  user_id: "me"  // ✓ Special value for current user
})

// Validation passes:
validator.validateUserId("me", "user_id")

// ✓ Proceeds to API call
```

### ❌ Using Username
```typescript
client.listIssues({
  user_id: "john"  // ✗ Username, not ID!
})

// Validation runs:
validator.validateUserId("john", "user_id")

// Error:
// ValidationError: user_id must be a numeric ID from list_users or "me"

// Agent learns: Must use list_users to get john's numeric ID
// Agent follows guidance: list_users() → find john's id (e.g., 42)
// Agent retries: user_id: 42
```

---

## Example 7: Pagination Limits

### ❌ Limit Too High
```typescript
client.listIssues({
  limit: 500  // ✗ Max is 100
})

// Validation catches:
validator.validateLimit(500)

// Error:
// ValidationError: limit must be between 1 and 100
```

### ❌ Negative Offset
```typescript
client.listIssues({
  offset: -10  // ✗ Can't go backward
})

// Validation catches:
validator.validateOffset(-10)

// Error:
// ValidationError: offset must be non-negative
```

### ✅ Valid Pagination
```typescript
client.listIssues({
  limit: 50,
  offset: 100
})

// Validation passes:
validator.validateLimit(50)
validator.validateOffset(100)

// ✓ Proceeds to API call
```

---

## Example 8: Done Ratio Range

### ❌ Out of Range
```typescript
client.updateIssue({
  issue_id: 42,
  done_ratio: 150  // ✗ Must be 0-100!
})

// Validation catches:
validator.validateDoneRatio(150)

// Error:
// ValidationError: done_ratio must be between 0 and 100, got 150
```

### ✅ Valid Range
```typescript
client.updateIssue({
  issue_id: 42,
  done_ratio: 75  // ✓ Valid (0-100)
})

// Validation passes:
validator.validateDoneRatio(75)

// ✓ Proceeds to API call
```

---

## Example 9: FilterBuilder Safe Construction

### ❌ Manual Filter (Easy to Mess Up)
```typescript
// Direct params - easy to make mistakes
const params = {
  'f[]': ['status_id', 'created_on'],
  'op[status_id]': '=',
  'op[created_on]': '><',
  'v[status_id][]': 'open',        // ✗ Not validated
  'v[created_on][]': '2025-31-13|2025-01-01'  // ✗ Invalid date range
};

client.listIssues(params);  // Will fail at API
```

### ✅ FilterBuilder (Validated)
```typescript
import { FilterBuilder } from './filters.js';

const filter = new FilterBuilder()
  .addEqual('status_id', 'open')              // ✓ Validated for filter context
  .addDateRange('created_on', '2025-01-01', '2025-12-31')  // ✓ Date range validated
  .build();

// Validation runs during build():
// ✓ 'open' is valid status in filter context
// ✓ Date format is YYYY-MM-DD
// ✓ Start date <= end date
// ✓ Range syntax is correct

client.listIssues(filter);  // Safe to call
```

### ❌ Invalid Filter Operation
```typescript
const filter = new FilterBuilder()
  .addEqual('status_id', 'open')
  .addDateRange('created_on', '2025-12-31', '2025-01-01')  // ✗ Reversed!
  .build();

// Validation catches during build():
// Error: Date range start (2025-12-31) must be <= end (2025-01-01)

// Error thrown before any API call
```

---

## Example 10: Subject Length Validation

### ❌ Too Long
```typescript
const longSubject = "A".repeat(300);  // 300 characters

client.createIssue({
  project_id: 1,
  subject: longSubject  // ✗ Max is 255!
})

// Validation catches:
validator.validateSubject(longSubject)

// Error:
// ValidationError: subject is too long (maximum is 255 characters, got 300)
```

### ✅ Valid Length
```typescript
const subject = "Bug: Login button not responding";  // ~32 characters

client.createIssue({
  project_id: 1,
  subject: subject  // ✓ Valid
})

// Validation passes:
validator.validateSubject(subject)

// ✓ Proceeds to API call
```

---

## Summary Table

| Scenario | Without Validation | With Validation |
|----------|-------------------|-----------------|
| Wrong project ID type | API call, 422 error | Immediate error: use list_projects |
| Status string in create | API call, 422 error | Immediate error: numeric only |
| Both issue_id and project_id | API call, 422 error | Immediate error: choose one |
| Invalid date format | API call, 422 error | Immediate error: use YYYY-MM-DD |
| Reversed date range | API call, 422 error | Immediate error: start <= end |
| Period + date range conflict | May work unexpectedly | Immediate error: choose one |
| Username instead of ID | API call, 422 error | Immediate error: use list_users |
| Limit > 100 | API call, capped | Immediate error: max 100 |
| Done ratio > 100 | API call, 422 error | Immediate error: max 100 |
| Subject too long | API call, 422 error | Immediate error: max 255 chars |

---

**Benefits**: Faster feedback, fewer API calls, better debugging, more predictable behavior

