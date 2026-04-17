// labsRoutes.js — Flashcards, Active Recall, Mind Maps
import express from 'express';
import { verifyUser as jwtVerify } from '../../auth/authMiddleware.js';
import { attachCompat } from '../../db/compat.js';
import OpenAIClient from '../controllers/ai/openAIClient.js';
import { v4 as uuidv4 } from 'uuid';
import { config } from 'dotenv';

config();

const router = express.Router();
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o';

const aiClient = new OpenAIClient({
  endpoint: process.env.AI_BASE_URL,
  apiKey:   process.env.AI_API_KEY,
  defaultModel: AI_MODEL,
});

// ── Auth middleware ────────────────────────────────────────────────────────────
const auth = (req, res, next) => {
  jwtVerify(req, res, (err) => {
    if (err) return;
    attachCompat(req, res, () => {
      req.workspaceId = req.query.workspaceId || req.body?.workspaceId || null;
      next();
    });
  });
};

// ── SM-2 spaced repetition ────────────────────────────────────────────────────
// rating: 0=Again, 1=Hard, 2=Good, 3=Easy
function sm2(card, rating) {
  let { ease_factor, interval_days, repetitions } = card;

  if (rating < 2) {
    // Failed — reset
    repetitions  = 0;
    interval_days = rating === 0 ? 1 : Math.ceil(interval_days * 1.2);
  } else {
    // Passed
    if (repetitions === 0)      interval_days = 1;
    else if (repetitions === 1) interval_days = 6;
    else                        interval_days = Math.round(interval_days * ease_factor);

    repetitions += 1;
    ease_factor = Math.max(1.3, ease_factor + 0.1 - (3 - rating) * (0.08 + (3 - rating) * 0.02));
  }

  interval_days = Math.min(interval_days, 365);
  const next_review_at = new Date(Date.now() + interval_days * 86400000).toISOString();
  return { ease_factor, interval_days, repetitions, next_review_at };
}

// ── AI helper ─────────────────────────────────────────────────────────────────
async function aiJSON(systemPrompt, userPrompt, maxTokens = 1200) {
  const response = await aiClient.client.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
    max_completion_tokens: maxTokens,
    response_format: { type: 'json_object' },
  });
  const text = response.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty AI response');
  return JSON.parse(text);
}

// ════════════════════════════════════════════════════════════════════════════
// FLASHCARDS
// ════════════════════════════════════════════════════════════════════════════

// POST /api/studylab/flashcards/generate
// AI generates cards for a topic, creates deck + cards in one shot
router.post('/flashcards/generate', auth, async (req, res) => {
  const { topic, cardCount = 12, workspaceId } = req.body;
  if (!topic?.trim()) return res.status(400).json({ success: false, error: 'topic required' });
  if (!workspaceId)   return res.status(400).json({ success: false, error: 'workspaceId required' });

  const db = req.supabase;

  try {
    const data = await aiJSON(
      `You are a flashcard expert. Generate exactly ${cardCount} high-quality flashcards for the given topic.
Return ONLY valid JSON in this exact format:
{
  "title": "Short deck title (max 40 chars)",
  "color": "one of: #6366f1 #ec4899 #10b981 #f59e0b #3b82f6 #8b5cf6 #ef4444 #06b6d4",
  "cards": [
    { "front": "concise question or term", "back": "clear answer or definition" }
  ]
}
Rules: fronts should be questions or terms, backs should be concise but complete answers.
Cover the topic breadth. Vary difficulty. No duplicate cards.`,
      `Topic: ${topic.trim()}`
    );

    if (!data.cards?.length) throw new Error('No cards generated');

    // Create deck
    const { data: deck, error: deckErr } = await db
      .schema('studylab')
      .from('flashcard_decks')
      .insert({
        user_id:      req.user.id,
        workspace_id: workspaceId,
        title:        data.title || topic.trim(),
        topic:        topic.trim(),
        color:        data.color || '#6366f1',
      })
      .select()
      .single();

    if (deckErr) throw deckErr;

    // Insert cards
    const cardRows = data.cards.map(c => ({
      deck_id: deck.id,
      user_id: req.user.id,
      front:   c.front,
      back:    c.back,
    }));

    const { error: cardErr } = await db
      .schema('studylab')
      .from('flashcards')
      .insert(cardRows);

    if (cardErr) throw cardErr;

    return res.json({ success: true, deckId: deck.id, title: deck.title, cardCount: cardRows.length });
  } catch (err) {
    console.error('[Labs] flashcard generate error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate flashcards' });
  }
});

// GET /api/studylab/flashcards/decks
router.get('/flashcards/decks', auth, async (req, res) => {
  const { workspaceId } = req.query;
  if (!workspaceId) return res.status(400).json({ success: false, error: 'workspaceId required' });

  try {
    // Get decks with due count computed from cards
    const { data: decks, error } = await req.supabase
      .schema('studylab')
      .from('flashcard_decks')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('workspace_id', workspaceId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // For each deck, count due cards
    const now = new Date().toISOString();
    const deckIds = decks.map(d => d.id);

    let dueCounts = {};
    if (deckIds.length > 0) {
      const { data: dueData } = await req.supabase
        .schema('studylab')
        .from('flashcards')
        .select('deck_id')
        .in('deck_id', deckIds)
        .lte('next_review_at', now);

      (dueData || []).forEach(r => {
        dueCounts[r.deck_id] = (dueCounts[r.deck_id] || 0) + 1;
      });
    }

    const enriched = decks.map(d => ({ ...d, due_count: dueCounts[d.id] || 0 }));
    res.json({ success: true, decks: enriched });
  } catch (err) {
    console.error('[Labs] list decks error:', err);
    res.status(500).json({ success: false, error: 'Failed to load decks' });
  }
});

// GET /api/studylab/flashcards/decks/:id/cards
router.get('/flashcards/decks/:id/cards', auth, async (req, res) => {
  const { mode = 'all' } = req.query; // mode: 'all' | 'due'
  try {
    // Fetch deck info alongside cards
    const { data: deck, error: deckErr } = await req.supabase
      .schema('studylab')
      .from('flashcard_decks')
      .select('id, topic, title, color, card_count')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (deckErr || !deck) return res.status(404).json({ success: false, error: 'Deck not found' });

    let query = req.supabase
      .schema('studylab')
      .from('flashcards')
      .select('*')
      .eq('deck_id', req.params.id)
      .eq('user_id', req.user.id)
      .order('next_review_at', { ascending: true });

    if (mode === 'due') {
      query = query.lte('next_review_at', new Date().toISOString());
    }

    const { data: cards, error } = await query;
    if (error) throw error;

    res.json({ success: true, deck, cards: cards || [] });
  } catch (err) {
    console.error('[Labs] get cards error:', err);
    res.status(500).json({ success: false, error: 'Failed to load cards' });
  }
});

// PATCH /api/studylab/flashcards/cards/:id — edit card front/back
router.patch('/flashcards/cards/:id', auth, async (req, res) => {
  const { front, back } = req.body;
  if (!front?.trim() || !back?.trim()) {
    return res.status(400).json({ success: false, error: 'front and back required' });
  }
  try {
    const { error } = await req.supabase
      .schema('studylab')
      .from('flashcards')
      .update({ front: front.trim(), back: back.trim() })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update card' });
  }
});

// DELETE /api/studylab/flashcards/cards/:id — delete a single card
router.delete('/flashcards/cards/:id', auth, async (req, res) => {
  try {
    const { error } = await req.supabase
      .schema('studylab')
      .from('flashcards')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete card' });
  }
});

// POST /api/studylab/flashcards/decks/:id/cards — add a card manually
router.post('/flashcards/decks/:id/cards', auth, async (req, res) => {
  const { front, back } = req.body;
  if (!front?.trim() || !back?.trim()) {
    return res.status(400).json({ success: false, error: 'front and back required' });
  }
  try {
    // Verify deck belongs to user
    const { data: deck, error: deckErr } = await req.supabase
      .schema('studylab')
      .from('flashcard_decks')
      .select('id')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();
    if (deckErr || !deck) return res.status(404).json({ success: false, error: 'Deck not found' });

    const { data: card, error } = await req.supabase
      .schema('studylab')
      .from('flashcards')
      .insert({ deck_id: req.params.id, user_id: req.user.id, front: front.trim(), back: back.trim() })
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, card });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to add card' });
  }
});

// PATCH /api/studylab/flashcards/cards/:id/review — record review with SM-2
router.patch('/flashcards/cards/:id/review', auth, async (req, res) => {
  const { rating } = req.body; // 0=Again 1=Hard 2=Good 3=Easy
  if (rating === undefined || rating < 0 || rating > 3) {
    return res.status(400).json({ success: false, error: 'rating 0-3 required' });
  }

  try {
    const { data: card, error: fetchErr } = await req.supabase
      .schema('studylab')
      .from('flashcards')
      .select('ease_factor, interval_days, repetitions')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (fetchErr || !card) return res.status(404).json({ success: false, error: 'Card not found' });

    const updates = sm2(card, Number(rating));

    const { error: updateErr } = await req.supabase
      .schema('studylab')
      .from('flashcards')
      .update({ ...updates, last_reviewed_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (updateErr) throw updateErr;

    res.json({ success: true, ...updates });
  } catch (err) {
    console.error('[Labs] review card error:', err);
    res.status(500).json({ success: false, error: 'Failed to record review' });
  }
});

// DELETE /api/studylab/flashcards/decks/:id
router.delete('/flashcards/decks/:id', auth, async (req, res) => {
  try {
    const { error } = await req.supabase
      .schema('studylab')
      .from('flashcard_decks')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete deck' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ACTIVE RECALL
// ════════════════════════════════════════════════════════════════════════════

// GET /api/studylab/recall/sessions/:id — fetch single session with questions
router.get('/recall/sessions/:id', auth, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .schema('studylab')
      .from('recall_sessions')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();
    if (error || !data) return res.status(404).json({ success: false, error: 'Session not found' });
    res.json({ success: true, session: data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load session' });
  }
});

// DELETE /api/studylab/recall/sessions/:id
router.delete('/recall/sessions/:id', auth, async (req, res) => {
  try {
    const { error } = await req.supabase
      .schema('studylab')
      .from('recall_sessions')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete session' });
  }
});

// POST /api/studylab/recall/generate — AI generates questions for a topic
router.post('/recall/generate', auth, async (req, res) => {
  const { topic, workspaceId } = req.body;
  if (!topic?.trim()) return res.status(400).json({ success: false, error: 'topic required' });
  if (!workspaceId)   return res.status(400).json({ success: false, error: 'workspaceId required' });

  try {
    const data = await aiJSON(
      `You are an expert educator creating an Active Recall quiz.
Return ONLY valid JSON:
{
  "questions": [
    {
      "question": "Clear, specific question",
      "answer": "Concise, complete model answer",
      "hint": "A gentle nudge without giving it away"
    }
  ]
}
Rules:
- Generate exactly 6 questions
- Cover: key definitions, mechanisms/processes, cause-effect, application, misconception, "why does this matter"
- Order easy → medium → hard
- Each answer should be 1-3 sentences maximum
- Hints should be thought-provoking, not the answer`,
      `Topic: ${topic.trim()}`
    );

    if (!data.questions?.length) throw new Error('No questions generated');

    // Save session (incomplete — no answers yet)
    const { data: session, error } = await req.supabase
      .schema('studylab')
      .from('recall_sessions')
      .insert({
        user_id:      req.user.id,
        workspace_id: workspaceId,
        topic:        topic.trim(),
        questions:    data.questions,
        score_total:  data.questions.length,
      })
      .select('id')
      .single();

    if (error) throw error;

    res.json({ success: true, sessionId: session.id, questions: data.questions });
  } catch (err) {
    console.error('[Labs] recall generate error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate questions' });
  }
});

// PATCH /api/studylab/recall/sessions/:id — save answers + score
router.patch('/recall/sessions/:id', auth, async (req, res) => {
  const { answers, score_correct } = req.body;
  try {
    const { error } = await req.supabase
      .schema('studylab')
      .from('recall_sessions')
      .update({
        answers,
        score_correct,
        completed_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to save session' });
  }
});

// GET /api/studylab/recall/sessions — list past sessions
router.get('/recall/sessions', auth, async (req, res) => {
  const { workspaceId } = req.query;
  if (!workspaceId) return res.status(400).json({ success: false, error: 'workspaceId required' });

  try {
    const { data, error } = await req.supabase
      .schema('studylab')
      .from('recall_sessions')
      .select('id, topic, questions, score_correct, score_total, completed_at, created_at')
      .eq('user_id', req.user.id)
      .eq('workspace_id', workspaceId)
      .not('completed_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw error;

    const sessions = (data || []).map(s => ({
      ...s,
      score_pct: s.score_total > 0 ? Math.round((s.score_correct / s.score_total) * 100) : 0,
    }));

    res.json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load sessions' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// MIND MAPS
// ════════════════════════════════════════════════════════════════════════════

// POST /api/studylab/mindmap/generate — AI generates + saves a mind map
router.post('/mindmap/generate', auth, async (req, res) => {
  const { topic, workspaceId } = req.body;
  if (!topic?.trim()) return res.status(400).json({ success: false, error: 'topic required' });
  if (!workspaceId)   return res.status(400).json({ success: false, error: 'workspaceId required' });

  try {
    const data = await aiJSON(
      `You are a mind map expert. Generate a rich mind map structure for the given topic.
Return ONLY valid JSON:
{
  "title": "Concise map title",
  "central": "Central node label (usually the topic)",
  "branches": [
    {
      "id": "unique_id",
      "label": "Main branch label",
      "color": "#hexcolor",
      "children": [
        { "id": "unique_child_id", "label": "Child concept" }
      ]
    }
  ]
}
Rules:
- 4-6 main branches, each with 3-5 children
- Use distinct colors for each branch (vibrant hex colors)
- Labels should be concise (2-5 words)
- Children should be specific, concrete concepts
- IDs must be unique strings (use slugs like "algebra-equations")`,
      `Topic: ${topic.trim()}`,
      1500
    );

    if (!data.branches?.length) throw new Error('No branches generated');

    const { data: map, error } = await req.supabase
      .schema('studylab')
      .from('mind_maps')
      .insert({
        user_id:      req.user.id,
        workspace_id: workspaceId,
        title:        data.title || topic.trim(),
        topic:        topic.trim(),
        nodes:        { central: data.central, branches: data.branches },
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, mapId: map.id, map });
  } catch (err) {
    console.error('[Labs] mindmap generate error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate mind map' });
  }
});

// GET /api/studylab/mindmap — list user's mind maps
router.get('/mindmap', auth, async (req, res) => {
  const { workspaceId } = req.query;
  if (!workspaceId) return res.status(400).json({ success: false, error: 'workspaceId required' });

  try {
    const { data, error } = await req.supabase
      .schema('studylab')
      .from('mind_maps')
      .select('id, title, topic, created_at, updated_at')
      .eq('user_id', req.user.id)
      .eq('workspace_id', workspaceId)
      .eq('is_archived', false)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, maps: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load mind maps' });
  }
});

// GET /api/studylab/mindmap/:id
router.get('/mindmap/:id', auth, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .schema('studylab')
      .from('mind_maps')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !data) return res.status(404).json({ success: false, error: 'Map not found' });
    res.json({ success: true, map: data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to load map' });
  }
});

// PUT /api/studylab/mindmap/:id — save edited nodes
router.put('/mindmap/:id', auth, async (req, res) => {
  const { nodes, title } = req.body;
  try {
    const updates = {};
    if (nodes !== undefined) updates.nodes = nodes;
    if (title !== undefined) updates.title = title;

    const { error } = await req.supabase
      .schema('studylab')
      .from('mind_maps')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update map' });
  }
});

// DELETE /api/studylab/mindmap/:id
router.delete('/mindmap/:id', auth, async (req, res) => {
  try {
    const { error } = await req.supabase
      .schema('studylab')
      .from('mind_maps')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete map' });
  }
});

export default router;
