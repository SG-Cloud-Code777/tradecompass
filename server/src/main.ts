import { buildApp } from './app.js';
import { config } from './config.js';
import { seed } from './db/seed.js';
import { startScheduler } from './jobs/scheduler.js';

await seed(); // idempotent: applies schema + reference data
const app = await buildApp();
if (config.enableJobs) startScheduler((m) => app.log.info(m));
await app.listen({ port: config.port, host: '0.0.0.0' });
