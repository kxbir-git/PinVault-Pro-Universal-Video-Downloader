import { downloadWorker } from './downloadWorker';
import { batchWorker } from './batchWorker';
import { logger } from '../utils/logger';

export async function startWorkers() {
  downloadWorker.run();
  batchWorker.run();
  logger.info('Worker threads started');
}
