import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import passport from 'passport';

// Routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import downloadRoutes from './routes/downloads';
import subscriptionRoutes from './routes/subscriptions';
import apiKeyRoutes from './routes/apiKeys';
import adminRoutes from './routes/admin';
import webhookRoutes from './routes/webhooks';

// Middleware
import { rateLimiter, strictRateLimiter } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { requestId } from './middleware/requestId';
import { sanitizeInput } from './middleware/sanitize';
import { securityHeaders } from './middleware/securityHeaders';
import { apiKeyAuth } from './middleware/apiKeyAuth';

// Config
import { setupPassport } from './config/passport';
import { swaggerSpec } from './config/swagger';
import swaggerUi from 'swagger-ui-express';
import { logger } from './utils/logger';

const app: Application = express();

// ── Security Headers ──────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://js.stripe.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.stripe.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      frameSrc: ['https://js.stripe.com', 'https://hooks.stripe.com'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use(securityHeaders);

// ── CORS ─────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
}));

// ── Body Parsing ──────────────────────────────────────
// Stripe webhook needs raw body – mount BEFORE json middleware
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());
app.use(compression());

// ── Logging ───────────────────────────────────────────
app.use(pinoHttp({ logger }));

// ── Request ID ────────────────────────────────────────
app.use(requestId);

// ── Input Sanitization ────────────────────────────────
app.use(sanitizeInput);

// ── Passport ─────────────────────────────────────────
setupPassport();
app.use(passport.initialize());

// ── Global Rate Limit ─────────────────────────────────
app.use('/api/', rateLimiter);

// ── Health Check ──────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV,
  });
});

// ── API Docs ──────────────────────────────────────────
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'PinVault Pro API',
}));

// ── Routes ────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/downloads', downloadRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/api-keys', apiKeyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/webhooks', webhookRoutes);

// ── 404 Handler ───────────────────────────────────────
app.use(notFound);

// ── Error Handler ─────────────────────────────────────
app.use(errorHandler);

export default app;
