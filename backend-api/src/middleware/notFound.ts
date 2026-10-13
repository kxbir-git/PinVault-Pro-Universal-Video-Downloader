import { Request, Response } from 'express';

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: `Route ${_req.method} ${_req.originalUrl} not found`,
  });
}
