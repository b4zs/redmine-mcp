Create a new tool:
- list_issues

The following tools need modifications:
- list_projects
- list_time_entries

All 3 of these require 2 new parameters:
- paginate over results: boolean, if true the result must contain a merged list of all available pages matching the original api format
- save results to file: boolean, if true - save the result to a file in /tmp dir and return the file path handle instead

---

Add a new, optional project id array filter to the following tools:
- list_issues
- list_time_entries

The Redmine API requires the filter format: `f[]=project_id&op[project_id]==&v[project_id][]=<project_id>`
- `f[]` = filter field name (must include 'project_id')
- `op[project_id]` = operator (use '=')
- `v[project_id][]` = values (can be array)

When using project_id filter with status filter:
- Include both filters in f[] array: `f[]=status_id&f[]=project_id`
- Status uses numeric ID with equals operator: `op[status_id]==&v[status_id][]=2` (2 = "assigned")
- Project uses equals operator: `op[project_id]==&v[project_id][]=890`

Status ID format differs based on filter usage:
- Without project_ids filter: Can use string shortcuts like 'open', 'closed' (internally converted to 'o', 'c')
- With project_ids filter (using f[] format): Must use numeric status IDs (e.g., 2 for "assigned")

Query string parameter order matters:
- All f[] parameters first
- All op[] parameters next
- All v[] parameters last
- Other params (limit, offset) can go anywhere

Note: The API key must have access to the specified projects, otherwise returns 0 results.

Remove the following tools:
- list_assigned_issues
- search_issues
- get_issue_time_entries

Update tool descriptions after the modifications

Test the new tools

```
Example issues.json uri with filters:
/issues.json?utf8=✓&set_filter=1&f%5B%5D=status_id&op%5Bstatus_id%5D=o&f%5B%5D=project_id&op%5Bproject_id%5D=%3D&v%5Bproject_id%5D%5B%5D=787&v%5Bproject_id%5D%5B%5D=53&f%5B%5D=&c%5B%5D=project&c%5B%5D=subject&c%5B%5D=status&c%5B%5D=assigned_to&c%5B%5D=done_ratio&c%5B%5D=estimated_hours&c%5B%5D=spent_hours&c%5B%5D=updated_on&group_by=&t%5B%5D=
```

```
redmine status filters:
<select class="value" id="values_issue_status_id_1" name="v[issue.status_id][]"><option value="1">New</option><option value="2">Assigned</option><option value="7">In progress</option><option value="8">Test needed</option><option value="4">Feedback</option><option value="9">Feedback needed</option><option value="10">WaitingForDeploy</option><option value="3">Resolved</option><option value="5">Closed</option><option value="6">Rejected</option></select>
```