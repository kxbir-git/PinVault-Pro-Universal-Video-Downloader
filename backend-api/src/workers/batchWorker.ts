import { Queue, Worker } from 'bullmq';
import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';

const connection = getRedis();

export const batchQueue = new Queue('batch', { connection });

export const batchWorker = new Worker('batch', async (job) => {
  logger.info(`Processing batch job ${job.id}`);
  return { status: 'completed' };
}, { connection, autorun: false });
