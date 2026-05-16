import { supabaseAdmin } from '../../lib/supabase.js';
import { messaging } from '../../lib/firebase-admin.js';
import { isAdmin, escapeHtml, getChannelId } from '../bot.js';

export function registerNotifyHandlers(bot) {
  bot.command('notify', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('⛔ Admin only.');
    const msg = [
      '🔔 <b>Send Push Notification</b>', '',
      '1️⃣ <b>Send to topic:</b>',
      '<code>/notify_send Topic | Title | Message</code>',
      'Topics: general, announcement, app_update, promotion', '',
      '2️⃣ <b>Send to user:</b>',
      '<code>/notify_user email | Title | Message</code>', '',
      '3️⃣ <code>/notify_history</code> — View history',
    ].join('\n');
    return ctx.reply(msg, { parse_mode: 'HTML' });
  });

  bot.command('notify_send', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('⛔ Admin only.');
    const text = ctx.message.text.replace('/notify_send', '').trim();
    const parts = text.split('|').map(p => p.trim());

    if (parts.length < 3) {
      return ctx.reply('❌ Format: <code>/notify_send Topic | Title | Message</code>\n\nExample:\n<code>/notify_send general | New Feature! | Check out Qiblah compass v2</code>', { parse_mode: 'HTML' });
    }

    const [topic, title, body] = parts;
    const validTopics = ['general', 'announcement', 'app_update', 'promotion'];
    if (!validTopics.includes(topic)) return ctx.reply(`❌ Invalid topic. Choose: ${validTopics.join(', ')}`);

    try {
      await messaging.send({
        notification: { title, body },
        data: { type: 'announcement', topic },
        topic,
        android: { priority: 'high', notification: { channelId: 'announcements', sound: 'default' } },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      });

      await supabaseAdmin.from('notifications').insert({ title, body, topic, sent_by: null, data: { type: 'announcement', topic, source: 'telegram' } });

      const channelId = getChannelId();
      if (channelId) {
        try {
          await bot.telegram.sendMessage(channelId, `🔔 <b>${escapeHtml(title)}</b>\n\n${escapeHtml(body)}\n\n📌 #${topic}`, { parse_mode: 'HTML' });
        } catch (e) {}
      }

      return ctx.reply(`✅ Sent!\n\n📋 Topic: <b>${escapeHtml(topic)}</b>\n📝 Title: <b>${escapeHtml(title)}</b>\n💬 ${escapeHtml(body)}`, { parse_mode: 'HTML' });
    } catch (err) {
      return ctx.reply('❌ Failed: ' + err.message);
    }
  });

  bot.command('notify_user', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('⛔ Admin only.');
    const text = ctx.message.text.replace('/notify_user', '').trim();
    const parts = text.split('|').map(p => p.trim());

    if (parts.length < 3) return ctx.reply('❌ Format: <code>/notify_user email | Title | Message</code>', { parse_mode: 'HTML' });

    const [email, title, body] = parts;

    try {
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
      const user = users.find(u => u.email === email);
      if (!user) return ctx.reply(`❌ User not found: ${escapeHtml(email)}`);

      const { data: tokens } = await supabaseAdmin.from('fcm_tokens').select('fcm_token').eq('user_id', user.id);
      if (!tokens?.length) return ctx.reply('❌ No devices found for this user.');

      const fcmTokens = tokens.map(t => t.fcm_token);
      const response = await messaging.sendEachForMulticast({
        notification: { title, body },
        data: { type: 'announcement', topic: 'general' },
        tokens: fcmTokens,
        android: { priority: 'high', notification: { channelId: 'announcements', sound: 'default' } },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      });

      const invalidTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success && (resp.error?.code === 'messaging/invalid-registration-token' || resp.error?.code === 'messaging/registration-token-not-registered')) {
          invalidTokens.push(fcmTokens[idx]);
        }
      });
      if (invalidTokens.length) await supabaseAdmin.from('fcm_tokens').delete().in('fcm_token', invalidTokens);

      await supabaseAdmin.from('notifications').insert({ title, body, topic: 'general', sent_by: null, target_user_id: user.id, data: { source: 'telegram', target: 'user' } });

      return ctx.reply(`✅ Sent to <b>${escapeHtml(user.user_metadata?.name || email)}</b>\n📱 ${response.successCount} success, ${response.failureCount} failed`, { parse_mode: 'HTML' });
    } catch (err) {
      return ctx.reply('❌ Failed: ' + err.message);
    }
  });

  bot.command('notify_history', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('⛔ Admin only.');
    try {
      const { data: notifs } = await supabaseAdmin.from('notifications').select('*').order('created_at', { ascending: false }).limit(10);
      if (!notifs?.length) return ctx.reply('📭 No notifications found.');

      const lines = notifs.map((n, i) => {
        const date = new Date(n.created_at).toLocaleString('en-MY');
        const src = n.data?.source === 'telegram' ? '🤖' : '🌐';
        return `${src} ${i + 1}. <b>${escapeHtml(n.title)}</b>\n   ${escapeHtml(n.body?.slice(0, 60) || '')}\n   📌 ${n.topic} · ${date}`;
      });
      return ctx.reply(['🔔 <b>Recent Notifications</b>', '', ...lines].join('\n'), { parse_mode: 'HTML' });
    } catch (err) {
      return ctx.reply('❌ Error fetching history.');
    }
  });
}
