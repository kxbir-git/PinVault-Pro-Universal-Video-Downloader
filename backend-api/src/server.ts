import 'dotenv/config';
import app from './app';
import { createServer } from 'http';
import { initWebSocket } from './websocket/wsServer';
import { logger } from './utils/logger';
import { connectDatabase } from './db/connection';
import { connectRedis } from './config/redis';
import { startWorkers } from './workers';

const PORT = parseInt(process.env.PORT || '4000', 10);

async function bootstrap() {
  try {
    // Connect database
    await connectDatabase();
    logger.info('✅ PostgreSQL connected');

    // Connect Redis
    await connectRedis();
    logger.info('✅ Redis connected');

    // Create HTTP server
    const httpServer = createServer(app);

    // Initialize WebSocket server
    initWebSocket(httpServer);
    logger.info('✅ WebSocket server initialized');

    // Start BullMQ workers
    await startWorkers();
    logger.info('✅ BullMQ workers started');

    // Start listening
    httpServer.listen(PORT, () => {
      logger.info(`🚀 PinVault Pro API running on port ${PORT}`);
      logger.info(`📚 API Docs: http://localhost:${PORT}/api/docs`);
      logger.info(`🏥 Health: http://localhost:${PORT}/health`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received – shutting down gracefully');
      httpServer.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received – shutting down gracefully');
      process.exit(0);
    });

  } catch (error) {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  }
}

bootstrap();
