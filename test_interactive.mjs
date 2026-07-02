#!/usr/bin/env node

/**
 * Interactive Manual Testing Script for Redmine MCP Tools
 * Usage: node test_interactive.mjs
 */

import { RedmineClient } from './dist/client.js';
import * as readline from 'readline';
import * as fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const redmineUrl = process.env.REDMINE_URL;
const redmineApiKey = process.env.REDMINE_API_KEY;

if (!redmineUrl || !redmineApiKey) {
  console.error('❌ Error: REDMINE_URL and REDMINE_API_KEY must be set in .env file');
  console.error('   Copy .env.example to .env and fill in your Redmine credentials');
  process.exit(1);
}

const client = new RedmineClient(redmineUrl, redmineApiKey);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const tests = {
  '1': {
    name: 'list_issues (basic)',
    fn: () => client.listIssues({ limit: 5 }),
  },
  '2': {
    name: 'list_issues (paginate=true)',
    fn: () => client.listIssues({ paginate: true, limit: 100 }),
  },
  '3': {
    name: 'list_issues (save_to_file=true)',
    fn: () => client.listIssues({ save_to_file: true, limit: 10 }),
  },
  '4': {
    name: 'list_issues (project_ids=[890], status_id=5)',
    fn: () => client.listIssues({ project_ids: [890], status_id: [5,2], limit: 10 })
  },
  '5': {
    name: 'list_projects (basic)',
    fn: () => client.listProjects({ limit: 5 }),
  },
  '6': {
    name: 'list_projects (paginate=true)',
    fn: () => client.listProjects({ paginate: true }),
  },
  '7': {
    name: 'list_projects (save_to_file=true)',
    fn: () => client.listProjects({ save_to_file: true, limit: 10 }),
  },
  '8': {
    name: 'list_time_entries (basic)',
    fn: () => client.listTimeEntries({ limit: 5 }),
  },
  '9': {
    name: 'list_time_entries (paginate=true)',
    fn: () => client.listTimeEntries({ paginate: true, limit: 100, from_date: '2026-06-01', to_date: '2026-06-30' }),
  },
  '10': {
    name: 'list_time_entries (save_to_file=true)',
    fn: () => client.listTimeEntries({ save_to_file: true, limit: 10 }),
  },
  '11': {
    name: 'list_time_entries (project_ids=[890])',
    fn: () => client.listTimeEntries({ project_ids: [890], limit: 10 }),
  },
  '12': {
    name: 'list_time_entries (project_ids=[890])',
    fn: () => client.listTimeEntries({ project_ids: [890], limit: 10 }),
  },
  '13': {
    name: 'get_issue (issue_id=48850)',
    fn: () => client.getIssue(48850),
  },
  '14': {
    name: 'Check saved files',
    fn: async () => {
      const { execSync } = await import('child_process');
      const output = execSync('ls -lh /tmp/redmine_result_*.json 2>/dev/null || echo "No files found"').toString();
      return { files: output };
    },
  },
  '15': {
    name: 'read_saved_file (example: /tmp/redmine_result_<timestamp>.json)',
    fn: async () => {
      const { readdirSync } = await import('fs');
      try {
        const files = readdirSync('/tmp').filter(f => f.startsWith('redmine_result_') && f.endsWith('.json')).sort().reverse();
        if (files.length === 0) {
          return { error: 'No saved files found. Run test 3, 7, or 10 first to create a file.' };
        }
        const filepath = `/tmp/${files[0]}`;
        const result = await client.readSavedFile(filepath);
        return { file: filepath, data: result };
      } catch (e) {
        return { error: `Failed to read file: ${e.message}` };
      }
    },
  },
};

function showMenu() {
  console.clear();
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║       Redmine MCP Tools - Interactive Test Menu             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  for (const [key, test] of Object.entries(tests)) {
    console.log(`  ${key.padEnd(2)} - ${test.name}`);
  }

  console.log('\n  0  - Exit\n');
}

async function runTest(choice) {
  if (choice === '0') {
    console.log('\nGoodbye!\n');
    process.exit(0);
  }

  if (!tests[choice]) {
    console.log('❌ Invalid choice. Press Enter to continue...');
    await new Promise(resolve => rl.question('', resolve));
    return;
  }

  const test = tests[choice];
  console.log(`\n⏳ Running: ${test.name}\n`);

  try {
    const startTime = Date.now();
    const result = await test.fn();
    const duration = Date.now() - startTime;

    console.log('✅ Success! Result:\n');
    console.log('results:', result);

    if (result.file_path) {
      console.log(`   File Path: ${result.file_path}`);
      try {
        const stats = fs.statSync(result.file_path);
        console.log(`   Size: ${stats.size} bytes`);
      } catch (e) {
        console.log(`   Size: (unable to read)`);
      }
    } else if (result.issues) {
      console.log(`   Total Issues: ${result.total}`);
      console.log(`   Returned: ${result.issues.length}`);
      if (result.issues.length > 0) {
        console.log(`   First Issue: #${result.issues[0].id} - ${result.issues[0].subject}`);
      }
    } else if (result.projects) {
      console.log(`   Total Projects: ${result.total}`);
      console.log(`   Returned: ${result.projects.length}`);
      if (result.projects.length > 0) {
        console.log(`   First Project: ${result.projects[0].name}`);
      }
    } else if (result.time_entries) {
      console.log(`   Total Entries: ${result.total}`);
      console.log(`   Returned: ${result.time_entries.length}`);
      if (result.time_entries.length > 0) {
        console.log(`   First Entry: Issue #${result.time_entries[0].issue?.id || 'N/A'} - ${result.time_entries[0].hours}h on ${result.time_entries[0].spent_on}`);
      }
    } else if (result.files) {
      console.log(`   ${result.files}`);
    } else {
      console.log(JSON.stringify(result, null, 2).substring(0, 500));
    }

    console.log(`\n   ⏱️  Duration: ${duration}ms`);
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }

  await new Promise(resolve => rl.question('\nPress Enter to continue...', resolve));
}

async function main() {
  while (true) {
    showMenu();
    const choice = await new Promise(resolve => {
      try {
        rl.question('Select a test (0-14): ', resolve);
      } catch (e) {
        resolve('0');
      }
    });
    await runTest(choice.trim());
  }
}

main().catch(console.error).finally(() => rl.close());
