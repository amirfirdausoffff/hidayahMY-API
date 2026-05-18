import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';
import { sanitizeString } from '../../../src/lib/validate';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function similarity(s1, s2) {
  const stopWords = ['di', 'dan', 'the', 'at', 'untuk', 'yang', 'ke', 'dari'];
  const clean = (s) => s.toLowerCase().split(/\s+/).filter(w => !stopWords.includes(w)).sort().join(' ');
  const a = clean(s1), b = clean(s2);
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;
  let matches = 0;
  const wordsA = a.split(' '), wordsB = b.split(' ');
  for (const w of wordsA) { if (wordsB.includes(w)) matches++; }
  return matches / Math.max(wordsA.length, wordsB.length);
}

async function getUserTrust(userId) {
  const { data } = await supabaseAdmin
    .from('user_trust_scores')
    .select('score, level')
    .eq('user_id', userId)
    .single();

  if (!data) {
    const { data: newTrust } = await supabaseAdmin
      .from('user_trust_scores')
      .upsert({ user_id: userId, score: 10, level: 'new' }, { onConflict: 'user_id' })
      .select()
      .single();
    return newTrust || { score: 10, level: 'new' };
  }
  return data;
}

function getTrustLevel(score) {
  if (score < 0) return 'banned';
  if (score <= 20) return 'new';
  if (score <= 50) return 'trusted';
  return 'verified';
}

async function handler(req, res) {
  // GET - List events with filters
  if (req.method === 'GET') {
    const {
      lat, lng, radius = 50, category, status, page = 1, limit = 20,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    // Check if admin is requesting all statuses
    let isAdmin = false;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user && user.user_metadata?.role === 'admin') {
        isAdmin = true;
      }
    }

    let query = supabaseAdmin
      .from('events')
      .select('*', { count: 'exact' });

    // Filter by status
    if (status === 'all' && isAdmin) {
      // Admin can see all statuses
    } else if (status && status !== 'all') {
      query = query.eq('status', status);
    } else {
      query = query.eq('status', 'approved');
    }

    // Filter by category
    if (category) {
      query = query.eq('category_id', category);
    }

    query = query.order('start_date', { ascending: true });

    const { data: events, error, count } = await query;

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    let results = events || [];

    // If lat/lng provided, calculate distance and filter by radius
    if (lat && lng) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      const maxRadius = parseFloat(radius);

      if (isNaN(userLat) || isNaN(userLng)) {
        return res.status(400).json({ success: false, error: 'Invalid lat/lng values' });
      }

      results = results
        .map(event => ({
          ...event,
          distance_km: haversine(userLat, userLng, event.latitude, event.longitude),
        }))
        .filter(event => event.distance_km <= maxRadius)
        .sort((a, b) => a.distance_km - b.distance_km);
    }

    const total = results.length;
    const paginatedResults = results.slice(offset, offset + limitNum);

    // Fetch response counts for all events in this page
    const eventIds = paginatedResults.map(e => e.id);
    let responseCounts = {};
    if (eventIds.length > 0) {
      const { data: allResponses } = await supabaseAdmin
        .from('event_responses')
        .select('event_id, response')
        .in('event_id', eventIds);

      if (allResponses) {
        for (const r of allResponses) {
          if (!responseCounts[r.event_id]) {
            responseCounts[r.event_id] = { interested: 0, going: 0, attended: 0, reported: 0 };
          }
          if (responseCounts[r.event_id][r.response] !== undefined) {
            responseCounts[r.event_id][r.response]++;
          }
        }
      }
    }

    // Merge counts into events
    const eventsWithCounts = paginatedResults.map(evt => ({
      ...evt,
      interested_count: responseCounts[evt.id]?.interested || 0,
      going_count: responseCounts[evt.id]?.going || 0,
      attended_count: responseCounts[evt.id]?.attended || 0,
      report_count: responseCounts[evt.id]?.reported || evt.report_count || 0,
    }));

    return res.status(200).json({
      success: true,
      events: eventsWithCounts,
      total,
      page: pageNum,
      limit: limitNum,
    });
  }

  // POST - Create event
  if (req.method === 'POST') {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Missing authorization' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    const {
      title, description, event_type, location_name, latitude, longitude,
      start_date, end_date, is_recurring, recurrence_rule, audience,
      tags, category_id, force, images,
    } = req.body;

    // Validate required fields
    if (!title || !description || !event_type || !location_name || latitude == null || longitude == null || !start_date) {
      return res.status(400).json({
        success: false,
        error: 'title, description, event_type, location_name, latitude, longitude, and start_date are required',
      });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ success: false, error: 'Invalid latitude or longitude' });
    }

    // Validate Malaysia coordinates (roughly)
    if (lat < 1.0 || lat > 7.5 || lng < 99.5 || lng > 119.5) {
      return res.status(400).json({ success: false, error: 'Coordinates must be within Malaysia' });
    }

    // Validate start_date
    const startDateObj = new Date(start_date);
    if (isNaN(startDateObj.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid start_date format' });
    }

    // Rate limit: max 3 events per day per user
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const { count: todayCount } = await supabaseAdmin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', todayStart.toISOString())
      .lte('created_at', todayEnd.toISOString());

    if (todayCount >= 3) {
      return res.status(429).json({
        success: false,
        error: 'Daily limit reached. You can create a maximum of 3 events per day.',
      });
    }

    // Duplicate detection 1: Same user + same title + same date
    const { data: exactDuplicates } = await supabaseAdmin
      .from('events')
      .select('id, title, start_date')
      .eq('user_id', user.id)
      .ilike('title', title.trim())
      .gte('start_date', startDateObj.toISOString().split('T')[0] + 'T00:00:00Z')
      .lte('start_date', startDateObj.toISOString().split('T')[0] + 'T23:59:59Z');

    if (exactDuplicates && exactDuplicates.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'You already have an event with the same title on this date.',
        duplicate: true,
        existing_event: exactDuplicates[0],
      });
    }

    // Duplicate detection 2: Nearby + similar time + similar title (skip if force)
    if (!force) {
      const twoHoursMs = 2 * 60 * 60 * 1000;
      const searchStart = new Date(startDateObj.getTime() - twoHoursMs).toISOString();
      const searchEnd = new Date(startDateObj.getTime() + twoHoursMs).toISOString();

      const { data: nearbyEvents } = await supabaseAdmin
        .from('events')
        .select('id, title, start_date, latitude, longitude, location_name')
        .gte('start_date', searchStart)
        .lte('start_date', searchEnd)
        .neq('status', 'rejected');

      if (nearbyEvents && nearbyEvents.length > 0) {
        for (const existing of nearbyEvents) {
          const dist = haversine(lat, lng, existing.latitude, existing.longitude);
          const sim = similarity(title, existing.title);
          if (dist <= 0.5 && sim > 0.7) {
            return res.status(409).json({
              success: false,
              error: 'A similar event was found nearby at a similar time. Set force: true to create anyway.',
              duplicate: true,
              similar_event: existing,
            });
          }
        }
      }
    }

    // Get user trust score to determine auto-approval
    const trust = await getUserTrust(user.id);
    const eventStatus = trust.score >= 21 ? 'approved' : 'pending';

    const cleanTitle = sanitizeString(title, 200);
    const cleanDescription = sanitizeString(description, 2000);
    const cleanLocationName = sanitizeString(location_name, 300);

    // Handle image uploads (max 2)
    let imageUrls = null;
    if (images && Array.isArray(images) && images.length > 0) {
      const maxImages = images.slice(0, 2);
      imageUrls = [];

      for (let i = 0; i < maxImages.length; i++) {
        const buffer = Buffer.from(maxImages[i], 'base64');
        const filePath = `events/${user.id}/${Date.now()}_${i}.jpg`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from('event-images')
          .upload(filePath, buffer, {
            contentType: 'image/jpeg',
            upsert: false,
          });

        if (uploadError) {
          return res.status(400).json({ success: false, error: `Image upload failed: ${uploadError.message}` });
        }

        const { data: urlData } = supabaseAdmin.storage
          .from('event-images')
          .getPublicUrl(filePath);

        imageUrls.push(urlData.publicUrl);
      }
    }

    const insertData = {
      user_id: user.id,
      title: cleanTitle,
      description: cleanDescription,
      event_type: sanitizeString(event_type, 50),
      location_name: cleanLocationName,
      latitude: lat,
      longitude: lng,
      start_date: startDateObj.toISOString(),
      end_date: end_date ? new Date(end_date).toISOString() : null,
      is_recurring: is_recurring || false,
      recurrence_rule: recurrence_rule ? sanitizeString(recurrence_rule, 100) : null,
      audience: audience ? sanitizeString(audience, 50) : 'all',
      tags: Array.isArray(tags) ? tags.map(t => sanitizeString(t, 50)) : [],
      category_id: category_id || null,
      status: eventStatus,
      image_urls: imageUrls,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: event, error: insertError } = await supabaseAdmin
      .from('events')
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      return res.status(400).json({ success: false, error: insertError.message });
    }

    return res.status(201).json({ success: true, event });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}

export default cors(handler);
