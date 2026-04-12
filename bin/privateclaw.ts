#!/usr/bin/env node
import { createApp } from '../src/cli/app.js';

const app = createApp();

// Default to 'chat' when no subcommand is given
const knownCommands = app.commands.map((c) => c.name());
const userArgs = process.argv.slice(2);
const hasCommand = userArgs.some((arg) => knownCommands.includes(arg));

if (!hasCommand && !userArgs.includes('-h') && !userArgs.includes('--help') && !userArgs.includes('-V') && !userArgs.includes('--version')) {
  process.argv.splice(2, 0, 'chat');
}

app.parse(process.argv);
