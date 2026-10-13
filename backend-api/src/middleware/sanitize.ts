import { Request, Response, NextFunction } from 'express';
import xss from 'xss';

/**
 * Recursively sanitize all string values in an object to prevent XSS.
 */
function sanitize(obj: unknown): unknown {
  if (typeof obj === 'string') return xss(obj);
  if (Array.isArray(obj)) return obj.map(sanitize);
  if (obj && typeof obj === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      clean[key] = sanitize(val);
    }
    return clean;
  }
  return obj;
}

export function sanitizeInput(req: Request, _res: Response, next: NextFunction): void {
  if (req.body) req.body = sanitize(req.body);
  if (req.query) req.query = sanitize(req.query) as any;
  if (req.params) req.params = sanitize(req.params) as any;
  next();
}
