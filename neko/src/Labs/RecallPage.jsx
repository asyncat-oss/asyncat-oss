import React, { useState, useEffect } from 'react';
import { BrainCircuit, ArrowLeft, Loader2, AlertCircle, CheckCircle, History, Plus, Trash2, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { labsApi } from '../CommandCenter/commandCenterApi';

// ─── Quiz Session ─────────────────────────────────────────────────────────────

const QuizSession = ({ questions, sessionId, onComplete, onCancel }) => {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [scores, setScores] = useState([]);
  const [saving, setSaving] = useState(false);

  const q = questions[index];
  const total = questions.length;
  const progress = (index / total) * 100;

  const handleRate = async (knew) => {
    const newScores = [...scores, knew];
    if (index + 1 >= total) {
      setSaving(true);
      const correct = newScores.filter(Boolean).length;
      try {
        if (sessionId) await labsApi.updateRecallSession(sessionId, correct);
      } catch { }
      setSaving(false);
      onComplete(newScores);
    } else {
      setScores(newScores);
      setRevealed(false);
      setIndex(i => i + 1);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button onClick={onCancel} className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Cancel
        </button>
        <span className="text-xs text-gray-400 dark:text-gray-500">{index + 1} / {total}</span>
      </div>

      <div className="w-full h-1 bg-gray-100 dark:bg-gray-800 rounded-full mb-6 overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-5 mb-4">
        <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-600 mb-2">Question</p>
        <p className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed">{q.question}</p>
      </div>

      {!revealed ? (
        <button
          onClick={() => setRevealed(true)}
          className="w-full py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          Show answer
        </button>
      ) : (
        <div>
          <div className="rounded-2xl border border-blue-200 dark:border-blue-800/60 bg-blue-50/40 dark:bg-blue-900/10 p-5 mb-4">
            <p className="text-[10px] font-medium uppercase tracking-wide text-blue-400 dark:text-blue-600 mb-2">Answer</p>
            <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{q.answer}</p>
            {q.hint && (
              <p className="mt-2 text-xs text-blue-400 dark:text-blue-600 italic">Hint: {q.hint}</p>
            )}
          </div>
          <p className="text-xs text-center text-gray-400 dark:text-gray-500 mb-3">Did you know it?</p>
          {saving ? (
            <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => handleRate(false)} className="py-2.5 rounded-xl border border-red-200 dark:border-red-800/60 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                Not really
              </button>
              <button onClick={() => handleRate(true)} className="py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800/60 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors">
                Yes, I knew it
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Completion Screen ────────────────────────────────────────────────────────

const CompletionScreen = ({ scores, topic, onReset, onRetakeSame, retaking }) => {
  const total = scores.length;
  const correct = scores.filter(Boolean).length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

  return (
    <div className="text-center py-4">
      <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-4">
        <CheckCircle className="w-8 h-8 text-blue-500" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Quiz complete</h2>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">{topic}</p>
      <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 my-4">{pct}%</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-8">{correct} of {total} answered correctly</p>

      <div className="flex gap-2">
        <button
          onClick={onRetakeSame}
          disabled={retaking}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {retaking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
          Retake same
        </button>
        <button
          onClick={onReset}
          className="flex-1 py-2.5 rounded-xl bg-gray-900 dark:bg-gray-100 text-sm font-medium text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
        >
          New quiz
        </button>
      </div>
    </div>
  );
};

// ─── Session History Row ──────────────────────────────────────────────────────

const SessionRow = ({ session, onDelete, onRetake, deleting, retaking }) => {
  const [open, setOpen] = useState(false);
  const pct = session.score_pct ?? 0;
  const date = new Date(session.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const scoreColor = pct >= 70 ? 'text-emerald-600 dark:text-emerald-400' : pct >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';

  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="flex items-center px-4 py-3">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex-1 min-w-0 text-left flex items-center gap-2"
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{session.topic}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-0.5">{date} · {session.score_total} questions</p>
          </div>
          <span className={`text-xs font-semibold flex-shrink-0 ${scoreColor}`}>{pct}%</span>
          {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
        </button>

        {/* Actions */}
        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          <button
            onClick={() => onRetake(session)}
            disabled={retaking === session.id}
            title="Retake"
            className="p-1.5 rounded-lg text-gray-400 dark:text-gray-600 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 disabled:opacity-50 transition-colors"
          >
            {retaking === session.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => onDelete(session.id)}
            disabled={deleting === session.id}
            title="Delete"
            className="p-1.5 rounded-lg text-gray-400 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors"
          >
            {deleting === session.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expandable questions */}
      {open && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 space-y-2">
          {session.questions ? (
            session.questions.map((q, i) => (
              <div key={i} className="text-xs">
                <p className="font-medium text-gray-700 dark:text-gray-300">{i + 1}. {q.question}</p>
                <p className="text-gray-500 dark:text-gray-400 mt-0.5 ml-3">→ {q.answer}</p>
              </div>
            ))
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-600">Questions not stored for this session.</p>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const RecallPage = () => {
  const [view, setView] = useState('home'); // 'home' | 'quiz' | 'done'
  const [topic, setTopic] = useState('');
  const [questions, setQuestions] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [quizTopic, setQuizTopic] = useState('');
  const [scores, setScores] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [retakingCurrent, setRetakingCurrent] = useState(false);

  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [retakingId, setRetakingId] = useState(null);

  useEffect(() => { loadSessions(); }, []);

  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const res = await labsApi.listRecallSessions();
      setSessions(res.sessions || []);
    } catch { }
    setSessionsLoading(false);
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!topic.trim()) return;
    setGenerating(true);
    setGenError(null);
    try {
      const res = await labsApi.generateRecall(topic.trim());
      setQuestions(res.questions || []);
      setSessionId(res.sessionId || null);
      setQuizTopic(topic.trim());
      setTopic('');
      setView('quiz');
    } catch (err) {
      setGenError(err.message || 'Failed to generate questions.');
    } finally {
      setGenerating(false);
    }
  };

  const handleComplete = (finalScores) => {
    setScores(finalScores);
    setView('done');
    loadSessions();
  };

  const handleReset = () => {
    setView('home');
    setQuestions([]);
    setScores([]);
    setSessionId(null);
    setQuizTopic('');
  };

  // Retake the same questions from the completion screen
  const handleRetakeSameCurrent = async () => {
    setRetakingCurrent(true);
    try {
      // Re-generate a fresh session for the same topic
      const res = await labsApi.generateRecall(quizTopic);
      setQuestions(res.questions || []);
      setSessionId(res.sessionId || null);
      setScores([]);
      setView('quiz');
    } catch (err) {
      setGenError(err.message || 'Failed to generate questions.');
    } finally {
      setRetakingCurrent(false);
    }
  };

  // Retake from history — load stored questions from that session
  const handleRetakeFromHistory = async (session) => {
    setRetakingId(session.id);
    try {
      // Try to fetch the full session with questions
      const res = await labsApi.getRecallSession(session.id);
      const fullSession = res.session;
      if (fullSession.questions?.length) {
        // Create a new DB session then run with stored questions
        const genRes = await labsApi.generateRecall(session.topic);
        setQuestions(genRes.questions?.length ? genRes.questions : fullSession.questions);
        setSessionId(genRes.sessionId || null);
      } else {
        // Fall back: generate new questions
        const genRes = await labsApi.generateRecall(session.topic);
        setQuestions(genRes.questions || []);
        setSessionId(genRes.sessionId || null);
      }
      setQuizTopic(session.topic);
      setScores([]);
      setView('quiz');
    } catch (err) {
      setGenError(err.message || 'Failed to retake session.');
    } finally {
      setRetakingId(null);
    }
  };

  const handleDeleteSession = async (sessionId) => {
    setDeletingId(sessionId);
    try {
      await labsApi.deleteRecallSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch { }
    setDeletingId(null);
  };

  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-gray-900 midnight:bg-gray-950">
      <div className="max-w-xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BrainCircuit className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">Active Recall</h1>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Quiz yourself on anything. Rate what you knew.</p>
          </div>
          {sessions.length > 0 && view === 'home' && (
            <button
              onClick={() => setShowHistory(v => !v)}
              className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <History className="w-3.5 h-3.5" />
              {showHistory ? 'Hide' : 'History'}
            </button>
          )}
        </div>

        {view === 'home' && (
          <>
            <form onSubmit={handleGenerate} className="mb-6">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">What do you want to test yourself on?</p>
              <input
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="e.g. The causes of WWI, Newton's laws, Python generators…"
                maxLength={200}
                className="w-full px-3 py-2.5 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 focus:ring-1 focus:ring-blue-400/30 dark:focus:ring-blue-500/30 mb-2"
              />
              {genError && (
                <div className="flex items-start gap-1.5 mb-2 text-xs text-red-600 dark:text-red-400">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{genError}
                </div>
              )}
              <button
                type="submit"
                disabled={!topic.trim() || generating}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {generating
                  ? <><Loader2 className="w-3 h-3 animate-spin" />Generating questions…</>
                  : <><Plus className="w-3 h-3" />Start quiz</>
                }
              </button>
            </form>

            {/* History */}
            {showHistory && (
              <div>
                <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Previous sessions</p>
                {sessionsLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
                ) : sessions.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-600 text-center py-6">No sessions yet.</p>
                ) : (
                  <div className="space-y-2">
                    {sessions.map(s => (
                      <SessionRow
                        key={s.id}
                        session={s}
                        onDelete={handleDeleteSession}
                        onRetake={handleRetakeFromHistory}
                        deleting={deletingId}
                        retaking={retakingId}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {view === 'quiz' && questions.length > 0 && (
          <QuizSession
            questions={questions}
            sessionId={sessionId}
            onComplete={handleComplete}
            onCancel={handleReset}
          />
        )}

        {view === 'done' && (
          <CompletionScreen
            scores={scores}
            topic={quizTopic}
            onReset={handleReset}
            onRetakeSame={handleRetakeSameCurrent}
            retaking={retakingCurrent}
          />
        )}
      </div>
    </div>
  );
};

export default RecallPage;
