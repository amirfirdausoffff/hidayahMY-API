import { supabaseAdmin } from '../../lib/supabase.js';
import { isAdmin, escapeHtml, formatDate, formatDuration, uploadSessions } from '../bot.js';

export function registerContentHandlers(bot) {
  bot.command('backgrounds', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('⛔ Admin only.');
    try {
      const { data: bgs } = await supabaseAdmin.from('backgrounds').select('*').order('created_at', { ascending: false });
      if (!bgs?.length) return ctx.reply('🖼️ No backgrounds found.');

      const lines = bgs.map((bg, i) => {
        const cat = bg.category === 'both' ? '📱 All' : bg.category === 'dashboard' ? '🏠 Dashboard' : '🕌 Prayer';
        return `${i + 1}. <b>${escapeHtml(bg.name)}</b> — ${cat}\n   🆔 <code>${bg.id}</code> · 📅 ${formatDate(bg.created_at)}`;
      });
      return ctx.reply([`🖼️ <b>Backgrounds</b> (${bgs.length})`, '', ...lines, '', '📤 Upload: <code>/upload_bg Name | Category</code>', 'Categories: dashboard, prayer, both'].join('\n'), { parse_mode: 'HTML' });
    } catch (err) {
      return ctx.reply('❌ Error fetching backgrounds.');
    }
  });

  bot.command('azan', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('⛔ Admin only.');
    try {
      const { data: sounds } = await supabaseAdmin.from('azan_sounds').select('*').order('created_at', { ascending: false });
      if (!sounds?.length) return ctx.reply('🔊 No azan sounds found.');

      const lines = sounds.map((s, i) => {
        const dur = s.duration_seconds ? formatDuration(s.duration_seconds) : '?:??';
        return `${i + 1}. <b>${escapeHtml(s.name)}</b> — ⏱️ ${dur}\n   🆔 <code>${s.id}</code> · 📅 ${formatDate(s.created_at)}`;
      });
      return ctx.reply([`🔊 <b>Azan Sounds</b> (${sounds.length})`, '', ...lines, '', '📤 Upload: <code>/upload_azan Name</code>'].join('\n'), { parse_mode: 'HTML' });
    } catch (err) {
      return ctx.reply('❌ Error fetching azan sounds.');
    }
  });

  bot.command('upload_bg', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('⛔ Admin only.');
    const text = ctx.message.text.replace('/upload_bg', '').trim();
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 2) return ctx.reply('❌ Format: <code>/upload_bg Name | Category</code>\nCategories: dashboard, prayer, both', { parse_mode: 'HTML' });

    const [name, category] = parts;
    if (!['dashboard', 'prayer', 'both'].includes(category)) return ctx.reply('❌ Invalid category.');

    uploadSessions.set(ctx.from.id, { type: 'background', name, category, expires: Date.now() + 120000 });
    return ctx.reply(`📸 Now send the image for "<b>${escapeHtml(name)}</b>" (${category}).\n⏰ 2 minutes.`, { parse_mode: 'HTML' });
  });

  bot.command('upload_azan', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('⛔ Admin only.');
    const name = ctx.message.text.replace('/upload_azan', '').trim();
    if (!name) return ctx.reply('❌ Format: <code>/upload_azan Name</code>', { parse_mode: 'HTML' });

    uploadSessions.set(ctx.from.id, { type: 'azan', name, expires: Date.now() + 120000 });
    return ctx.reply(`🎵 Now send the audio file for "<b>${escapeHtml(name)}</b>".\n⏰ 2 minutes.`, { parse_mode: 'HTML' });
  });

  bot.command('delete_bg', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('⛔ Admin only.');
    const id = ctx.message.text.replace('/delete_bg', '').trim();
    if (!id) return ctx.reply('❌ Format: <code>/delete_bg ID</code>', { parse_mode: 'HTML' });
    try {
      const { data: bg } = await supabaseAdmin.from('backgrounds').select('*').eq('id', id).single();
      if (!bg) return ctx.reply('❌ Not found.');
      if (bg.storage_path) await supabaseAdmin.storage.from('backgrounds').remove([bg.storage_path]);
      await supabaseAdmin.from('backgrounds').delete().eq('id', id);
      return ctx.reply(`✅ Deleted: <b>${escapeHtml(bg.name)}</b>`, { parse_mode: 'HTML' });
    } catch (err) { return ctx.reply('❌ Failed to delete.'); }
  });

  bot.command('delete_azan', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('⛔ Admin only.');
    const id = ctx.message.text.replace('/delete_azan', '').trim();
    if (!id) return ctx.reply('❌ Format: <code>/delete_azan ID</code>', { parse_mode: 'HTML' });
    try {
      const { data: sound } = await supabaseAdmin.from('azan_sounds').select('*').eq('id', id).single();
      if (!sound) return ctx.reply('❌ Not found.');
      if (sound.storage_path) await supabaseAdmin.storage.from('azan').remove([sound.storage_path]);
      await supabaseAdmin.from('azan_sounds').delete().eq('id', id);
      return ctx.reply(`✅ Deleted: <b>${escapeHtml(sound.name)}</b>`, { parse_mode: 'HTML' });
    } catch (err) { return ctx.reply('❌ Failed to delete.'); }
  });

  // Handle photo uploads
  bot.on('photo', async (ctx) => {
    const session = uploadSessions.get(ctx.from.id);
    if (!session || session.type !== 'background' || Date.now() > session.expires) return;
    uploadSessions.delete(ctx.from.id);

    try {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const file = await ctx.telegram.getFile(photo.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      const response = await fetch(fileUrl);
      const buffer = Buffer.from(await response.arrayBuffer());
      const ext = file.file_path.split('.').pop() || 'jpg';
      const storagePath = `${Date.now()}_${session.name.replace(/\s+/g, '_')}.${ext}`;

      const { error: uploadErr } = await supabaseAdmin.storage.from('backgrounds').upload(storagePath, buffer, { contentType: `image/${ext}` });
      if (uploadErr) return ctx.reply('❌ Upload failed: ' + uploadErr.message);

      const { data: publicUrl } = supabaseAdmin.storage.from('backgrounds').getPublicUrl(storagePath);
      await supabaseAdmin.from('backgrounds').insert({ name: session.name, category: session.category, image_url: publicUrl.publicUrl, storage_path: storagePath });
      return ctx.reply(`✅ Background uploaded!\n🖼️ <b>${escapeHtml(session.name)}</b> (${session.category})`, { parse_mode: 'HTML' });
    } catch (err) { return ctx.reply('❌ Upload failed: ' + err.message); }
  });

  // Handle audio uploads
  bot.on('audio', (ctx) => handleAudioUpload(ctx));
  bot.on('document', (ctx) => handleAudioUpload(ctx));
}

async function handleAudioUpload(ctx) {
  const session = uploadSessions.get(ctx.from.id);
  if (!session || session.type !== 'azan' || Date.now() > session.expires) return;
  uploadSessions.delete(ctx.from.id);

  try {
    const audio = ctx.message.audio || ctx.message.document;
    if (!audio) return ctx.reply('❌ Send an audio file.');
    const file = await ctx.telegram.getFile(audio.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const response = await fetch(fileUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    const ext = file.file_path.split('.').pop() || 'mp3';
    const storagePath = `${Date.now()}_${session.name.replace(/\s+/g, '_')}.${ext}`;
    const contentTypeMap = { mp3: 'audio/mpeg', m4a: 'audio/m4a', aac: 'audio/aac', wav: 'audio/wav' };

    const { error: uploadErr } = await supabaseAdmin.storage.from('azan').upload(storagePath, buffer, { contentType: contentTypeMap[ext] || 'audio/mpeg' });
    if (uploadErr) return ctx.reply('❌ Upload failed: ' + uploadErr.message);

    const { data: publicUrl } = supabaseAdmin.storage.from('azan').getPublicUrl(storagePath);
    await supabaseAdmin.from('azan_sounds').insert({ name: session.name, file_url: publicUrl.publicUrl, storage_path: storagePath, duration_seconds: audio.duration || 0 });
    return ctx.reply(`✅ Azan uploaded!\n🔊 <b>${escapeHtml(session.name)}</b> — ⏱️ ${formatDuration(audio.duration || 0)}`, { parse_mode: 'HTML' });
  } catch (err) { return ctx.reply('❌ Upload failed: ' + err.message); }
}
