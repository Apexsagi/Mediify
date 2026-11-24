import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { resolveCanonicalBaseUrl, validateServerConfiguration } from './config';
import { createApiRouter } from './routes';

const PUBLIC_SITEMAP_ROUTES = [
  { path: '/', priority: '1.0' },
  { path: '/products/code', priority: '0.9' },
  { path: '/products/assist', priority: '0.9' },
  { path: '/products/verify', priority: '0.9' },
  { path: '/products/shield', priority: '0.9' },
  { path: '/products/clinical', priority: '0.8' },
  { path: '/products/eligibility', priority: '0.8' },
  { path: '/products/audit', priority: '0.8' },
  { path: '/products/connect', priority: '0.8' },
  { path: '/products/insights', priority: '0.8' },
  { path: '/solutions/hospitals', priority: '0.8' },
  { path: '/solutions/physician-groups', priority: '0.8' },
  { path: '/solutions/ambulatory-surgery-centers', priority: '0.8' },
  { path: '/solutions/rcm-companies', priority: '0.8' },
  { path: '/solutions/independent-coders', priority: '0.8' },
  { path: '/integrations-hub', priority: '0.8' },
  { path: '/security-governance', priority: '0.8' },
  { path: '/request-demo', priority: '0.9' },
  { path: '/contact', priority: '0.7' },
  { path: '/login', priority: '0.6' },
  { path: '/register', priority: '0.7' },
];

function getAllowedOrigins(): string[] {
  const origins = new Set<string>([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]);

  const envUrls = [
    process.env.APP_URL,
    process.env.CUSTOM_DOMAIN_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined,
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

let startupWarningsLogged = false;

export function createExpressApp(): Express {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';
  const allowedOrigins = getAllowedOrigins();

  if (!startupWarningsLogged && process.env.NODE_ENV !== 'test') {
    startupWarningsLogged = true;
    const report = validateServerConfiguration();
    if (report.warnings.length > 0) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'mediify_startup_config_check',
          warnings: report.warnings,
          canonicalBaseUrl: report.canonicalBaseUrl,
        }),
      );
    }
  }

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8mb' }));

  app.use((req, res, next) => {
    const startedAt = Date.now();
    const origin = req.headers.origin;
    const hostHeader = req.get('x-forwarded-host') || req.get('host') || '';
    const protoHeader = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
    const hostOrigin = hostHeader && /^[a-zA-Z0-9.:-]+$/.test(hostHeader) ? `${protoHeader}://${hostHeader}` : '';

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

    res.on('finish', () => {
      if (!req.path.startsWith('/api')) return;
      if (process.env.NODE_ENV === 'test') return;
      console.log(
        JSON.stringify({
          level: res.statusCode >= 500 ? 'error' : 'info',
          event: 'http_api_request',
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
        }),
      );
    });

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  const renderSitemapXml = (req: Request, res: Response) => {
    const baseUrl = resolveCanonicalBaseUrl(req);
    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...PUBLIC_SITEMAP_ROUTES.map(
        (route) =>
          `  <url><loc>${baseUrl}${route.path === '/' ? '/' : route.path}</loc><priority>${route.priority}</priority></url>`,
      ),
      '</urlset>',
      '',
    ].join('\n');
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(body);
  };

  const renderRobotsTxt = (req: Request, res: Response) => {
    const baseUrl = resolveCanonicalBaseUrl(req);
    const body = [
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      'Disallow: /coding-workspace',
      'Disallow: /dashboard',
      '',
      `Sitemap: ${baseUrl}/sitemap.xml`,
      '',
    ].join('\n');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(body);
  };

  app.get(['/sitemap.xml', '/api/sitemap.xml'], renderSitemapXml);
  app.get(['/robots.txt', '/api/robots.txt'], renderRobotsTxt);

  app.use('/api', createApiRouter());

  // Catch malformed JSON payloads & unhandled top-level errors without exposing stack traces
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError && 'status' in err && (err as { status: unknown }).status === 400) {
      res.status(400).json({ error: 'Malformed JSON request body.' });
      return;
    }
    res.status(500).json({ error: 'Unexpected server error.' });
  });

  return app;
}
