import crypto from 'crypto';
import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';
import { isValidDate } from '../../../src/lib/validate';

const MAX_CYCLES = 24;
const DEFAULT_SETTINGS = { cycle_length: 28, period_length: 5 };

function normaliseTracker(value) {
  const cycles = Array.isArray(value?.cycles)
    ? value.cycles
        .filter((cycle) => cycle?.id && isValidDate(cycle?.start_date))
        .map((cycle) => ({
          id: String(cycle.id),
          start_date: cycle.start_date,
          end_date: isValidDate(cycle.end_date) ? cycle.end_date : null,
        }))
        .sort((a, b) => b.start_date.localeCompare(a.start_date))
        .slice(0, MAX_CYCLES)
    : [];
  const cycleLength = Number(value?.settings?.cycle_length);
  const periodLength = Number(value?.settings?.period_length);
  return {
    cycles,
    settings: {
      cycle_length:
        Number.isInteger(cycleLength) && cycleLength >= 15 && cycleLength <= 60
          ? cycleLength
          : DEFAULT_SETTINGS.cycle_length,
      period_length:
        Number.isInteger(periodLength) && periodLength >= 1 && periodLength <= 15
          ? periodLength
          : DEFAULT_SETTINGS.period_length,
    },
    updated_at: value?.updated_at || null,
  };
}

function parseDate(value) {
  if (!isValidDate(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

async function handler(req, res) {
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing authorization' });
  }
  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
  if (user.user_metadata?.gender !== 'female') {
    return res.status(403).json({
      success: false,
      error: 'Period tracker is available for female profiles only',
    });
  }

  const tracker = normaliseTracker(user.user_metadata?.period_tracker);
  if (req.method === 'GET') {
    return res.status(200).json({ success: true, ...tracker });
  }

  if (req.method === 'POST') {
    const { start_date } = req.body || {};
    const start = parseDate(start_date);
    if (!start || start_date > todayUtc()) {
      return res.status(400).json({ success: false, error: 'A valid start_date up to today is required' });
    }
    if (tracker.cycles.some((cycle) => cycle.end_date == null)) {
      return res.status(409).json({ success: false, error: 'An active period already exists' });
    }
    if (tracker.cycles.some((cycle) => cycle.start_date === start_date)) {
      return res.status(409).json({ success: false, error: 'A cycle already starts on this date' });
    }
    tracker.cycles.unshift({
      id: crypto.randomUUID(),
      start_date,
      end_date: null,
    });
  }

  if (req.method === 'PUT') {
    const { action, id, end_date, cycle_length, period_length } = req.body || {};
    if (action === 'settings') {
      const cycleLength = Number(cycle_length);
      const periodLength = Number(period_length);
      if (!Number.isInteger(cycleLength) || cycleLength < 15 || cycleLength > 60 ||
          !Number.isInteger(periodLength) || periodLength < 1 || periodLength > 15) {
        return res.status(400).json({ success: false, error: 'Invalid tracker settings' });
      }
      tracker.settings = {
        cycle_length: cycleLength,
        period_length: periodLength,
      };
    } else {
      const cycle = tracker.cycles.find((item) => item.id === id);
      if (!cycle) {
        return res.status(404).json({ success: false, error: 'Cycle not found' });
      }
      const end = parseDate(end_date);
      if (!end || end_date < cycle.start_date || end_date > todayUtc()) {
        return res.status(400).json({ success: false, error: 'Invalid end_date' });
      }
      const start = parseDate(cycle.start_date);
      const duration = Math.floor((end - start) / 86400000) + 1;
      if (duration > 30) {
        return res.status(400).json({ success: false, error: 'Period duration cannot exceed 30 days' });
      }
      cycle.end_date = end_date;
    }
  }

  if (req.method === 'DELETE') {
    const id = String(req.query.id || '');
    const before = tracker.cycles.length;
    tracker.cycles = tracker.cycles.filter((cycle) => cycle.id !== id);
    if (tracker.cycles.length === before) {
      return res.status(404).json({ success: false, error: 'Cycle not found' });
    }
  }

  tracker.cycles = tracker.cycles
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
    .slice(0, MAX_CYCLES);
  tracker.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, period_tracker: tracker },
  });
  if (error) {
    return res.status(400).json({ success: false, error: error.message });
  }

  return res.status(200).json({
    success: true,
    ...normaliseTracker(data.user.user_metadata?.period_tracker),
  });
}

export default cors(handler);
