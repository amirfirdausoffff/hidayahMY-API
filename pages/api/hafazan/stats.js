import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

// Surah names for display in admin
const SURAH_NAMES = {
  1:'Al-Fatihah',2:'Al-Baqarah',3:'Ali \'Imran',4:'An-Nisa\'',5:'Al-Ma\'idah',6:'Al-An\'am',7:'Al-A\'raf',8:'Al-Anfal',9:'At-Tawbah',10:'Yunus',
  11:'Hud',12:'Yusuf',13:'Ar-Ra\'d',14:'Ibrahim',15:'Al-Hijr',16:'An-Nahl',17:'Al-Isra\'',18:'Al-Kahf',19:'Maryam',20:'Taha',
  21:'Al-Anbiya\'',22:'Al-Hajj',23:'Al-Mu\'minun',24:'An-Nur',25:'Al-Furqan',26:'Ash-Shu\'ara\'',27:'An-Naml',28:'Al-Qasas',29:'Al-\'Ankabut',30:'Ar-Rum',
  31:'Luqman',32:'As-Sajdah',33:'Al-Ahzab',34:'Saba\'',35:'Fatir',36:'Ya-Sin',37:'As-Saffat',38:'Sad',39:'Az-Zumar',40:'Ghafir',
  41:'Fussilat',42:'Ash-Shura',43:'Az-Zukhruf',44:'Ad-Dukhan',45:'Al-Jathiyah',46:'Al-Ahqaf',47:'Muhammad',48:'Al-Fath',49:'Al-Hujurat',50:'Qaf',
  51:'Adh-Dhariyat',52:'At-Tur',53:'An-Najm',54:'Al-Qamar',55:'Ar-Rahman',56:'Al-Waqi\'ah',57:'Al-Hadid',58:'Al-Mujadilah',59:'Al-Hashr',60:'Al-Mumtahanah',
  61:'As-Saff',62:'Al-Jumu\'ah',63:'Al-Munafiqun',64:'At-Taghabun',65:'At-Talaq',66:'At-Tahrim',67:'Al-Mulk',68:'Al-Qalam',69:'Al-Haqqah',70:'Al-Ma\'arij',
  71:'Nuh',72:'Al-Jinn',73:'Al-Muzzammil',74:'Al-Muddaththir',75:'Al-Qiyamah',76:'Al-Insan',77:'Al-Mursalat',78:'An-Naba\'',79:'An-Nazi\'at',80:'\'Abasa',
  81:'At-Takwir',82:'Al-Infitar',83:'Al-Mutaffifin',84:'Al-Inshiqaq',85:'Al-Buruj',86:'At-Tariq',87:'Al-A\'la',88:'Al-Ghashiyah',89:'Al-Fajr',90:'Al-Balad',
  91:'Ash-Shams',92:'Al-Layl',93:'Ad-Duha',94:'Ash-Sharh',95:'At-Tin',96:'Al-\'Alaq',97:'Al-Qadr',98:'Al-Bayyinah',99:'Az-Zalzalah',100:'Al-\'Adiyat',
  101:'Al-Qari\'ah',102:'At-Takathur',103:'Al-\'Asr',104:'Al-Humazah',105:'Al-Fil',106:'Quraysh',107:'Al-Ma\'un',108:'Al-Kawthar',109:'Al-Kafirun',110:'An-Nasr',
  111:'Al-Masad',112:'Al-Ikhlas',113:'Al-Falaq',114:'An-Nas',
};

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing authorization' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  if (user.user_metadata?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  // Total entries
  const { count: totalEntries } = await supabaseAdmin
    .from('hafazan_entries')
    .select('*', { count: 'exact', head: true });

  // Unique users
  const { data: usersData } = await supabaseAdmin
    .from('hafazan_entries')
    .select('user_id');

  const uniqueUsers = usersData ? new Set(usersData.map(u => u.user_id)).size : 0;

  // Entries by status
  const { count: memorizingCount } = await supabaseAdmin
    .from('hafazan_entries')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'memorizing');

  const { count: memorizedCount } = await supabaseAdmin
    .from('hafazan_entries')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'memorized');

  // Total reviews and avg rating
  const { data: reviewStats } = await supabaseAdmin
    .from('hafazan_reviews')
    .select('rating');

  const totalReviews = reviewStats ? reviewStats.length : 0;
  const avgRating = totalReviews > 0
    ? Math.round((reviewStats.reduce((sum, r) => sum + r.rating, 0) / totalReviews) * 100) / 100
    : 0;

  // Top memorized surahs
  const { data: memorizedEntries } = await supabaseAdmin
    .from('hafazan_entries')
    .select('surah_number')
    .eq('status', 'memorized');

  const surahCounts = {};
  if (memorizedEntries) {
    memorizedEntries.forEach(e => {
      surahCounts[e.surah_number] = (surahCounts[e.surah_number] || 0) + 1;
    });
  }

  const topSurahs = Object.entries(surahCounts)
    .map(([surah_number, count]) => ({
      surah_number: parseInt(surah_number),
      surah_name: SURAH_NAMES[parseInt(surah_number)] || `Surah ${surah_number}`,
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Recent activity (last 10 reviews with user info)
  const { data: recentReviews } = await supabaseAdmin
    .from('hafazan_reviews')
    .select('id, entry_id, user_id, rating, notes, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  return res.status(200).json({
    success: true,
    stats: {
      total_entries: totalEntries || 0,
      total_users: uniqueUsers,
      entries_by_status: {
        memorizing: memorizingCount || 0,
        memorized: memorizedCount || 0,
      },
      total_reviews: totalReviews,
      avg_rating: avgRating,
      top_memorized_surahs: topSurahs,
      recent_activity: recentReviews || [],
    },
  });
}

export default cors(handler);
