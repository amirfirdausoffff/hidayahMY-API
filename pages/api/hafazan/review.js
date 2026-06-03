import { supabase, supabaseAdmin } from '../../../src/lib/supabase';
import { cors } from '../../../src/lib/cors';

async function handler(req, res) {
  if (req.method !== 'POST') {
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

  const { entry_id, rating, notes } = req.body;

  // Validate inputs
  if (!entry_id) {
    return res.status(400).json({ success: false, error: 'entry_id is required' });
  }

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ success: false, error: 'rating must be between 1 and 5' });
  }

  // Verify the entry belongs to the user
  const { data: entry, error: entryError } = await supabaseAdmin
    .from('hafazan_entries')
    .select('*')
    .eq('id', entry_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (entryError) {
    return res.status(400).json({ success: false, error: entryError.message });
  }

  if (!entry) {
    return res.status(404).json({ success: false, error: 'Hafazan entry not found' });
  }

  // Create review record
  const { data: review, error: reviewError } = await supabaseAdmin
    .from('hafazan_reviews')
    .insert({
      entry_id,
      user_id: user.id,
      rating,
      notes: notes || null,
    })
    .select()
    .single();

  if (reviewError) {
    return res.status(400).json({ success: false, error: reviewError.message });
  }

  // Get last 3 ratings for strength calculation
  const { data: recentReviews } = await supabaseAdmin
    .from('hafazan_reviews')
    .select('rating')
    .eq('entry_id', entry_id)
    .order('created_at', { ascending: false })
    .limit(3);

  const avgRating = recentReviews && recentReviews.length > 0
    ? recentReviews.reduce((sum, r) => sum + r.rating, 0) / recentReviews.length
    : rating;

  // Determine strength based on average of last 3 ratings
  let strength = 'weak';
  if (avgRating >= 4) {
    strength = 'strong';
  } else if (avgRating >= 2.5) {
    strength = 'medium';
  }

  // Calculate next_review_at based on spaced repetition
  const now = new Date();
  let daysUntilNext;
  if (rating <= 2) {
    daysUntilNext = 1;
  } else if (rating === 3) {
    daysUntilNext = 3;
  } else if (rating === 4) {
    daysUntilNext = 7;
  } else {
    // rating === 5
    daysUntilNext = (entry.review_count + 1) > 5 ? 30 : 14;
  }

  const nextReviewAt = new Date(now.getTime() + daysUntilNext * 24 * 60 * 60 * 1000);

  // Determine status
  const newReviewCount = (entry.review_count || 0) + 1;
  let status = entry.status;
  if (rating >= 4 && newReviewCount >= 3) {
    status = 'memorized';
  }

  // Update the entry
  const { data: updatedEntry, error: updateError } = await supabaseAdmin
    .from('hafazan_entries')
    .update({
      review_count: newReviewCount,
      last_reviewed_at: now.toISOString(),
      next_review_at: nextReviewAt.toISOString(),
      strength,
      status,
      updated_at: now.toISOString(),
    })
    .eq('id', entry_id)
    .select()
    .single();

  if (updateError) {
    return res.status(400).json({ success: false, error: updateError.message });
  }

  return res.status(200).json({
    success: true,
    review,
    entry: updatedEntry,
  });
}

export default cors(handler);
