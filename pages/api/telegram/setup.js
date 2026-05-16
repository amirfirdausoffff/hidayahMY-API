// One-time setup: registers the webhook URL with Telegram
// Call this once after deploying: GET /api/telegram/setup
import { getBot } from '../../../src/telegram/bot.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not set' });
  }

  // Build webhook URL from the deployment
  const host = req.headers.host;
  const protocol = host?.includes('localhost') ? 'http' : 'https';
  const webhookUrl = `${protocol}://${host}/api/telegram/webhook`;

  try {
    const bot = getBot();

    // Set webhook
    const options = { drop_pending_updates: false };
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret) {
      options.secret_token = secret;
    }

    await bot.telegram.setWebhook(webhookUrl, options);

    // Set bot commands menu
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Start the bot' },
      { command: 'help', description: 'Show all commands' },
      { command: 'prayer', description: 'Today prayer times' },
      { command: 'checkin', description: 'Prayer check-in' },
      { command: 'streak', description: 'Prayer streak stats' },
      { command: 'subscribe', description: 'Prayer reminders' },
      { command: 'azkar', description: 'Daily azkar' },
      { command: 'feedback', description: 'Send feedback' },
      { command: 'stats', description: 'Dashboard stats (admin)' },
      { command: 'users', description: 'Recent users (admin)' },
      { command: 'team', description: 'Team members (admin)' },
      { command: 'notify', description: 'Send notification (admin)' },
      { command: 'health', description: 'Health check (admin)' },
      { command: 'backgrounds', description: 'List backgrounds (admin)' },
      { command: 'azan', description: 'List azan sounds (admin)' },
    ]);

    // Verify
    const info = await bot.telegram.getWebhookInfo();

    return res.status(200).json({
      success: true,
      message: 'Webhook registered!',
      webhook_url: webhookUrl,
      webhook_info: info,
    });
  } catch (err) {
    console.error('[telegram-setup]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
