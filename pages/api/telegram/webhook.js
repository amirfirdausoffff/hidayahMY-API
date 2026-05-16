// Telegram Bot Webhook — receives updates from Telegram
import { getBot } from '../../../src/telegram/bot.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true, message: 'Telegram webhook is active' });
  }

  // Verify webhook secret if set
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const headerSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (headerSecret !== secret) {
      return res.status(403).json({ error: 'Invalid secret' });
    }
  }

  try {
    const bot = getBot();
    await bot.handleUpdate(req.body);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[telegram-webhook]', err.message);
    return res.status(200).json({ ok: true }); // Always return 200 to Telegram
  }
}
