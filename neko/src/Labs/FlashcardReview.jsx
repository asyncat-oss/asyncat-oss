import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CreditCard, ArrowLeft, RotateCcw, CheckCircle, Loader2, AlertCircle, Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { labsApi } from '../CommandCenter/commandCenterApi';

const RATINGS = [
  { value: 0, label: 'Again',  sublabel: '<1d',    style: 'border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30' },
  { value: 1, label: 'Hard',   sublabel: '+20%',   style: 'border-orange-200 dark:border-orange-800/60 text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30' },
  { value: 2, label: 'Good',   sublabel: 'normal', style: 'border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30' },
  { value: 3, label: 'Easy',   sublabel: '+bonus',  style: 'border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30' },
];

// ─── Manage Cards view ────────────────────────────────────────────────────────

const ManageCards = ({ deckId, cards: initialCards, onCardsChanged }) => {
  const [cards, setCards] = useState(initialCards);
  const [editingId, setEditingId] = useState(null);
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');
  const [saving, setSaving] = useState(null);
  const [deleting, setDeleting] = useState(null);

  // Add card form
  const [showAdd, setShowAdd] = useState(false);
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');
  const [adding, setAdding] = useState(false);

  const startEdit = (card) => {
    setEditingId(card.id);
    setEditFront(card.front);
    setEditBack(card.back);
  };

  const cancelEdit = () => { setEditingId(null); setEditFront(''); setEditBack(''); };

  const saveEdit = async (cardId) => {
    if (!editFront.trim() || !editBack.trim()) return;
    setSaving(cardId);
    try {
      await labsApi.updateCard(cardId, editFront.trim(), editBack.trim());
      const updated = cards.map(c => c.id === cardId ? { ...c, front: editFront.trim(), back: editBack.trim() } : c);
      setCards(updated);
      onCardsChanged(updated);
      setEditingId(null);
    } catch {
      // stay in edit mode
    } finally {
      setSaving(null);
    }
  };

  const deleteCard = async (cardId) => {
    setDeleting(cardId);
    try {
      await labsApi.deleteCard(cardId);
      const updated = cards.filter(c => c.id !== cardId);
      setCards(updated);
      onCardsChanged(updated);
    } catch {
      // silent
    } finally {
      setDeleting(null);
    }
  };

  const addCard = async (e) => {
    e.preventDefault();
    if (!newFront.trim() || !newBack.trim()) return;
    setAdding(true);
    try {
      const res = await labsApi.addCard(deckId, newFront.trim(), newBack.trim());
      const updated = [...cards, res.card];
      setCards(updated);
      onCardsChanged(updated);
      setNewFront('');
      setNewBack('');
      setShowAdd(false);
    } catch {
      // silent
    } finally {
      setAdding(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-gray-500 dark:text-gray-400">{cards.length} cards</p>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add card
        </button>
      </div>

      {/* Add card form */}
      {showAdd && (
        <form onSubmit={addCard} className="mb-4 p-3 rounded-xl border border-violet-200 dark:border-violet-800/50 bg-violet-50/40 dark:bg-violet-900/10 space-y-2">
          <input
            autoFocus
            value={newFront}
            onChange={e => setNewFront(e.target.value)}
            placeholder="Front (question or term)…"
            maxLength={400}
            className="w-full px-2.5 py-2 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-violet-400 dark:focus:border-violet-500"
          />
          <input
            value={newBack}
            onChange={e => setNewBack(e.target.value)}
            placeholder="Back (answer or definition)…"
            maxLength={600}
            className="w-full px-2.5 py-2 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-violet-400 dark:focus:border-violet-500"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!newFront.trim() || !newBack.trim() || adding}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Add card
            </button>
            <button type="button" onClick={() => { setShowAdd(false); setNewFront(''); setNewBack(''); }} className="px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Cards list */}
      {cards.length === 0 ? (
        <div className="text-center py-10 text-xs text-gray-400 dark:text-gray-600">No cards yet. Add one above.</div>
      ) : (
        <div className="space-y-2">
          {cards.map((card) => (
            <div key={card.id} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {editingId === card.id ? (
                <div className="p-3 space-y-2">
                  <textarea
                    autoFocus
                    value={editFront}
                    onChange={e => setEditFront(e.target.value)}
                    rows={2}
                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-violet-300 dark:border-violet-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none resize-none"
                  />
                  <textarea
                    value={editBack}
                    onChange={e => setEditBack(e.target.value)}
                    rows={2}
                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-violet-300 dark:border-violet-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(card.id)}
                      disabled={saving === card.id || !editFront.trim() || !editBack.trim()}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
                    >
                      {saving === card.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Save
                    </button>
                    <button onClick={cancelEdit} className="px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 p-3 group">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200 mb-1">{card.front}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{card.back}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(card)} className="p-1.5 rounded-lg text-gray-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteCard(card.id)}
                      disabled={deleting === card.id}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    >
                      {deleting === card.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Review Session ───────────────────────────────────────────────────────────

const ReviewSession = ({ cards, deckId, deck, onComplete, onRestart }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [stats, setStats] = useState({ again: 0, hard: 0, good: 0, easy: 0 });

  const handleRate = useCallback(async (rating) => {
    if (submitting) return;
    const card = cards[currentIndex];
    setSubmitting(true);

    const label = ['again', 'hard', 'good', 'easy'][rating];
    setStats(prev => ({ ...prev, [label]: prev[label] + 1 }));

    try {
      await labsApi.reviewCard(card.id, rating);
    } catch {
      // non-blocking
    }

    setFlipped(false);
    setSubmitting(false);

    if (currentIndex + 1 >= cards.length) {
      setDone(true);
    } else {
      setCurrentIndex(i => i + 1);
    }
  }, [submitting, cards, currentIndex]);

  if (cards.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No cards due right now</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Come back when cards are scheduled.</p>
      </div>
    );
  }

  if (done) {
    const total = stats.again + stats.hard + stats.good + stats.easy;
    const correct = stats.good + stats.easy;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

    return (
      <div>
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-500" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Session complete</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{total} cards reviewed · {pct}% good or easy</p>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-8">
          {RATINGS.map(r => (
            <div key={r.value} className="text-center p-3 rounded-xl border border-gray-100 dark:border-gray-800">
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{stats[r.label.toLowerCase()]}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{r.label}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onRestart}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Review again
          </button>
          <button
            onClick={() => onComplete()}
            className="flex-1 py-2.5 rounded-xl bg-gray-900 dark:bg-gray-100 text-sm font-medium text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  const card = cards[currentIndex];
  const progress = (currentIndex / cards.length) * 100;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        {deck && <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5"><CreditCard className="w-3 h-3" />{deck.topic}</p>}
        <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">{currentIndex + 1} / {cards.length}</span>
      </div>

      <div className="w-full h-1 bg-gray-100 dark:bg-gray-800 rounded-full mb-6 overflow-hidden">
        <div className="h-full bg-violet-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      <div
        onClick={() => !flipped && setFlipped(true)}
        className={`rounded-2xl border p-6 mb-5 min-h-[180px] flex flex-col transition-all duration-150 ${
          flipped
            ? 'border-violet-200 dark:border-violet-800/60 bg-violet-50/40 dark:bg-violet-900/10'
            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 cursor-pointer hover:border-gray-300 dark:hover:border-gray-600'
        }`}
      >
        <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-600 mb-2">
          {flipped ? 'Answer' : 'Question'}
        </p>
        <p className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed">
          {flipped ? card.back : card.front}
        </p>
        {!flipped && (
          <p className="mt-auto pt-4 text-xs text-gray-400 dark:text-gray-500 text-center">Click to reveal answer</p>
        )}
      </div>

      {flipped && (
        <div className="grid grid-cols-4 gap-2">
          {RATINGS.map(r => (
            <button
              key={r.value}
              onClick={() => handleRate(r.value)}
              disabled={submitting}
              className={`flex flex-col items-center py-2.5 px-1 rounded-xl border text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${r.style}`}
            >
              <span>{r.label}</span>
              <span className="text-[10px] opacity-60 mt-0.5">{r.sublabel}</span>
            </button>
          ))}
        </div>
      )}

      {submitting && <div className="mt-3 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>}
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

const FlashcardReview = () => {
  const navigate = useNavigate();
  const { deckId } = useParams();

  const [deck, setDeck] = useState(null);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('review'); // 'review' | 'manage'

  useEffect(() => { load(); }, [deckId]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await labsApi.getDeckCards(deckId);
      setDeck(res.deck);
      setCards(res.cards || []);
    } catch (err) {
      setError(err.message || 'Failed to load deck.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-gray-900">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 bg-white dark:bg-gray-900 px-6">
        <AlertCircle className="w-6 h-6 text-red-500" />
        <p className="text-sm text-gray-600 dark:text-gray-400">{error}</p>
        <button onClick={() => navigate('/lab/flashcards')} className="text-xs text-violet-600 dark:text-violet-400 underline">Back to decks</button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-gray-900 midnight:bg-gray-950">
      <div className="max-w-xl mx-auto px-6 py-8">

        {/* Nav */}
        <div className="flex items-center justify-between mb-5">
          <button onClick={() => navigate('/lab/flashcards')} className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          {deck && (
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 truncate max-w-[200px]">{deck.topic}</p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-800 mb-6">
          {[{ id: 'review', label: 'Review' }, { id: 'manage', label: 'Manage cards' }].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === t.id
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'review' ? (
          <ReviewSession
            cards={cards}
            deckId={deckId}
            deck={deck}
            onComplete={() => navigate('/lab/flashcards')}
            onRestart={load}
          />
        ) : (
          <ManageCards
            deckId={deckId}
            cards={cards}
            onCardsChanged={setCards}
          />
        )}
      </div>
    </div>
  );
};

export default FlashcardReview;
