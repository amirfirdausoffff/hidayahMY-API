import { supabaseAdmin } from '../../src/lib/supabase';
import { cors } from '../../src/lib/cors';

const SETUP_SQL = `
-- Bookmarks table
CREATE TABLE IF NOT EXISTS bookmarks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'general',
  reference_id text,
  title text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Notes table
CREATE TABLE IF NOT EXISTS notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text DEFAULT '',
  type text DEFAULT 'general',
  reference_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Prayer check-ins table
CREATE TABLE IF NOT EXISTS prayer_checkins (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  prayer text NOT NULL CHECK (prayer IN ('subuh', 'zohor', 'asar', 'maghrib', 'isyak')),
  status smallint NOT NULL DEFAULT 1 CHECK (status IN (0, 1)),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date, prayer)
);

-- FCM tokens table
CREATE TABLE IF NOT EXISTS fcm_tokens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fcm_token text NOT NULL UNIQUE,
  platform text DEFAULT 'unknown',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Notifications history table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  body text NOT NULL,
  topic text DEFAULT 'general',
  data jsonb DEFAULT '{}',
  sent_by uuid REFERENCES auth.users(id),
  target_user_id uuid REFERENCES auth.users(id),
  total_sent int DEFAULT 0,
  total_failed int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE prayer_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE fcm_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE backgrounds ENABLE ROW LEVEL SECURITY;

-- Backgrounds table
CREATE TABLE IF NOT EXISTS backgrounds (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('dashboard', 'prayer', 'both')),
  image_url text NOT NULL,
  storage_path text NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Azan sounds table
CREATE TABLE IF NOT EXISTS azan_sounds (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  file_url text NOT NULL,
  storage_path text NOT NULL,
  duration_seconds integer,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE azan_sounds ENABLE ROW LEVEL SECURITY;

-- Feedback table
CREATE TABLE IF NOT EXISTS feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  feature TEXT NOT NULL,
  message TEXT NOT NULL,
  image_urls TEXT[],
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_backgrounds_category ON backgrounds(category);
CREATE INDEX IF NOT EXISTS idx_azan_sounds_created_at ON azan_sounds(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_prayer_checkins_user_date ON prayer_checkins(user_id, date);
CREATE INDEX IF NOT EXISTS idx_prayer_checkins_user_date_status ON prayer_checkins(user_id, date, status) WHERE status = 1;
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_id ON fcm_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);

-- Event categories
CREATE TABLE IF NOT EXISTS event_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  name_ms TEXT NOT NULL,
  icon TEXT DEFAULT 'calendar',
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Events
CREATE TABLE IF NOT EXISTS events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL,
  category_id UUID REFERENCES event_categories(id),
  location_name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  is_recurring BOOLEAN DEFAULT false,
  recurrence_rule TEXT,
  audience TEXT DEFAULT 'all',
  tags TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'reported', 'expired')),
  rejection_reason TEXT,
  image_urls TEXT[],
  verified_count INT DEFAULT 0,
  report_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Event responses
CREATE TABLE IF NOT EXISTS event_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  response TEXT NOT NULL CHECK (response IN ('interested', 'going', 'attended', 'reported')),
  report_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, event_id)
);

-- User trust scores
CREATE TABLE IF NOT EXISTS user_trust_scores (
  user_id UUID PRIMARY KEY,
  score INT DEFAULT 10,
  level TEXT DEFAULT 'new',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE event_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_trust_scores ENABLE ROW LEVEL SECURITY;

-- Indexes for events
CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date);
CREATE INDEX IF NOT EXISTS idx_events_category_id ON events(category_id);
CREATE INDEX IF NOT EXISTS idx_events_lat_lng ON events(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_event_responses_event_id ON event_responses(event_id);
CREATE INDEX IF NOT EXISTS idx_event_responses_user_id ON event_responses(user_id);

-- Seed default categories
INSERT INTO event_categories (name, name_ms, icon, sort_order) VALUES
  ('Ceramah & Kuliah', 'Ceramah & Kuliah', 'mic', 1),
  ('Kelas & Pengajian', 'Kelas & Pengajian', 'book-open', 2),
  ('Solat & Ibadah', 'Solat & Ibadah', 'moon', 3),
  ('Ramadan', 'Ramadan', 'star', 4),
  ('Charity & Derma', 'Amal & Derma', 'heart', 5),
  ('Community', 'Komuniti', 'users', 6),
  ('Youth & Kids', 'Belia & Kanak-kanak', 'baby', 7),
  ('Sisters Only', 'Wanita Sahaja', 'shield', 8),
  ('Hajj & Umrah', 'Haji & Umrah', 'compass', 9)
ON CONFLICT DO NOTHING;

-- RLS Policies
CREATE POLICY "Users can manage own bookmarks" ON bookmarks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own notes" ON notes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own prayer_checkins" ON prayer_checkins FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own fcm_tokens" ON fcm_tokens FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Admins can read all notifications" ON notifications FOR SELECT USING (true);
CREATE POLICY "Admins can insert notifications" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read backgrounds" ON backgrounds FOR SELECT USING (true);
CREATE POLICY "Admins can manage backgrounds" ON backgrounds FOR ALL USING (true);
CREATE POLICY "Anyone can read azan_sounds" ON azan_sounds FOR SELECT USING (true);
CREATE POLICY "Admins can manage azan_sounds" ON azan_sounds FOR ALL USING (true);
CREATE POLICY "Anyone can insert feedback" ON feedback FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can read all feedback" ON feedback FOR SELECT USING (true);
CREATE POLICY "Admins can update feedback" ON feedback FOR UPDATE USING (true);
CREATE POLICY "Anyone can read event_categories" ON event_categories FOR SELECT USING (true);
CREATE POLICY "Admins can manage event_categories" ON event_categories FOR ALL USING (true);
CREATE POLICY "Anyone can read approved events" ON events FOR SELECT USING (true);
CREATE POLICY "Users can insert events" ON events FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own events" ON events FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own events" ON events FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own event_responses" ON event_responses FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Anyone can read event_responses" ON event_responses FOR SELECT USING (true);
CREATE POLICY "Users can read own trust score" ON user_trust_scores FOR SELECT USING (auth.uid() = user_id);
`;

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { secret } = req.body;
  const expectedSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return res.status(403).json({ success: false, error: 'Invalid setup secret' });
  }

  const tables = {};

  // Check if bookmarks table exists
  const { error: bookmarksError } = await supabaseAdmin
    .from('bookmarks')
    .select('id')
    .limit(0);
  tables.bookmarks = !bookmarksError;

  // Check if notes table exists
  const { error: notesError } = await supabaseAdmin
    .from('notes')
    .select('id')
    .limit(0);
  tables.notes = !notesError;

  // Check if prayer_checkins table exists
  const { error: checkinError } = await supabaseAdmin
    .from('prayer_checkins')
    .select('id')
    .limit(0);
  tables.prayer_checkins = !checkinError;

  // Check if fcm_tokens table exists
  const { error: fcmError } = await supabaseAdmin
    .from('fcm_tokens')
    .select('id')
    .limit(0);
  tables.fcm_tokens = !fcmError;

  // Check if notifications table exists
  const { error: notifError } = await supabaseAdmin
    .from('notifications')
    .select('id')
    .limit(0);
  tables.notifications = !notifError;

  // Check if azan_sounds table exists
  const { error: azanError } = await supabaseAdmin
    .from('azan_sounds')
    .select('id')
    .limit(0);
  tables.azan_sounds = !azanError;

  // Check if feedback table exists
  const { error: feedbackError } = await supabaseAdmin
    .from('feedback')
    .select('id')
    .limit(0);
  tables.feedback = !feedbackError;

  // Check if event_categories table exists
  const { error: eventCategoriesError } = await supabaseAdmin
    .from('event_categories')
    .select('id')
    .limit(0);
  tables.event_categories = !eventCategoriesError;

  // Check if events table exists
  const { error: eventsError } = await supabaseAdmin
    .from('events')
    .select('id')
    .limit(0);
  tables.events = !eventsError;

  // Check if event_responses table exists
  const { error: eventResponsesError } = await supabaseAdmin
    .from('event_responses')
    .select('id')
    .limit(0);
  tables.event_responses = !eventResponsesError;

  // Check if user_trust_scores table exists
  const { error: trustError } = await supabaseAdmin
    .from('user_trust_scores')
    .select('user_id')
    .limit(0);
  tables.user_trust_scores = !trustError;

  if (tables.bookmarks && tables.notes && tables.prayer_checkins && tables.fcm_tokens && tables.notifications && tables.azan_sounds && tables.feedback && tables.event_categories && tables.events && tables.event_responses && tables.user_trust_scores) {
    return res.status(200).json({
      success: true,
      message: 'All tables already exist',
      tables,
    });
  }

  return res.status(200).json({
    success: false,
    message: 'One or more tables are missing. Please run the following SQL in Supabase SQL Editor.',
    tables,
    sql: SETUP_SQL,
  });
}

export default cors(handler);
