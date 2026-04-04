#!/usr/bin/env node --import tsx
import { createApp } from '../src/cli/app.js';

const app = createApp();
app.parse(process.argv);
