import { supabase } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

const dateParts = (value) => {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
};

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || data.user?.app_metadata?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  const { ADMOB_CLIENT_ID, ADMOB_CLIENT_SECRET, ADMOB_REFRESH_TOKEN, ADMOB_ACCOUNT_ID } = process.env;
  if (!ADMOB_CLIENT_ID || !ADMOB_CLIENT_SECRET || !ADMOB_REFRESH_TOKEN || !ADMOB_ACCOUNT_ID) {
    return res.status(503).json({ error: 'AdMob reporting is not connected yet' });
  }
  const today = new Date();
  const fallbackEnd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(today);
  const start = String(req.query.start || `${fallbackEnd.slice(0, 7)}-01`);
  const end = String(req.query.end || fallbackEnd);
  const valid = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
  if (!valid(start) || !valid(end) || start > end || end > fallbackEnd || Date.parse(end) - Date.parse(start) > 1826 * 86400000) {
    return res.status(400).json({ error: 'Choose a valid date range' });
  }
  try {
    const auth = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: ADMOB_CLIENT_ID, client_secret: ADMOB_CLIENT_SECRET, refresh_token: ADMOB_REFRESH_TOKEN, grant_type: 'refresh_token' }),
    });
    const credentials = await auth.json();
    if (!auth.ok || !credentials.access_token) throw new Error('AdMob authorization failed');
    const report = await fetch(`https://admob.googleapis.com/v1/accounts/${encodeURIComponent(ADMOB_ACCOUNT_ID)}/networkReport:generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${credentials.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportSpec: { dateRange: { startDate: dateParts(start), endDate: dateParts(end) }, dimensions: ['DATE', 'PLATFORM'], metrics: ['ESTIMATED_EARNINGS'] } }),
    });
    if (!report.ok) throw new Error('AdMob report unavailable');
    const text = await report.text();
    // Google's transcoded streaming response is normally one JSON array.
    const parsed = JSON.parse(text);
    const chunks = Array.isArray(parsed) ? parsed : [parsed];
    const rows = chunks.flatMap((chunk) => chunk.row ? [chunk.row] : chunk.rows || []);
    const currency = chunks.find((chunk) => chunk.header)?.header?.localizationSettings?.currencyCode || 'USD';
    const daily = new Map();
    const totals = { ANDROID: 0, IOS: 0, OTHER: 0 };
    for (const row of rows) {
      const day = row.dimensionValues?.DATE?.value;
      const date = day?.length === 8 ? `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}` : day;
      const platform = row.dimensionValues?.PLATFORM?.value?.toUpperCase();
      const amount = Number(row.metricValues?.ESTIMATED_EARNINGS?.microsValue || 0);
      const key = platform === 'ANDROID' || platform === 'IOS' ? platform : 'OTHER';
      totals[key] += amount;
      if (date) daily.set(date, (daily.get(date) || 0) + amount);
    }
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).json({ currency, start, end, totalMicros: Object.values(totals).reduce((a, b) => a + b, 0), platformMicros: totals, daily: [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([date, micros]) => ({ date, micros })) });
  } catch {
    return res.status(502).json({ error: 'Unable to load AdMob revenue' });
  }
}

export default cors(handler);
