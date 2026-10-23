import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';
import { messaging } from '../../../src/lib/firebase-admin';
import { getTopicMigration, saveTopicMigration, OS_TOPICS } from '../../../src/lib/os-notification-topics';

const PAGE_SIZE = 500;
const INVALID_TOKEN_ERRORS = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing authorization' });
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
  if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  if (user.user_metadata?.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin access required' });

  const platform = req.method === 'GET' ? req.query.platform : req.body?.platform;
  if (!OS_TOPICS[platform]) return res.status(400).json({ success: false, error: 'Invalid platform' });

  try {
    const state = await getTopicMigration(platform);
    if (req.method === 'GET' || state.ready) {
      return res.status(200).json({ success: true, platform, ready: !!state.ready, processed: state.processed || 0 });
    }

    let query = supabaseAdmin.from('fcm_tokens')
      .select('id, fcm_token')
      .ilike('platform', platform)
      .order('id')
      .limit(PAGE_SIZE);
    if (state.cursor) query = query.gt('id', state.cursor);
    const { data: rows, error: queryError } = await query;
    if (queryError) throw queryError;

    if (rows.length > 0) {
      const tokens = rows.map((row) => row.fcm_token);
      const result = await messaging.subscribeToTopic(tokens, OS_TOPICS[platform]);
      const invalidTokens = [];
      for (const item of result.errors || []) {
        if (INVALID_TOKEN_ERRORS.has(item.error?.code)) invalidTokens.push(tokens[item.index]);
      }
      // A transient failure must never mark this batch complete.
      if (result.failureCount > invalidTokens.length) {
        return res.status(503).json({ success: false, error: 'Topic sync interrupted; retry this batch' });
      }
      if (invalidTokens.length > 0) {
        const { error: deleteError } = await supabaseAdmin.from('fcm_tokens')
          .delete().ilike('platform', platform).in('fcm_token', invalidTokens);
        if (deleteError) throw deleteError;
      }
    }

    const next = {
      cursor: rows.length ? rows[rows.length - 1].id : state.cursor,
      processed: (state.processed || 0) + rows.length,
      ready: rows.length < PAGE_SIZE,
      updated_at: new Date().toISOString(),
    };
    await saveTopicMigration(platform, next);
    return res.status(200).json({ success: true, platform, ready: next.ready, processed: next.processed });
  } catch (error) {
    console.error('[os-topics] Sync failed:', error.message);
    return res.status(503).json({ success: false, error: 'Unable to prepare OS topic; legacy delivery remains available' });
  }
}

export default cors(handler);
