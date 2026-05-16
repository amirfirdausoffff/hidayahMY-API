import { isAdmin } from '../bot.js';

export function registerHelpHandlers(bot) {
  bot.command('start', async (ctx) => {
    const name = ctx.from.first_name || 'there';
    const msg = [
      `🌙 <b>Assalamualaikum, ${name}!</b>`,
      '',
      'Welcome to <b>HidayahMY Bot</b>.',
      '',
      '🕌 <b>Prayer Features:</b>',
      '/prayer — Today\'s prayer times',
      '/checkin — Check in your daily prayers',
      '/streak — View your prayer streak',
      '/subscribe — Get prayer time reminders',
      '/azkar — Daily azkar & dua',
      '',
      '📝 <b>Feedback:</b>',
      '/feedback — Send feedback to our team',
      '',
      '/help — Show all commands',
    ].join('\n');
    return ctx.reply(msg, { parse_mode: 'HTML' });
  });

  bot.command('help', async (ctx) => {
    const lines = [
      '📖 <b>HidayahMY Bot Commands</b>',
      '',
      '🕌 <b>Prayer</b>',
      '/prayer — Today\'s prayer times (JAKIM)',
      '/checkin — Check in your daily prayers',
      '/streak — Your prayer stats & streak',
      '/subscribe — Prayer time reminders',
      '/unsubscribe — Stop reminders',
      '/azkar — Daily azkar & dua',
      '',
      '📝 <b>Feedback</b>',
      '/feedback — Send feedback to our team',
    ];

    if (isAdmin(ctx)) {
      lines.push(
        '', '━━━━━━━━━━━━━━━━━━━━', '',
        '🛡️ <b>Admin Commands</b>', '',
        '📊 <b>Dashboard</b>',
        '/stats — Quick stats overview',
        '/users — Recent customer list',
        '/team — Admin team members', '',
        '🔔 <b>Notifications</b>',
        '/notify — Notification help',
        '/notify_send — Send to topic',
        '  <code>Topic | Title | Message</code>',
        '/notify_user — Send to user',
        '  <code>email | Title | Message</code>',
        '/notify_history — Recent notifications', '',
        '🖼️ <b>Content</b>',
        '/backgrounds — List backgrounds',
        '/azan — List azan sounds',
        '/upload_bg — Upload background',
        '/upload_azan — Upload azan sound',
        '/delete_bg — Delete background',
        '/delete_azan — Delete azan sound', '',
        '📬 <b>Feedback</b>',
        '/feedback_list — View user feedback', '',
        '🏥 <b>Monitoring</b>',
        '/health — Run health check',
        '/storage — Storage details',
      );
    }
    return ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });
}
