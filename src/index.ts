import { config } from './config/env';
import { initDb, closeDb } from './db/db';
import { initRedis } from './redis/client';
import { QueueManager } from './queues/queue-manager';
import { startScanWorker } from './queues/workers/scan-worker';
import { startVerifyWorker } from './queues/workers/verify-worker';
import { startSyncWorker } from './queues/workers/sync-worker';
import { runSeeds } from './seeds/seed-runner';
import { getStats } from './db/queries';
import { createServer } from './api/server';

async function bootstrap() {
  console.log('====================================================');
  console.log('⚡ LeetRoot: Real-World DSA Pattern Finder Engine');
  console.log('====================================================');

  // 1. Initialize Postgres Database
  const dbOk = await initDb();

  // 2. Initialize Redis & Cache
  const redisOk = await initRedis();

  // 3. Initialize BullMQ Queues
  const queueManager = QueueManager.getInstance();

  // 4. Start BullMQ Workers
  if (redisOk) {
    startScanWorker();
    startVerifyWorker();
    startSyncWorker();
  }

  // 5. Seed initial verified dataset if DB is empty
  try {
    const stats = await getStats();
    if (stats.totalExamples === 0) {
      console.log('[Bootstrap] No examples found in database. Seeding production examples...');
      await runSeeds();
    } else {
      console.log(`[Bootstrap] Database currently contains ${stats.totalExamples} verified production examples.`);
    }
  } catch (err: any) {
    console.warn('[Bootstrap] Auto-seed check failed, running default seed:', err.message);
    await runSeeds();
  }

  // 6. Start HTTP Server for Browser Extension
  const app = createServer();
  const server = app.listen(config.port, () => {
    console.log(`\n🚀 LeetRoot API Server running on http://localhost:${config.port}`);
    console.log(`📡 Ready to serve LeetCode Browser Extension (Phase 3)`);
    console.log(`🔍 Try: http://localhost:${config.port}/api/examples/by-tag?tags=heap-priority-queue\n`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[Shutdown] Closing server and database connections...');
    server.close(async () => {
      await closeDb();
      console.log('[Shutdown] Cleanup complete. Exiting.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('[Fatal Error during bootstrap]:', err);
  process.exit(1);
});
