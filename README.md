# @a-bonus/redmine-mcp

MCP server for Redmine (issues + time entries) over stdio. Written in TypeScript.

## Install

```bash
npm install @a-bonus/redmine-mcp
# or
npx @a-bonus/redmine-mcp
```

For local development:

```bash
npm install
npm run build
npm start
```

## Config

The Redmine base URL and API key are passed by the MCP host via CLI flags or environment variables:

- `--redmine-url` / `REDMINE_URL`
- `--redmine-api-key` / `REDMINE_API_KEY`

## Tools

### Issues

- `list_assigned_issues` - List issues assigned to a user
- `search_issues` - Full-text search across issues
- `get_issue` - Fetch a single issue by ID
- `create_issue` - Create a new issue
- `update_issue` - Update issue status, assignee, and progress
- `add_issue_note` - Add a comment to an issue

### Wiki

- `get_project_wiki` - Fetch a wiki page's content
- `list_wiki_pages` - List wiki page titles in a project

### Time Entries

- `list_time_entries` - List logged time entries (requires time_entries plugin)
- `get_issue_time_entries` - List time entries for a specific issue
- `create_time_entry` - Log time spent on an issue or project

## Registration (Claude Code)

Add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "redmine": {
      "command": "npx",
      "args": ["@a-bonus/redmine-mcp"],
      "env": {
        "REDMINE_URL": "https://your-redmine-instance.example.com",
        "REDMINE_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

Or for local development:

```json
{
  "mcpServers": {
    "redmine": {
      "command": "node",
      "args": ["/path/to/redmine-mcp-npx/dist/index.js"],
      "env": {
        "REDMINE_URL": "https://your-redmine-instance.example.com",
        "REDMINE_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

## Pagination

All list tools (`list_assigned_issues`, `search_issues`, `list_time_entries`, `get_issue_time_entries`) now support pagination with `offset` parameter and return pagination metadata:

```json
{
  "issues": [...],
  "total": 150,
  "limit": 25,
  "offset": 0
}
```

- `total`: Total number of results
- `limit`: Items per page
- `offset`: Current page offset

To get the next page, call again with `offset: 25` (or current_offset + limit).

## Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Run with tsx (TypeScript directly, no compilation)
- `npm start` - Run the compiled server
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting
