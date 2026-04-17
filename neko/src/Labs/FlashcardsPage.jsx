import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Plus, Trash2, ChevronRight, Loader2, AlertCircle, Clock } from 'lucide-react';
import { labsApi } from '../CommandCenter/commandCenterApi';

const FlashcardsPage = () => {
  const navigate = useNavigate();
  const [decks, setDecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Create deck state
  const [showCreate, setShowCreate] = useState(false);
  const [topic, setTopic] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Delete state
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    loadDecks();
  }, []);

  const loadDecks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await labsApi.listDecks();
      setDecks(res.decks || []);
    } catch (err) {
      setError(err.message || 'Failed to load decks.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!topic.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await labsApi.generateDeck(topic.trim());
      setTopic('');
      setShowCreate(false);
      navigate(`/lab/flashcards/${res.deckId}`);
    } catch (err) {
      setCreateError(err.message || 'Failed to generate deck.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e, deckId) => {
    e.stopPropagation();
    setDeletingId(deckId);
    try {
      await labsApi.deleteDeck(deckId);
      setDecks(prev => prev.filter(d => d.id !== deckId));
    } catch (err) {
      // silent — deck stays in list
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    const now = new Date();
    const diff = d - now;
    if (diff < 0) return 'Due now';
    const days = Math.ceil(diff / 86400000);
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    return `Due in ${days}d`;
  };

  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-gray-900 midnight:bg-gray-950">
      <div className="max-w-2xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">Flashcards</h1>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              AI-generated decks with spaced repetition scheduling.
            </p>
          </div>
          <button
            onClick={() => { setShowCreate(v => !v); setCreateError(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New deck
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <form onSubmit={handleCreate} className="mb-5 p-4 rounded-xl border border-violet-200 dark:border-violet-800/50 bg-violet-50/40 dark:bg-violet-900/10">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">What topic should the deck cover?</p>
            <input
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. Spanish irregular verbs, Newton's laws, Python decorators…"
              autoFocus
              maxLength={200}
              className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-violet-400 dark:focus:border-violet-500 focus:ring-1 focus:ring-violet-400/30 dark:focus:ring-violet-500/30 mb-2"
            />
            {createError && (
              <div className="flex items-start gap-1.5 mb-2 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                {createError}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!topic.trim() || creating}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {creating ? <><Loader2 className="w-3 h-3 animate-spin" />Generating…</> : 'Generate deck'}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setTopic(''); setCreateError(null); }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-xs text-red-700 dark:text-red-400 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Decks list */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : decks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CreditCard className="w-8 h-8 text-gray-300 dark:text-gray-700 mb-3" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">No decks yet</p>
            <p className="text-xs text-gray-400 dark:text-gray-600">Create your first deck to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {decks.map(deck => {
              const dueLabel = formatDate(deck.next_review_at);
              return (
                <button
                  key={deck.id}
                  onClick={() => navigate(`/lab/flashcards/${deck.id}`)}
                  className="w-full text-left flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all duration-150 group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{deck.topic}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400 dark:text-gray-500">{deck.card_count ?? 0} cards</span>
                      {dueLabel && (
                        <>
                          <span className="text-gray-300 dark:text-gray-700">·</span>
                          <span className={`text-xs flex items-center gap-1 ${
                            dueLabel === 'Due now' || dueLabel === 'Due today'
                              ? 'text-violet-600 dark:text-violet-400 font-medium'
                              : 'text-gray-400 dark:text-gray-500'
                          }`}>
                            <Clock className="w-3 h-3" />
                            {dueLabel}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={e => handleDelete(e, deck.id)}
                      disabled={deletingId === deck.id}
                      className="p-1.5 rounded-lg text-gray-300 dark:text-gray-700 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      {deletingId === deck.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />
                      }
                    </button>
                    <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-600" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default FlashcardsPage;
