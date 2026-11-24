import express, { type Express } from 'express';
import { createApiRouter } from './routes';

function getAllowedOrigins(): string[] {
  const origins = new Set<string>([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]);

  const envUrls = [
    process.env.APP_URL,
    process.env.CUSTOM_DOMAIN_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  ];

  for (const candidate of envUrls) {
    if (!candidate) continue;
    try {
      origins.add(new URL(candidate).origin);
    } catch {
      // Ignore malformed origin entries
    }
  }

  if (process.env.CORS_ALLOWED_ORIGINS) {
    for (const o of process.env.CORS_ALLOWED_ORIGINS.split(',')) {
      const trimmed = o.trim();
      if (trimmed) origins.add(trimmed);
    }
  }
  return Array.from(origins);
}

export function createExpressApp(): Express {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';
  const allowedOrigins = getAllowedOrigins();

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '8mb' }));

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const hostOrigin = req.headers.host ? `${req.protocol || 'https'}://${req.headers.host}` : '';

    if (origin && (allowedOrigins.includes(origin) || (hostOrigin && origin === hostOrigin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    if (isProd) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https:",
        "object-src 'self' blob:",
        "base-uri 'self'",
      ].join('; '),
    );

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use('/api', createApiRouter());
  return app;
}
