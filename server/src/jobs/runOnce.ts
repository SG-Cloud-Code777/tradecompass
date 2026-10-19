import { pool } from '../db/pool.js';
import { runJob, type JobName } from './scheduler.js';

// Usage: npm run jobs:run -- signals funds
const jobs = (process.argv.slice(2).length ? process.argv.slice(2) : ['fundamentals', 'signals', 'insiders', 'funds']) as JobName[];
for (const j of jobs) console.log(await runJob(j));
await pool.end();
