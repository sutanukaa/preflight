import path from 'node:path';
import dotenv from 'dotenv';

const rootDir = path.resolve(import.meta.dirname, '../../..');
dotenv.config({ path: path.join(rootDir, '.env.local') });
dotenv.config({ path: path.join(rootDir, '.env') });
dotenv.config({ path: '.env.local' });
dotenv.config();
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import { takeDomainSnapshot, detectSnapshotDrift, type DomainSnapshotData } from './processors/domain-check.js';
import { deliverWebhookWithRetry } from './processors/webhook-delivery.js';

const logger = pino({ name: 'preflight-worker' });

export class PreflightWorkerService {
  private redisClient: Redis | null = null;
  private worker: Worker | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private lastSnapshots: Map<string, DomainSnapshotData> = new Map();

  async start() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    logger.info(`Starting Preflight Worker service...`);

    let redisAvailable = false;
    try {
      const client = new Redis(redisUrl, {
        maxRetriesPerRequest: null,
        connectTimeout: 2000,
        retryStrategy: () => null // don't hang if offline
      });

      await new Promise<void>((resolve, reject) => {
        client.on('connect', () => {
          redisAvailable = true;
          resolve();
        });
        client.on('error', (err: unknown) => {
          client.disconnect();
          reject(err);
        });
      });

      this.redisClient = client;
      logger.info('Connected to Redis for BullMQ queues.');
    } catch {
      logger.warn('Redis unavailable. Operating local in-process scheduled monitor.');
    }

    if (redisAvailable && this.redisClient) {
      this.worker = new Worker(
        'domain-checks',
        async (job) => {
          const { domain } = job.data as { domain: string };
          logger.info(`Processing BullMQ domain check for: ${domain}`);
          return await this.runDomainMonitoringJob(domain);
        },
        { connection: this.redisClient }
      );
      this.worker.on('completed', (job) => logger.info(`Job ${job.id} completed.`));
      this.worker.on('failed', (job, err) => logger.error(`Job ${job?.id} failed: ${err.message}`));
    } else {
      // Standalone timer for local development & demonstration
      this.startLocalScheduler(['acme.studio', 'acme-mail.com']);
    }
  }

  async runDomainMonitoringJob(domain: string) {
    const curr = await takeDomainSnapshot(domain);
    const prev = this.lastSnapshots.get(domain) || null;
    const drift = detectSnapshotDrift(prev, curr);

    this.lastSnapshots.set(domain, curr);

    if (drift.hasDrift) {
      logger.warn({ domain, changes: drift.changes }, 'Domain DNS drift detected!');
      // Dispatch alert if webhook configured
      if (process.env.ALERT_WEBHOOK_URL) {
        await deliverWebhookWithRetry(
          process.env.ALERT_WEBHOOK_URL,
          process.env.ALERT_WEBHOOK_SECRET || 'secret',
          {
            eventId: `evt_${Date.now()}`,
            eventType: 'domain.drift_detected',
            timestamp: new Date().toISOString(),
            data: { domain, changes: drift.changes }
          }
        );
      }
    } else {
      logger.info({ domain }, 'Domain DNS snapshot verified; no drift detected.');
    }

    return { domain, snapshot: curr, drift };
  }

  startLocalScheduler(domains: string[]) {
    logger.info(`Local scheduler active for domains: ${domains.join(', ')}`);
    // Run initial pass
    for (const d of domains) {
      this.runDomainMonitoringJob(d).catch(e => logger.error(e));
    }

    // Recurring pass every 60 seconds in dev mode
    this.intervalTimer = setInterval(() => {
      for (const d of domains) {
        this.runDomainMonitoringJob(d).catch(e => logger.error(e));
      }
    }, 60000);
  }

  async stop() {
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    if (this.worker) await this.worker.close();
    if (this.redisClient) await this.redisClient.quit();
    logger.info('Preflight Worker service stopped.');
  }
}

// Start worker if run directly
const worker = new PreflightWorkerService();
await worker.start();

process.on('SIGTERM', async () => {
  await worker.stop();
  process.exit(0);
});
process.on('SIGINT', async () => {
  await worker.stop();
  process.exit(0);
});
