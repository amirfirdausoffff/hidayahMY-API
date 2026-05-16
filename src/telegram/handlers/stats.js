import { supabaseAdmin } from '../../lib/supabase.js';
import { isAdmin, escapeHtml, formatDate } from '../bot.js';

export function registerStatsHandlers(bot) {
  bot.command('stats', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('⛔ Admin only.');
    try {
      const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
      if (error) return ctx.reply('❌ Failed to fetch stats.');

      const total = users.length;
      const customers = users.filter(u => u.user_metadata?.role === 'customer').length;
      const admins = users.filter(u => u.user_metadata?.role === 'admin').length;
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentSignups = users.filter(u => new Date(u.created_at) > weekAgo).length;
      const { count: notifCount } = await supabaseAdmin.from('notifications').select('*', { count: 'exact', head: true });

      const msg = [
        '📊 <b>HidayahMY Dashboard</b>', '',
        `👥 Total Users: <b>${total}</b>`,
        `🙋 Customers: <b>${customers}</b>`,
        `🛡️ Admins: <b>${admins}</b>`,
        `🆕 New this week: <b>${recentSignups}</b>`,
        `🔔 Notifications Sent: <b>${notifCount || 0}</b>`,
      ].join('\n');
      return ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (err) {
      return ctx.reply('❌ Error fetching stats.');
    }
  });

  bot.command('users', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('⛔ Admin only.');
    try {
      const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
      if (error) return ctx.reply('❌ Failed to fetch users.');

      const customers = users
        .filter(u => u.user_metadata?.role === 'customer')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 15);

      if (!customers.length) return ctx.reply('No customers found.');

      const lines = customers.map((u, i) => {
        const name = escapeHtml(u.user_metadata?.name || 'No name');
        return `${i + 1}. <b>${name}</b>\n   📧 ${escapeHtml(u.email)}\n   📅 ${formatDate(u.created_at)}`;
      });

      const total = users.filter(u => u.user_metadata?.role === 'customer').length;
      return ctx.reply([`👥 <b>Recent Customers</b> (${customers.length} of ${total})`, '', ...lines].join('\n'), { parse_mode: 'HTML' });
    } catch (err) {
      return ctx.reply('❌ Error fetching users.');
    }
  });

  bot.command('team', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('⛔ Admin only.');
    try {
      const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
      if (error) return ctx.reply('❌ Failed to fetch team.');

      const admins = users.filter(u => u.user_metadata?.role === 'admin').sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      if (!admins.length) return ctx.reply('No admins found.');

      const lines = admins.map((u, i) => {
        const name = escapeHtml(u.user_metadata?.name || 'No name');
        return `${i + 1}. <b>${name}</b>\n   📧 ${escapeHtml(u.email)}\n   📅 Joined: ${formatDate(u.created_at)}`;
      });

      return ctx.reply([`🛡️ <b>Admin Team</b> (${admins.length})`, '', ...lines].join('\n'), { parse_mode: 'HTML' });
    } catch (err) {
      return ctx.reply('❌ Error fetching team.');
    }
  });
}
