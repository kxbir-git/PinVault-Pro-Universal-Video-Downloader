import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { AppError } from '../utils/AppError';
import type { User } from '../types';

/**
 * JWT auth middleware – attaches user to req.user or returns 401.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  passport.authenticate('jwt', { session: false }, (err: Error, user: User) => {
    if (err) return next(err);
    if (!user) return next(new AppError('Authentication required', 401, 'UNAUTHENTICATED'));
    req.user = user;
    next();
  })(req, res, next);
}

/**
 * Optional auth – attaches user if token present, but doesn't block.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  passport.authenticate('jwt', { session: false }, (err: Error, user: User) => {
    if (user) req.user = user;
    next();
  })(req, res, next);
}

/**
 * RBAC middleware – restricts access to specified roles.
 */
export function authorize(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user as User;
    if (!user) return next(new AppError('Authentication required', 401));
    if (!roles.includes(user.role)) {
      return next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));
    }
    next();
  };
}
