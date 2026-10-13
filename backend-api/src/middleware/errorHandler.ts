import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  // Operational errors we throw ourselves
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.code,
      message: err.message,
      requestId: req.requestId,
    });
    return;
  }

  // CORS errors
  if (err.message === 'Not allowed by CORS') {
    res.status(403).json({
      success: false,
      error: 'CORS_ERROR',
      message: 'Origin not allowed',
      requestId: req.requestId,
    });
    return;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      error: 'AUTH_ERROR',
      message: err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token',
      requestId: req.requestId,
    });
    return;
  }

  // Validation errors (express-validator / zod)
  if (err.name === 'ZodError') {
    res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Invalid request data',
      details: (err as any).errors,
      requestId: req.requestId,
    });
    return;
  }

  // Unexpected errors – log and return generic message
  logger.error({ err, requestId: req.requestId, path: req.path }, 'Unhandled error');

  res.status(500).json({
    success: false,
    error: 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    requestId: req.requestId,
  });
}
