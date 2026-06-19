/* Tool definitions + dispatch for the Redmine MCP server. */

import type { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { RedmineClient } from './client.js';

/* --- Issues --- */

export function registerAllTools(server: FastMCP, client: RedmineClient) {
  server.addTool({
    name: 'list_assigned_issues',
    description:
      "List issues assigned to a user. Defaults to the API key owner (user_id='me'). Filter by project_id and/or status_id ('open', 'closed', '*' for all, or a numeric status id; default 'open'). Response includes total count and pagination info (offset, limit) to support manual pagination.",
    parameters: z.strictObject({
      user_id: z
        .union([z.number(), z.string()])
        .optional()
        .default('me')
        .describe("Default 'me'."),
      project_id: z.number().int().optional(),
      status_id: z.string().optional().describe('open|closed|*|<id>'),
      limit: z.number().int().max(100).default(25),
      offset: z.number().int().default(0).describe('For pagination.'),
    }),
    execute: async (args) => {
      const result = await client.listIssues({
        assigned_to_id: args.user_id,
        project_id: args.project_id,
        status_id: args.status_id,
        limit: args.limit,
        offset: args.offset,
      });
      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: 'search_issues',
    description:
      'Full-text search across issue subject/description. Optionally narrow by project_id or status_id. Response includes total count and pagination info (offset, limit) to support manual pagination.',
    parameters: z.strictObject({
      query: z.string(),
      project_id: z.number().int().optional(),
      status_id: z.string().optional(),
      limit: z.number().int().max(100).default(25),
      offset: z.number().int().default(0).describe('For pagination.'),
    }),
    execute: async (args) => {
      const result = await client.listIssues({
        query: args.query,
        project_id: args.project_id,
        status_id: args.status_id,
        limit: args.limit,
        offset: args.offset,
      });
      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: 'get_issue',
    description:
      'Fetch a single issue by id. Pass include (comma-separated: journals, attachments, relations, children) for extra detail.',
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
    description: 'Create a new issue in a project. Only project_id and subject are required.',
    parameters: z.strictObject({
      project_id: z.number().int(),
      subject: z.string(),
      description: z.string().optional(),
      tracker_id: z.number().int().optional(),
      status_id: z.number().int().optional(),
      priority_id: z.number().int().optional(),
      assigned_to_id: z.number().int().optional(),
      parent_issue_id: z.number().int().optional(),
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
    description:
      "Update an issue's status, assignee, and/or progress. Pass notes to leave a comment in the same call.",
    parameters: z.strictObject({
      issue_id: z.number().int(),
      status_id: z.number().int().optional(),
      assigned_to_id: z.number().int().optional(),
      notes: z.string().optional(),
      done_ratio: z.number().int().min(0).max(100).optional(),
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
    description:
      "Fetch a wiki page's content from a project. title defaults to 'Wiki' (the home page).",
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
    description:
      'List logged time entries, filterable by user_id, project_id, issue_id. For a date range use period (Redmine shorthand: today, yesterday, current_week, last_week, current_month, last_month, current_year) OR explicit from_date/to_date (YYYY-MM-DD). Response includes total count and pagination info (offset, limit) to support manual pagination.',
    parameters: z.strictObject({
      user_id: z.union([z.number().int(), z.string()]).optional().describe("Numeric id or 'me'."),
      project_id: z.number().int().optional(),
      issue_id: z.number().int().optional(),
      period: z.string().optional(),
      from_date: z.string().optional(),
      to_date: z.string().optional(),
      limit: z.number().int().max(100).default(25),
      offset: z.number().int().default(0).describe('For pagination.'),
    }),
    execute: async (args) => {
      const result = await client.listTimeEntries({
        user_id: args.user_id,
        project_id: args.project_id,
        issue_id: args.issue_id,
        from_date: args.from_date,
        to_date: args.to_date,
        period: args.period,
        limit: args.limit,
        offset: args.offset,
      });
      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: 'get_issue_time_entries',
    description:
      'List all time entries logged against a specific issue. Response includes total count and pagination info (offset, limit) to support manual pagination.',
    parameters: z.strictObject({
      issue_id: z.number().int(),
      limit: z.number().int().max(100).default(25),
      offset: z.number().int().default(0).describe('For pagination.'),
    }),
    execute: async (args) => {
      const result = await client.getIssueTimeEntries(args.issue_id, args.limit, args.offset);
      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: 'create_time_entry',
    description:
      'Log time spent on an issue or project. Provide either issue_id or project_id, hours, and ideally activity_id (use list_time_entries on a similar issue to find valid activity ids). spent_on defaults to today if omitted.',
    parameters: z.strictObject({
      issue_id: z.number().int().optional(),
      project_id: z.number().int().optional(),
      hours: z.number(),
      activity_id: z.number().int().optional(),
      spent_on: z.string().optional().describe('YYYY-MM-DD'),
      comments: z.string().optional(),
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
    description:
      'List all projects in the Redmine instance. Response includes total count and pagination info (offset, limit) to support manual pagination.',
    parameters: z.strictObject({
      limit: z.number().int().max(100).default(25),
      offset: z.number().int().default(0).describe('For pagination.'),
    }),
    execute: async (args) => {
      const result = await client.listProjects({
        limit: args.limit,
        offset: args.offset,
      });
      return JSON.stringify(result, null, 2);
    },
  });

  server.addTool({
    name: 'list_users',
    description:
      'List all users in the Redmine instance. Response includes total count and pagination info (offset, limit) to support manual pagination.',
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
}
