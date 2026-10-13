import { Queue, Worker } from 'bullmq';
import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';

// Need IORedis instance
const connection = getRedis();

export const downloadQueue = new Queue('download', { connection });

export const downloadWorker = new Worker('download', async (job) => {
  logger.info(`Processing download job ${job.id}`);
  // In a full implementation, this communicates with the Python service
  return { status: 'completed' };
}, { connection, autorun: false });
