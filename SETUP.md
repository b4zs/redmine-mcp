# Setup Guide for @a-bonus/redmine-mcp

This is a TypeScript/JavaScript port of the Redmine MCP server. It can be installed and used like any other npm package.

## Local Development

```bash
# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Run the server
npm start

# Or use tsx for direct TypeScript execution
npm run dev
```

## Publishing to NPM

### Prerequisites

1. NPM account at https://www.npmjs.com
2. Logged in locally: `npm login`
3. Update version in `package.json` if needed

### Publish

```bash
# Build the package
npm run build

# Publish to npm registry
npm publish

# For first publish, use:
npm publish --access public
```

The `package.json` has `"publishConfig": { "access": "public" }`, so subsequent publishes don't need the flag.

### After Publishing

Once published, users can install it via:

```bash
npm install @a-bonus/redmine-mcp
# or
npx @a-bonus/redmine-mcp
```

## Without Publishing (Local Development)

Users can use it from a local path by referencing it in their project or settings:

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

Or in Claude Code settings, after building:

```json
{
  "mcpServers": {
    "redmine": {
      "command": "node",
      "args": ["./dist/index.js"],
      "env": {
        "REDMINE_URL": "https://your-redmine-instance.example.com",
        "REDMINE_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

## Installation Methods for Users

### Method 1: From NPM (Published)

```bash
npm install @a-bonus/redmine-mcp
```

Then in Claude Code `.claude/settings.json`:

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

### Method 2: From Local Directory

```bash
# From user's workspace
npm install ../redmine-mcp-npx
```

Then reference it:

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

### Method 3: Direct npm link (Development)

```bash
cd redmine-mcp-npx
npm link

# Then from anywhere:
redmine-mcp
```

Or just use the dist folder directly:

```json
{
  "mcpServers": {
    "redmine": {
      "command": "node",
      "args": ["/absolute/path/to/redmine-mcp-npx/dist/index.js"],
      "env": {
        "REDMINE_URL": "https://your-redmine-instance.example.com",
        "REDMINE_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

## Environment Variables

The server requires:

- `REDMINE_URL` - Base URL of your Redmine instance (e.g., `https://redmine.example.com`)
- `REDMINE_API_KEY` - API key from your Redmine user account

These can be passed:
1. As environment variables before starting the server
2. As command-line arguments: `--redmine-url URL --redmine-api-key KEY`
3. In Claude Code `.claude/settings.json` under `env`

## Troubleshooting

### Build fails
```bash
npm install
npm run build
```

### Type errors in IDE
Make sure `@types/node` is installed:
```bash
npm install --save-dev @types/node
```

### Server won't start
- Check that `REDMINE_URL` and `REDMINE_API_KEY` are set
- Verify the Redmine instance is accessible
- For time_entries tools, ensure the time_entries plugin is enabled on your Redmine instance

### Cannot find module errors
Make sure to build first:
```bash
npm run build
```

## Comparison: Python vs TypeScript

Both versions have identical functionality:

| Feature | Python | TypeScript |
|---------|--------|-----------|
| Issues management | ✓ | ✓ |
| Wiki pages | ✓ | ✓ |
| Time entries | ✓ | ✓ |
| Pagination support | ✓ | ✓ |
| CLI support | ✓ | ✓ |

The TypeScript version uses:
- **fastmcp** framework (like google-docs-mcp)
- **Zod** for schema validation
- Built-in `fetch` API (Node.js 18+)
- Same pagination response format

## Version History

- `1.0.0` - Initial TypeScript port from Python, full feature parity
