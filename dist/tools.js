/* Tool definitions + dispatch for the Redmine MCP server. */
import { z } from 'zod';
/* --- Issues --- */
export function registerAllTools(server, client) {
    server.addTool({
        name: 'list_issues',
        description: 'List issues from Redmine with optional filtering. Supports pagination, project_id filtering, and multiple project IDs/status IDs. With paginate=true, returns merged list of all available pages. With save_to_file=true, saves result to /tmp and returns file path.',
        parameters: z.strictObject({
            status_id: z.array(z.union([z.number().int(), z.string()])).optional().describe("Array of numeric status IDs or status strings"),
            project_id: z.number().int().optional().describe('Numeric project ID (or use project_ids array for filtering multiple)'),
            project_ids: z.array(z.number().int()).optional().describe('Optional array of project IDs to filter results'),
            updated_on: z.string().optional().describe('Filter by update date using Redmine operator+date format. Use pipe to separate two dates for a range. Examples: ">=2026-06-01" (on or after), "<=2026-06-01" (on or before), "><2026-06-01|2026-06-04" (between, inclusive).'),
            limit: z.number().int().max(100).default(25),
            offset: z.number().int().default(0).describe('For pagination.'),
            paginate: z.boolean().optional().describe('If true, returns merged list of all available pages matching the original API format.'),
            save_to_file: z.boolean().optional().describe('If true, saves the result to a file in /tmp dir and returns the file path handle instead.'),
        }),
        execute: async (args) => {
            const result = await client.listIssues({
                status_id: args.status_id,
                project_id: args.project_id,
                project_ids: args.project_ids,
                updated_on: args.updated_on,
                limit: args.limit,
                offset: args.offset,
                paginate: args.paginate,
                save_to_file: args.save_to_file,
            });
            return JSON.stringify(result, null, 2);
        },
    });
    server.addTool({
        name: 'get_issue',
        description: 'Fetch a single issue by id. Pass include (comma-separated: journals, attachments, relations, children) for extra detail.',
        parameters: z.strictObject({
            issue_id: z.number().int(),
            include: z.string().optional(),
        }),
        execute: async (args) => {
            const result = await client.getIssue(args.issue_id, args.include);
            return JSON.stringify(result, null, 2);
        },
    });
    server.addTool({
        name: 'create_issue',
        description: 'Create a new issue in a project. Required: project_id (numeric, use list_projects), subject. Optional fields must use numeric IDs: tracker_id (issue type), status_id (numeric, not "open"/"closed"), priority_id (urgency), assigned_to_id (use list_users for numeric ID, or "me"). Use get_issue with include parameter to explore field options.',
        parameters: z.strictObject({
            project_id: z.number().int().describe('Numeric ID from list_projects (required)'),
            subject: z.string().describe('Issue title/summary (required)'),
            description: z.string().optional(),
            tracker_id: z.number().int().optional().describe('Numeric ID (Bug=1, Feature=2, etc.; varies by instance)'),
            status_id: z.number().int().optional().describe('Numeric ID only (not "open"/"closed" which only work in list filters)'),
            priority_id: z.number().int().optional().describe('Numeric ID (Low, Normal, High, Urgent; varies by instance)'),
            assigned_to_id: z.number().int().optional().describe('Numeric ID from list_users, or "me" for current user'),
            parent_issue_id: z.number().int().optional().describe('Numeric issue ID to create this as a sub-task'),
        }),
        execute: async (args) => {
            const result = await client.createIssue({
                project_id: args.project_id,
                subject: args.subject,
                description: args.description,
                tracker_id: args.tracker_id,
                status_id: args.status_id,
                priority_id: args.priority_id,
                assigned_to_id: args.assigned_to_id,
                parent_issue_id: args.parent_issue_id,
            });
            return JSON.stringify(result, null, 2);
        },
    });
    server.addTool({
        name: 'update_issue',
        description: "Update an issue's status, assignee, and/or progress. Pass notes to leave a comment in the same call. status_id must be numeric (use get_issue to see current status). assigned_to_id must be numeric from list_users or 'me'.",
        parameters: z.strictObject({
            issue_id: z.number().int().describe('Numeric issue ID'),
            status_id: z.number().int().optional().describe('Numeric status ID (not "open"/"closed")'),
            assigned_to_id: z.union([z.number().int(), z.string()]).optional().describe('Numeric ID from list_users, or "me" for current user'),
            notes: z.string().optional().describe('Comment to add to the issue'),
            done_ratio: z.number().int().min(0).max(100).optional().describe('Completion percentage (0-100)'),
        }),
        execute: async (args) => {
            await client.updateIssue({
                issue_id: args.issue_id,
                status_id: args.status_id,
                assigned_to_id: args.assigned_to_id,
                notes: args.notes,
                done_ratio: args.done_ratio,
            });
            return `Issue #${args.issue_id} updated.`;
        },
    });
    server.addTool({
        name: 'add_issue_note',
        description: "Add a comment/note to an issue without changing any of its fields.",
        parameters: z.strictObject({
            issue_id: z.number().int(),
            note: z.string(),
        }),
        execute: async (args) => {
            await client.addIssueNote(args.issue_id, args.note);
            return `Note added to issue #${args.issue_id}.`;
        },
    });
    server.addTool({
        name: 'get_project_wiki',
        description: "Fetch a wiki page's content from a project. title defaults to 'Wiki' (the home page).",
        parameters: z.strictObject({
            project_id: z.union([z.number().int(), z.string()]),
            title: z.string().default('Wiki'),
        }),
        execute: async (args) => {
            const result = await client.getProjectWiki(args.project_id, args.title);
            return JSON.stringify(result, null, 2);
        },
    });
    server.addTool({
        name: 'list_wiki_pages',
        description: 'List all wiki page titles in a project.',
        parameters: z.strictObject({
            project_id: z.union([z.number().int(), z.string()]),
        }),
        execute: async (args) => {
            const result = await client.listWikiPages(args.project_id);
            return JSON.stringify(result, null, 2);
        },
    });
    server.addTool({
        name: 'list_time_entries',
        description: 'List logged time entries, filterable by user_id, project_id, issue_id. For a date range use period (Redmine shorthand: today, yesterday, current_week, last_week, current_month, last_month, current_year) OR explicit from_date/to_date (YYYY-MM-DD). Response includes total count and pagination info (offset, limit) to support manual pagination. With paginate=true, returns merged list of all available pages. With save_to_file=true, saves result to /tmp and returns file path. Optionally filter by array of project_ids.',
        parameters: z.strictObject({
            user_id: z.union([z.number().int(), z.string()]).optional().describe("Numeric id or 'me'."),
            project_id: z.number().int().optional().describe('Numeric project ID (or use project_ids array for filtering multiple)'),
            project_ids: z.array(z.number().int()).optional().describe('Optional array of project IDs to filter results'),
            issue_id: z.number().int().optional(),
            period: z.string().optional(),
            from_date: z.string().optional(),
            to_date: z.string().optional(),
            limit: z.number().int().max(100).default(25),
            offset: z.number().int().default(0).describe('For pagination.'),
            paginate: z.boolean().optional().describe('If true, returns merged list of all available pages matching the original API format.'),
            save_to_file: z.boolean().optional().describe('If true, saves the result to a file in /tmp dir and returns the file path handle instead.'),
        }),
        execute: async (args) => {
            const result = await client.listTimeEntries({
                user_id: args.user_id,
                project_id: args.project_id,
                project_ids: args.project_ids,
                issue_id: args.issue_id,
                from_date: args.from_date,
                to_date: args.to_date,
                period: args.period,
                limit: args.limit,
                offset: args.offset,
                paginate: args.paginate,
                save_to_file: args.save_to_file,
            });
            return JSON.stringify(result, null, 2);
        },
    });
    server.addTool({
        name: 'create_time_entry',
        description: 'Log time spent on an issue or project. Required: either issue_id or project_id (not both), and hours. Optional: activity_id (numeric; use get_issue_time_entries to see valid values), spent_on (YYYY-MM-DD; defaults to today). activity_id and spent_on must use numeric IDs and valid dates.',
        parameters: z.strictObject({
            issue_id: z.number().int().optional().describe('Numeric issue ID (provide this OR project_id, not both)'),
            project_id: z.number().int().optional().describe('Numeric project ID (provide this OR issue_id, not both)'),
            hours: z.number().describe('Time spent in hours (required)'),
            activity_id: z.number().int().optional().describe('Numeric activity ID (look in similar time entries via get_issue_time_entries)'),
            spent_on: z.string().optional().describe('Date in YYYY-MM-DD format (defaults to today if omitted)'),
            comments: z.string().optional().describe('Note about what was done'),
        }),
        execute: async (args) => {
            const result = await client.createTimeEntry({
                hours: args.hours,
                issue_id: args.issue_id,
                project_id: args.project_id,
                activity_id: args.activity_id,
                spent_on: args.spent_on,
                comments: args.comments,
            });
            return JSON.stringify(result, null, 2);
        },
    });
    server.addTool({
        name: 'list_projects',
        description: 'List all projects in the Redmine instance. Optionally search by project name, identifier, or description. Filter by parent_id to list only direct subprojects of a given project. Response includes total count and pagination info (offset, limit) to support manual pagination. With paginate=true, returns merged list of all available pages. With save_to_file=true, saves result to /tmp and returns file path.',
        parameters: z.strictObject({
            search: z.string().optional().describe('Filter projects by name, identifier, or description. Searches across all projects in memory.'),
            parent_id: z.number().int().optional().describe('Return only direct subprojects of this parent project ID.'),
            limit: z.number().int().max(100).default(25),
            offset: z.number().int().default(0).describe('For pagination.'),
            paginate: z.boolean().optional().describe('If true, returns merged list of all available pages matching the original API format.'),
            save_to_file: z.boolean().optional().describe('If true, saves the result to a file in /tmp dir and returns the file path handle instead.'),
        }),
        execute: async (args) => {
            const result = await client.listProjects({
                search: args.search,
                parent_id: args.parent_id,
                limit: args.limit,
                offset: args.offset,
                paginate: args.paginate,
                save_to_file: args.save_to_file,
            });
            return JSON.stringify(result, null, 2);
        },
    });
    server.addTool({
        name: 'list_users',
        description: 'List all users in the Redmine instance. Response includes total count and pagination info (offset, limit) to support manual pagination.',
        parameters: z.strictObject({
            limit: z.number().int().max(100).default(25),
            offset: z.number().int().default(0).describe('For pagination.'),
        }),
        execute: async (args) => {
            const result = await client.listUsers({
                limit: args.limit,
                offset: args.offset,
            });
            return JSON.stringify(result, null, 2);
        },
    });
    server.addTool({
        name: 'read_saved_file',
        description: 'Read a JSON file previously saved by using save_to_file=true on list operations. Pass the file path returned from the earlier operation.',
        parameters: z.strictObject({
            filepath: z.string().describe('Path to the saved JSON file (e.g., /tmp/redmine_result_1234567890.json)'),
        }),
        execute: async (args) => {
            const result = await client.readSavedFile(args.filepath);
            return JSON.stringify(result, null, 2);
        },
    });
}
