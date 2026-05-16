import { supabaseAdmin } from '../../lib/supabase.js';
import { escapeHtml, getDefaultZone, subscribedUsers } from '../bot.js';

const PRAYER_NAMES = ['Subuh', 'Zohor', 'Asar', 'Maghrib', 'Isyak'];
const PRAYER_KEYS = ['subuh', 'zohor', 'asar', 'maghrib', 'isyak'];

const DAILY_AZKAR = [
  { title: 'Morning Azkar', text: 'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ\n\nIn the name of Allah, with whose name nothing can harm on earth or in heaven. (3x)' },
  { title: 'Evening Azkar', text: 'أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ وَالْحَمْدُ لِلَّهِ\n\nWe have entered the evening and the dominion belongs to Allah.' },
  { title: 'Before Sleep', text: 'اللَّهُمَّ بِاسْمِكَ أَمُوتُ وَأَحْيَا\n\nO Allah, in Your name I die and I live.' },
  { title: 'After Waking Up', text: 'الْحَمْدُ لِلَّهِ الَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا وَإِلَيْهِ النُّشُورُ\n\nAll praise is for Allah who gave us life after having taken it from us.' },
  { title: 'Entering Masjid', text: 'اللَّهُمَّ افْتَحْ لِي أَبْوَابَ رَحْمَتِكَ\n\nO Allah, open for me the doors of Your mercy.' },
  { title: 'Istighfar', text: 'أَسْتَغْفِرُ اللَّهَ الْعَظِيمَ الَّذِي لَا إِلَهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ وَأَتُوبُ إِلَيْهِ\n\nI seek forgiveness from Allah the Almighty.' },
  { title: 'Leaving Masjid', text: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ مِنْ فَضْلِكَ\n\nO Allah, I ask You from Your bounty.' },
];

async function fetchPrayerTimes(zone) {
  try {
    const url = `https://www.e-solat.gov.my/index.php?r=esolatApi/takwimsolat&period=today&zone=${zone}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.ppimsData?.length > 0) {
      const t = data.ppimsData[0];
      return {
        subuh: t.fajr || t.subuh || '-',
        syuruk: t.syuruk || '-',
        zohor: t.dhuhr || t.zohor || '-',
        asar: t.asr || t.asar || '-',
        maghrib: t.maghrib || '-',
        isyak: t.isha || t.isyak || '-',
      };
    }
    return null;
  } catch (err) {
    return null;
  }
}

export function registerPrayerHandlers(bot) {
  bot.command('prayer', async (ctx) => {
    const zone = getDefaultZone();
    const times = await fetchPrayerTimes(zone);
    if (!times) return ctx.reply('❌ Could not fetch prayer times. Try again later.');

    const today = new Date().toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const msg = [
      `🕌 <b>Prayer Times</b>`, `📅 ${today}`, `📍 Zone: ${zone}`, '',
      `🌅 Subuh: <b>${times.subuh}</b>`,
      `☀️ Syuruk: <b>${times.syuruk}</b>`,
      `🕐 Zohor: <b>${times.zohor}</b>`,
      `🌤️ Asar: <b>${times.asar}</b>`,
      `🌅 Maghrib: <b>${times.maghrib}</b>`,
      `🌙 Isyak: <b>${times.isyak}</b>`, '',
      '/checkin — Check in prayers',
      '/streak — View your streak',
      '/subscribe — Get reminders',
    ].join('\n');
    return ctx.reply(msg, { parse_mode: 'HTML' });
  });

  bot.command('checkin', async (ctx) => {
    const today = new Date().toISOString().split('T')[0];
    const userId = String(ctx.from.id);

    // Get existing check-ins
    const { data: existing } = await supabaseAdmin.from('prayer_checkins').select('prayer, status').eq('user_id', userId).eq('date', today);
    const checked = new Set((existing || []).filter(c => c.status === 1).map(c => c.prayer));

    const keyboard = {
      inline_keyboard: PRAYER_NAMES.map((name, i) => {
        const key = PRAYER_KEYS[i];
        return [{ text: `${checked.has(key) ? '✅' : '⬜'} ${name}`, callback_data: `ci_${key}_${today}` }];
      }),
    };

    const count = checked.size;
    let status = `${count}/5 prayers completed`;
    if (count === 5) status = '🎉 MashaAllah! All 5 prayers completed!';

    return ctx.reply(`🕌 <b>Prayer Check-in</b>\n📅 ${today}\n\n${status}\n\nTap to toggle:`, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.action(/^ci_(.+)_(.+)$/, async (ctx) => {
    const prayer = ctx.match[1];
    const date = ctx.match[2];
    const userId = String(ctx.from.id);

    try {
      await supabaseAdmin.from('prayer_checkins').upsert({ user_id: userId, date, prayer, status: 1 }, { onConflict: 'user_id,date,prayer' });

      const { data: todayCheckins } = await supabaseAdmin.from('prayer_checkins').select('prayer, status').eq('user_id', userId).eq('date', date);
      const checked = new Set((todayCheckins || []).filter(c => c.status === 1).map(c => c.prayer));

      const keyboard = {
        inline_keyboard: PRAYER_NAMES.map((name, i) => {
          const key = PRAYER_KEYS[i];
          return [{ text: `${checked.has(key) ? '✅' : '⬜'} ${name}`, callback_data: `ci_${key}_${date}` }];
        }),
      };

      const count = checked.size;
      let status = `${count}/5 prayers completed`;
      if (count === 5) status = '🎉 MashaAllah! All 5 prayers completed!';

      await ctx.answerCbQuery(`✅ ${PRAYER_NAMES[PRAYER_KEYS.indexOf(prayer)]} checked in!`);
      return ctx.editMessageText(`🕌 <b>Prayer Check-in</b>\n📅 ${date}\n\n${status}\n\nTap to toggle:`, { parse_mode: 'HTML', reply_markup: keyboard });
    } catch (err) {
      return ctx.answerCbQuery('❌ Error.');
    }
  });

  bot.command('streak', async (ctx) => {
    const userId = String(ctx.from.id);
    const ninetyDaysAgo = new Date(); ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: checkins } = await supabaseAdmin.from('prayer_checkins').select('date, prayer, status').eq('user_id', userId).gte('date', ninetyDaysAgo.toISOString().split('T')[0]).order('date', { ascending: false });

    if (!checkins?.length) return ctx.reply('📊 No prayer data. Use /checkin to start!');

    const dayMap = new Map();
    for (const c of checkins) {
      if (!dayMap.has(c.date)) dayMap.set(c.date, new Set());
      if (c.status === 1) dayMap.get(c.date).add(c.prayer);
    }

    const perfectDays = [...dayMap.entries()].filter(([_, p]) => p.size === 5).length;
    const totalPrayers = checkins.filter(c => c.status === 1).length;

    let streak = 0;
    for (const date of [...dayMap.keys()].sort().reverse()) {
      if (dayMap.get(date).size === 5) streak++; else break;
    }

    const prayerCounts = {};
    for (const k of PRAYER_KEYS) prayerCounts[k] = 0;
    for (const c of checkins) if (c.status === 1) prayerCounts[c.prayer]++;

    const totalDays = dayMap.size;
    const prayerLines = PRAYER_NAMES.map((name, i) => {
      const pct = totalDays > 0 ? Math.round((prayerCounts[PRAYER_KEYS[i]] / totalDays) * 100) : 0;
      const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
      return `${name}: ${bar} ${pct}%`;
    });

    const msg = [
      '📊 <b>Your Prayer Stats</b>', '',
      `🔥 Current Streak: <b>${streak} days</b>`,
      `⭐ Perfect Days: <b>${perfectDays}</b>`,
      `🤲 Total Prayers: <b>${totalPrayers}</b>`,
      `📅 Days Tracked: <b>${totalDays}</b>`, '',
      '<b>Per Prayer:</b>',
      `<code>${prayerLines.join('\n')}</code>`,
    ].join('\n');
    return ctx.reply(msg, { parse_mode: 'HTML' });
  });

  bot.command('subscribe', async (ctx) => {
    subscribedUsers.set(ctx.from.id, { zone: getDefaultZone(), chatId: ctx.chat.id });
    return ctx.reply(`✅ <b>Subscribed!</b>\n📍 Zone: ${getDefaultZone()}\nYou'll get reminders before each prayer.\n\n/unsubscribe to stop.`, { parse_mode: 'HTML' });
  });

  bot.command('unsubscribe', async (ctx) => {
    subscribedUsers.delete(ctx.from.id);
    return ctx.reply('✅ Unsubscribed from prayer reminders.');
  });

  bot.command('azkar', async (ctx) => {
    const azkar = DAILY_AZKAR[new Date().getDay() % DAILY_AZKAR.length];
    return ctx.reply([`📿 <b>${azkar.title}</b>`, '', azkar.text, '', '<i>May Allah accept our ibadah. 🤲</i>'].join('\n'), { parse_mode: 'HTML' });
  });
}
