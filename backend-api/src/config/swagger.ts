import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'PinVault Pro API',
      version: '1.0.0',
      description: 'Production-ready Pinterest video downloader API with authentication, subscriptions, and AI enhancement.',
      contact: {
        name: 'PinVault Pro Support',
        email: 'support@pinvaultpro.com',
        url: 'https://pinvaultpro.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      { url: 'http://localhost:4000', description: 'Development' },
      { url: 'https://api.pinvaultpro.com', description: 'Production' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT access token (15 min expiry)',
        },
        CookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'access_token',
          description: 'HTTP-only cookie auth (browser clients)',
        },
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'Developer API key',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' },
            message: { type: 'string' },
            requestId: { type: 'string' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            displayName: { type: 'string' },
            avatarUrl: { type: 'string' },
            role: { type: 'string', enum: ['user', 'admin', 'moderator'] },
            tier: { type: 'string', enum: ['free', 'premium', 'enterprise'] },
            mfaEnabled: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        DownloadJob: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            pinterestUrl: { type: 'string' },
            title: { type: 'string' },
            thumbnailUrl: { type: 'string' },
            format: { type: 'string', enum: ['mp4', 'webm', 'mp3'] },
            status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] },
            progress: { type: 'integer', minimum: 0, maximum: 100 },
            fileUrl: { type: 'string' },
            fileSizeBytes: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }, { CookieAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentication & authorization' },
      { name: 'Downloads', description: 'Video download operations' },
      { name: 'Users', description: 'User profile management' },
      { name: 'Subscriptions', description: 'Stripe subscription management' },
      { name: 'API Keys', description: 'Developer API key management' },
      { name: 'Admin', description: 'Admin operations (requires admin role)' },
    ],
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
