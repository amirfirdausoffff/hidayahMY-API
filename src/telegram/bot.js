import { Telegraf } from 'telegraf';

let bot = null;

export function getBot() {
  if (!bot) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');
    bot = new Telegraf(token);
    registerAllHandlers(bot);
  }
  return bot;
}

// Config helpers
export function getAdminUserIds() {
  return (process.env.ADMIN_USER_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
}

export function isAdmin(ctx) {
  return getAdminUserIds().includes(String(ctx.from?.id));
}

export function getAdminChatId() {
  return process.env.ADMIN_CHAT_ID;
}

export function getChannelId() {
  return process.env.CHANNEL_ID;
}

export function getDefaultZone() {
  return process.env.DEFAULT_PRAYER_ZONE || 'WLY01';
}

// ── Utilities ──────────────────────────────────────────

export function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ── Upload sessions ────────────────────────────────────
const uploadSessions = new Map();
export { uploadSessions };

// ── Feedback thread tracking ───────────────────────────
const feedbackThreads = new Map();
export { feedbackThreads };

// ── Prayer subscribers (in-memory, resets on cold start) ──
const subscribedUsers = new Map();
export { subscribedUsers };

// ── Register all handlers ──────────────────────────────

import { registerHelpHandlers } from './handlers/help.js';
import { registerStatsHandlers } from './handlers/stats.js';
import { registerNotifyHandlers } from './handlers/notify.js';
import { registerContentHandlers } from './handlers/content.js';
import { registerFeedbackHandlers } from './handlers/feedback.js';
import { registerPrayerHandlers } from './handlers/prayer.js';
import { registerMonitorHandlers } from './handlers/monitor.js';

function registerAllHandlers(bot) {
  registerHelpHandlers(bot);
  registerStatsHandlers(bot);
  registerNotifyHandlers(bot);
  registerContentHandlers(bot);
  registerFeedbackHandlers(bot);
  registerPrayerHandlers(bot);
  registerMonitorHandlers(bot);
}
