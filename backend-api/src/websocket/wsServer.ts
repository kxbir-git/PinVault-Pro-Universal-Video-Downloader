import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../utils/logger';

let wss: WebSocketServer | null = null;

export function initWebSocket(server: HttpServer) {
  wss = new WebSocketServer({ server, path: '/ws' });
  
  wss.on('connection', (ws: WebSocket) => {
    logger.info('New WebSocket connection');
    ws.on('message', (msg: any) => {
      logger.info(`WS received: ${msg}`);
    });
    ws.on('close', () => {
      logger.info('WebSocket disconnected');
    });
  });
}

export function wsEmit(event: string, data: any) {
  if (!wss) return;
  const payload = JSON.stringify({ event, data });
  wss.clients.forEach((client: any) => {
    if (client.readyState === 1) { // WebSocket.OPEN is 1
      client.send(payload);
    }
  });
}
