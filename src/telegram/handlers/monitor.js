import { supabaseAdmin } from '../../lib/supabase.js';
import { isAdmin } from '../bot.js';

export function registerMonitorHandlers(bot) {
  bot.command('health', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('⛔ Admin only.');
    await ctx.reply('🔍 Running health check...');

    const results = [];
    const apiBase = process.env.API_BASE_URL || 'https://api.hidayahmy.com';

    // Check API
    try {
      const start = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`${apiBase}/api/auth/me`, { signal: controller.signal, headers: { 'Authorization': 'Bearer test' } });
      clearTimeout(timeout);
      results.push(`🌐 API: ${response.status === 401 ? '✅ Online' : '⚠️ Status ' + response.status} (${Date.now() - start}ms)`);
    } catch (err) {
      results.push(`🌐 API: ❌ ${err.message}`);
    }

    // Check Supabase
    try {
      const start = Date.now();
      const { error } = await supabaseAdmin.from('notifications').select('id', { count: 'exact', head: true });
      results.push(`🗄️ Supabase: ${error ? '❌ ' + error.message : '✅ Online'} (${Date.now() - start}ms)`);
    } catch (err) {
      results.push(`🗄️ Supabase: ❌ ${err.message}`);
    }

    // Storage
    try {
      const { data: bgFiles } = await supabaseAdmin.storage.from('backgrounds').list('', { limit: 1000 });
      const { data: azanFiles } = await supabaseAdmin.storage.from('azan').list('', { limit: 1000 });
      const { data: avatarFiles } = await supabaseAdmin.storage.from('avatars').list('', { limit: 1000 });
      results.push('', '📦 <b>Storage:</b>');
      results.push(`   🖼️ Backgrounds: ${bgFiles?.length || 0} files`);
      results.push(`   🔊 Azan: ${azanFiles?.length || 0} files`);
      results.push(`   👤 Avatars: ${avatarFiles?.length || 0} files`);
    } catch (err) {
      results.push(`📦 Storage: ❌ ${err.message}`);
    }

    // Users
    try {
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
      results.push('', `👥 Users: ${users?.length || 0}`);
    } catch (err) {}

    return ctx.reply(['🏥 <b>Health Check</b>', '', ...results, '', `⏰ ${new Date().toLocaleString('en-MY')}`].join('\n'), { parse_mode: 'HTML' });
  });

  bot.command('storage', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('⛔ Admin only.');
    try {
      const { data: bgFiles } = await supabaseAdmin.storage.from('backgrounds').list('', { limit: 1000 });
      const { data: azanFiles } = await supabaseAdmin.storage.from('azan').list('', { limit: 1000 });
      const { data: avatarFiles } = await supabaseAdmin.storage.from('avatars').list('', { limit: 1000 });
      return ctx.reply([
        '📦 <b>Storage Details</b>', '',
        `🖼️ Backgrounds: <b>${bgFiles?.length || 0}</b> files`,
        `🔊 Azan Sounds: <b>${azanFiles?.length || 0}</b> files`,
        `👤 Avatars: <b>${avatarFiles?.length || 0}</b> files`, '',
        `⏰ ${new Date().toLocaleString('en-MY')}`,
      ].join('\n'), { parse_mode: 'HTML' });
    } catch (err) {
      return ctx.reply('❌ Error checking storage.');
    }
  });
}
