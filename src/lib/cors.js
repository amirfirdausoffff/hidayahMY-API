import { checkRateLimit, getClientIp } from './rate-limit';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://hidayahmy.com,https://www.hidayahmy.com,https://admin.hidayahmy.com,https://api.hidayahmy.com').split(',').map(s => s.trim());

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow Vercel preview/production URLs for admin and API
  if (origin.match(/^https:\/\/hidayahmy-(admin|api)-[a-z0-9]+-amir-projects-projects\.vercel\.app$/)) return true;
  return false;
}
export function cors(handler) {
  return async (req, res) => {
    const origin = req.headers.origin;

    // Allow requests with no origin (mobile apps, server-to-server)
    // For browser requests, only allow specific origins
    if (origin && isAllowedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else if (!origin) {
      // No origin = mobile app or server call — allow
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    // If origin is set but not in whitelist — no CORS header = browser blocks it

    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // Only admin endpoints receive this additional global throttle. Mobile
    // user APIs keep their existing behavior and endpoint-specific limits.
    if (req.url?.startsWith('/api/admin/')) {
      const ip = getClientIp(req);
      const isRead = req.method === 'GET';
      const limit = isRead ? 240 : 60;
      const rate = checkRateLimit(
        `admin-global:${ip}:${isRead ? 'read' : 'write'}`,
        limit,
        60 * 1000,
      );
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
      if (!rate.allowed) {
        res.setHeader('Retry-After', '60');
        return res.status(429).json({
          success: false,
          error: 'Too many requests. Try again shortly.',
        });
      }
    }

    return handler(req, res);
  };
}
