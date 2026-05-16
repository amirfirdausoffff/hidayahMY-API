import { supabaseAdmin } from '../../lib/supabase.js';
import { isAdmin, escapeHtml, getAdminChatId, feedbackThreads } from '../bot.js';

export function registerFeedbackHandlers(bot) {
  bot.command('feedback', async (ctx) => {
    if (isAdmin(ctx)) {
      return ctx.reply('📬 <b>Feedback Management</b>\n\nReply to forwarded messages in admin group to respond.\n<code>/feedback_list</code> — View recent feedback', { parse_mode: 'HTML' });
    }
    return ctx.reply('📝 <b>Send Feedback</b>\n\nJust type your message and send it! Our team will get back to you.\n\nYou can send text, screenshots, or voice messages.', { parse_mode: 'HTML' });
  });

  bot.command('feedback_list', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('⛔ Admin only.');
    try {
      const { data: feedbacks } = await supabaseAdmin.from('telegram_feedback').select('*').order('created_at', { ascending: false }).limit(10);
      if (!feedbacks?.length) return ctx.reply('📭 No feedback yet.');

      const lines = feedbacks.map((f, i) => {
        const status = f.replied ? '✅' : '⏳';
        const date = new Date(f.created_at).toLocaleString('en-MY');
        return `${status} ${i + 1}. <b>${escapeHtml(f.user_name || 'Anonymous')}</b>\n   ${escapeHtml(f.message?.slice(0, 80) || '(media)')}\n   📅 ${date}`;
      });
      return ctx.reply(['📬 <b>Recent Feedback</b>', '', ...lines].join('\n'), { parse_mode: 'HTML' });
    } catch (err) {
      return ctx.reply('❌ Error fetching feedback.');
    }
  });

  // Catch all non-command text messages
  bot.on('text', async (ctx) => {
    if (ctx.message.text?.startsWith('/')) return;

    // Admin replying to a forwarded feedback
    if (isAdmin(ctx) && ctx.message.reply_to_message) {
      const replyToId = ctx.message.reply_to_message.message_id;
      const targetUserId = feedbackThreads.get(replyToId);
      if (targetUserId) {
        try {
          await bot.telegram.sendMessage(targetUserId, `📩 <b>Reply from HidayahMY Team:</b>\n\n${escapeHtml(ctx.message.text)}`, { parse_mode: 'HTML' });
          try {
            await supabaseAdmin.from('telegram_feedback').update({ replied: true }).eq('telegram_user_id', String(targetUserId)).order('created_at', { ascending: false }).limit(1);
          } catch (e) {}
          return ctx.reply('✅ Reply sent to user.');
        } catch (err) {
          return ctx.reply('❌ Failed to reply. User may have blocked the bot.');
        }
      }
    }

    // Non-admin in private chat = feedback
    if (!isAdmin(ctx) && ctx.chat.type === 'private') {
      const userId = ctx.from.id;
      const userName = ctx.from.first_name + (ctx.from.last_name ? ' ' + ctx.from.last_name : '');
      const username = ctx.from.username ? `@${ctx.from.username}` : 'No username';

      try {
        await supabaseAdmin.from('telegram_feedback').insert({
          telegram_user_id: String(userId), user_name: userName, username, message: ctx.message.text, replied: false,
        });
      } catch (e) {}

      const adminChatId = getAdminChatId();
      if (adminChatId) {
        const header = [`📬 <b>New Feedback</b>`, '', `👤 <b>${escapeHtml(userName)}</b> (${escapeHtml(username)})`, `🆔 <code>${userId}</code>`, '', `💬 ${escapeHtml(ctx.message.text)}`, '', `<i>Reply to this message to respond.</i>`].join('\n');
        try {
          const sent = await bot.telegram.sendMessage(adminChatId, header, { parse_mode: 'HTML' });
          feedbackThreads.set(sent.message_id, userId);
        } catch (e) {}
      }
      return ctx.reply('✅ Thank you for your feedback! Our team has been notified.');
    }
  });

  // Forward voice messages as feedback
  bot.on('voice', async (ctx) => {
    if (isAdmin(ctx) || ctx.chat.type !== 'private') return;
    const adminChatId = getAdminChatId();
    if (adminChatId) {
      const userName = ctx.from.first_name;
      try {
        await bot.telegram.sendVoice(adminChatId, ctx.message.voice.file_id, { caption: `🎤 Feedback from ${escapeHtml(userName)} (${ctx.from.id})`, parse_mode: 'HTML' });
      } catch (e) {}
    }
    return ctx.reply('✅ Voice feedback received! Thank you.');
  });
}
