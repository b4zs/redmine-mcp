#!/usr/bin/env node
/* MCP server entry point for Redmine (stdio transport). */
import { FastMCP } from 'fastmcp';
import { RedmineClient } from './client.js';
import { registerAllTools } from './tools.js';
// --- Server setup ---
const app = new FastMCP({
    name: 'redmine-mcp',
    version: '1.0.0',
});
// --- Main ---
async function main() {
    // Parse arguments
    let redmineUrl = process.env.REDMINE_URL;
    let redmineApiKey = process.env.REDMINE_API_KEY;
    for (let i = 2; i < process.argv.length; i++) {
        if (process.argv[i] === '--redmine-url' && i + 1 < process.argv.length) {
            redmineUrl = process.argv[++i];
        }
        else if (process.argv[i] === '--redmine-api-key' && i + 1 < process.argv.length) {
            redmineApiKey = process.argv[++i];
        }
    }
    if (!redmineUrl) {
        console.error('Missing Redmine base URL. Pass --redmine-url or set REDMINE_URL.');
        process.exit(1);
    }
    if (!redmineApiKey) {
        console.error('Missing Redmine API key. Pass --redmine-api-key or set REDMINE_API_KEY.');
        process.exit(1);
    }
    const client = new RedmineClient(redmineUrl, redmineApiKey);
    // Register all tools
    try {
        registerAllTools(app, client);
    }
    catch (error) {
        console.error('Failed to register tools:', error.message || error);
        process.exit(1);
    }
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        process.exit(0);
    });
    process.on('SIGTERM', () => {
        process.exit(0);
    });
    process.on('SIGHUP', () => {
        process.exit(0);
    });
    process.stdin.on('end', () => {
        process.exit(0);
    });
    process.stdin.on('error', () => {
        process.exit(0);
    });
    // Start the server
    try {
        await app.start();
    }
    catch (error) {
        console.error('Server error:', error.message || error);
        process.exit(1);
    }
}
main().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
