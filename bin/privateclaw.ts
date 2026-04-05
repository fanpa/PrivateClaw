#!/usr/bin/env node
import { createApp } from '../src/cli/app.js';

const app = createApp();
app.parse(process.argv);
