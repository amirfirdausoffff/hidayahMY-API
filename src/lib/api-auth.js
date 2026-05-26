const API_KEY = process.env.API_SECRET_KEY;

export function apiAuth(handler) {
  return async (req, res) => {
    // Allow OPTIONS preflight requests through
    if (req.method === 'OPTIONS') {
      return handler(req, res);
    }

    const clientKey = req.headers['x-api-key'];

    if (!API_KEY) {
      // If API_SECRET_KEY is not configured, reject all requests
      return res.status(500).json({ success: false, error: 'Server misconfigured' });
    }

    if (!clientKey || clientKey !== API_KEY) {
      return res.status(401).json({ success: false, error: 'Invalid or missing API key' });
    }

    return handler(req, res);
  };
}
