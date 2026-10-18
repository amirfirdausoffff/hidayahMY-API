import { supabase, listAllUsers } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

const MALAYSIA_OFFSET_MS = 8 * 60 * 60 * 1000;

function malaysiaDate(value = new Date()) {
  return new Date(new Date(value).getTime() + MALAYSIA_OFFSET_MS);
}

function dateKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function startOfMalaysiaDay(value = new Date()) {
  const date = malaysiaDate(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatDay(date) {
  return new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
}

function formatMonth(date) {
  return new Intl.DateTimeFormat('en-MY', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function registrationSeries(customers, period) {
  const today = startOfMalaysiaDay();
  const periods = [];

  if (period === 'month') {
    for (let offset = 11; offset >= 0; offset--) {
      const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - offset, 1));
      periods.push({ key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`, label: formatMonth(date) });
    }
  } else if (period === 'day') {
    for (let offset = 13; offset >= 0; offset--) {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() - offset);
      periods.push({ key: dateKey(date), label: formatDay(date) });
    }
  } else {
    const monday = new Date(today);
    const dayOfWeek = (monday.getUTCDay() + 6) % 7;
    monday.setUTCDate(monday.getUTCDate() - dayOfWeek);

    for (let offset = 11; offset >= 0; offset--) {
      const start = new Date(monday);
      start.setUTCDate(start.getUTCDate() - (offset * 7));
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
      periods.push({ key: dateKey(start), label: `${formatDay(start)}–${formatDay(end)}` });
    }
  }

  const counts = new Map(periods.map(({ key }) => [key, 0]));

  customers.forEach((customer) => {
    const created = malaysiaDate(customer.created_at);
    let key;

    if (period === 'month') {
      key = `${created.getUTCFullYear()}-${String(created.getUTCMonth() + 1).padStart(2, '0')}`;
    } else if (period === 'day') {
      key = dateKey(created);
    } else {
      const weekStart = new Date(Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate()));
      weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
      key = dateKey(weekStart);
    }

    if (counts.has(key)) counts.set(key, counts.get(key) + 1);
  });

  return periods.map(({ key, label }) => ({ key, label, count: counts.get(key) }));
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ success: false, error: 'Missing authorization token' });
  }

  const { data: { user: requestingUser }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !requestingUser) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  if (requestingUser.user_metadata?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const { users, error } = await listAllUsers();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  const totalUsers = users.length;
  const customers = users.filter((u) => u.user_metadata?.role === 'customer');
  const totalCustomers = customers.length;
  const totalAdmins = users.filter((u) => u.user_metadata?.role === 'admin').length;
  const requestedPeriod = Array.isArray(req.query.period) ? req.query.period[0] : req.query.period;
  const period = ['day', 'week', 'month'].includes(requestedPeriod) ? requestedPeriod : 'week';

  return res.status(200).json({
    success: true,
    totalCustomers,
    totalAdmins,
    totalUsers,
    registrationPeriod: period,
    registrationSeries: registrationSeries(customers, period),
  });
}

export default cors(handler);
