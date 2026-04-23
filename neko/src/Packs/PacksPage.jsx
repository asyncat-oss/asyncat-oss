import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Library } from 'lucide-react';
import { packsApi } from '../CommandCenter/commandCenterApi';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useCommandCenter } from '../CommandCenter/CommandCenterContextEnhanced';

const PACK_CATEGORIES = [
  { id: 'all',          label: 'All'          },
  { id: 'learn',        label: 'Learn'        },
  { id: 'science',      label: 'Science'      },
  { id: 'create',       label: 'Create'       },
  { id: 'productivity', label: 'Productivity' },
  { id: 'fun',          label: 'Fun'          },
];

const PACKS = [
  // ── Learn ──
  { id: 'calculus-bootcamp',       emoji: '∫',   title: 'Calculus Bootcamp',        category: 'learn',        description: 'Limits, derivatives, integrals, and real-world applications from the ground up.',       subtopics: ['Understanding Limits', 'Derivatives in Action', 'Integration Fundamentals', 'Chain Rule & Product Rule'] },
  { id: 'organic-chemistry',       emoji: '⚗️',  title: 'Organic Chemistry',        category: 'learn',        description: 'Functional groups, mechanisms, and reactions explained with clarity.',                   subtopics: ['Functional Groups Overview', 'SN1 vs SN2 Reactions', 'Acids, Bases & pKa', 'Stereochemistry Basics'] },
  { id: 'world-history',           emoji: '🌍',  title: 'World History',            category: 'learn',        description: 'Pivotal moments, empires, and ideas that shaped the modern world.',                      subtopics: ['Ancient Civilizations', 'Renaissance & Enlightenment', 'The Industrial Revolution', '20th Century Turning Points'] },
  { id: 'physics-fundamentals',    emoji: '⚡',  title: 'Physics Fundamentals',     category: 'learn',        description: 'Mechanics, waves, thermodynamics, and the bizarre world of modern physics.',              subtopics: ["Newton's Laws of Motion", 'Waves & Oscillations', 'Thermodynamics Essentials', 'Special Relativity Intro'] },
  { id: 'statistics-probability',  emoji: '📊',  title: 'Statistics & Probability', category: 'learn',        description: 'Distributions, hypothesis testing, Bayes theorem, and statistical reasoning.',            subtopics: ['Probability Fundamentals', "Bayes' Theorem Demystified", 'Distributions Explained', 'Hypothesis Testing'] },
  { id: 'linear-algebra',          emoji: '⬡',   title: 'Linear Algebra',           category: 'learn',        description: 'Vectors, matrices, transformations, eigenvalues, and why they power modern AI.',          subtopics: ['Vectors & Vector Spaces', 'Matrix Operations & Meaning', 'Eigenvalues & Eigenvectors', 'Linear Transformations'] },
  { id: 'economics-101',           emoji: '📈',  title: 'Economics 101',            category: 'learn',        description: 'Supply and demand, market structures, macroeconomics, and behavioral economics.',         subtopics: ['Supply, Demand & Equilibrium', 'Market Structures', 'Macroeconomics Basics', 'Behavioral Economics'] },
  // ── Science ──
  { id: 'biology-decoded',         emoji: '🧬',  title: 'Biology Decoded',          category: 'science',      description: 'Cells, genetics, evolution, and ecosystems explained from first principles.',            subtopics: ['Cell Biology Basics', 'DNA, RNA & Protein Synthesis', 'Evolution & Natural Selection', 'Ecosystems & Ecology'] },
  { id: 'astronomy-space',         emoji: '🌌',  title: 'Astronomy & Space',        category: 'science',      description: 'From our solar system to the edge of the observable universe.',                          subtopics: ['Tour of the Solar System', 'Life Cycle of Stars', 'Black Holes Demystified', 'Big Bang & Cosmology'] },
  { id: 'human-body',              emoji: '🫀',  title: 'Human Body',               category: 'science',      description: 'Anatomy and physiology — how our major systems actually work.',                          subtopics: ['The Cardiovascular System', 'The Nervous System', 'The Immune System', 'Metabolism & Digestion'] },
  { id: 'neuroscience',            emoji: '🧠',  title: 'Neuroscience',             category: 'science',      description: 'How the brain works — memory, learning, dopamine, and sleep.',                           subtopics: ['How Memory Works', 'Neuroplasticity', 'Dopamine & Reward', 'Sleep & the Brain'] },
  { id: 'climate-science',         emoji: '🌿',  title: 'Climate Science',          category: 'science',      description: 'The greenhouse effect, climate systems, tipping points, and the energy transition.',     subtopics: ['The Greenhouse Effect', 'Climate Feedbacks & Tipping Points', 'Oceans & Climate', 'Energy Transition'] },
  // ── Create ──
  { id: 'content-creation-studio', emoji: '✍️', title: 'Content Creation Studio',  category: 'create',       description: 'Blog writing, social media, SEO strategy, and audience engagement.',                    subtopics: ['Writing Compelling Headlines', 'SEO Content Strategy', 'Social Media Copywriting', 'Storytelling for Content'] },
  { id: 'creative-writing-workshop',emoji: '📖', title: 'Creative Writing Workshop',category: 'create',       description: 'Story structure, character, dialogue, and worldbuilding — all the craft essentials.',    subtopics: ['Story Structure', 'Character Development', 'Writing Great Dialogue', 'Worldbuilding Principles'] },
  { id: 'code-and-build',          emoji: '💻',  title: 'Code & Build',             category: 'create',       description: 'Algorithms, system design, clean code, and debugging mastery.',                         subtopics: ['Algorithmic Thinking', 'System Design Fundamentals', 'Clean Code Principles', 'Debugging Strategies'] },
  { id: 'data-science-python',     emoji: '🐍',  title: 'Data Science with Python', category: 'create',       description: 'Pandas, NumPy, visualization, and machine learning fundamentals.',                       subtopics: ['NumPy & Pandas Essentials', 'Data Visualization', 'Machine Learning Intro', 'Exploratory Data Analysis'] },
  { id: 'music-theory',            emoji: '🎵',  title: 'Music Theory',             category: 'create',       description: 'Notes, scales, chords, rhythm, and how music is built from first principles.',           subtopics: ['Notes, Scales & Intervals', 'Chords & Harmony', 'Rhythm & Time Signatures', 'Song Structure & Composition'] },
  { id: 'product-design',          emoji: '🎨',  title: 'Product Design',           category: 'create',       description: 'UX principles, design systems, user research, and design thinking.',                     subtopics: ['UX Fundamentals', 'Design Systems & Components', 'User Research Methods', 'Design Critique & Iteration'] },
  // ── Productivity ──
  { id: 'study-smarter',           emoji: '🎯',  title: 'Study Smarter',            category: 'productivity', description: 'Memory science, note-taking systems, focus techniques, and exam prep.',                  subtopics: ['Active Recall & Spaced Repetition', 'Note-Taking Systems', 'Focus & Deep Work', 'Exam Preparation Strategy'] },
  { id: 'career-accelerator',      emoji: '🚀',  title: 'Career Accelerator',       category: 'productivity', description: 'Resume, interviews, personal branding, and salary negotiation.',                        subtopics: ['Crafting a Strong Resume', 'Acing Interviews', 'LinkedIn & Personal Brand', 'Salary Negotiation'] },
  { id: 'financial-literacy',      emoji: '💰',  title: 'Financial Literacy',       category: 'productivity', description: 'Budgeting, investing, compound interest, and building long-term wealth.',               subtopics: ['Budgeting & Cash Flow', 'Compound Interest & Investing', 'Debt, Credit & Loans', 'Long-Term Wealth Building'] },
  { id: 'mental-models',           emoji: '🔲',  title: 'Mental Models',            category: 'productivity', description: 'The thinking tools used by great decision-makers and problem solvers.',                 subtopics: ['First Principles Thinking', 'Inversion & Avoiding Failure', 'Second & Third Order Effects', 'Probabilistic Thinking'] },
  { id: 'public-speaking',         emoji: '🎤',  title: 'Public Speaking',          category: 'productivity', description: 'Structure, delivery, managing nerves, and commanding a room.',                         subtopics: ['Structuring a Great Talk', 'Managing Nerves & Stage Fright', 'Voice, Pace & Delivery', 'Storytelling & Persuasion'] },
  // ── Fun ──
  { id: 'trivia-master',           emoji: '🏆',  title: 'Trivia Master',            category: 'fun',          description: 'Science, history, culture, and geography trivia challenges.',                           subtopics: ['Science Trivia Round', 'History & Geography Quiz', 'Pop Culture & Arts Round', 'Mind-Bending Facts'] },
  { id: 'logic-puzzles',           emoji: '🧩',  title: 'Logic & Puzzles',          category: 'fun',          description: 'Brain teasers, deductive reasoning, and lateral thinking challenges.',                   subtopics: ['Classic Logic Puzzle', 'Math Brain Teasers', 'Lateral Thinking Challenges', 'Critical Thinking Scenario'] },
  { id: 'philosophy-corner',       emoji: '🤔',  title: 'Philosophy Corner',        category: 'fun',          description: 'Thought experiments, ethics, consciousness, and the great thinkers.',                    subtopics: ['Classic Thought Experiments', 'Philosophy of Mind', 'Major Ethical Theories', 'Stoicism for Modern Life'] },
  { id: 'cooking-science',         emoji: '🍳',  title: 'The Science of Cooking',   category: 'fun',          description: 'Maillard reactions, emulsification, fermentation, and why recipes actually work.',       subtopics: ['The Maillard Reaction', 'Emulsification & Sauces', 'Fermentation & Flavour', 'Heat & Protein Denaturation'] },
  { id: 'film-analysis',           emoji: '🎬',  title: 'Film Analysis',            category: 'fun',          description: 'Cinematography, narrative structure, genre, and what makes great cinema.',               subtopics: ['Visual Language of Cinema', 'Story Structure in Film', 'Genre, Tone & Subtext', 'Directors & Their Craft'] },
  { id: 'language-learning',       emoji: '🗣️', title: 'Language Learning',        category: 'fun',          description: 'Acquisition science, effective methods, grammar patterns, and building fluency.',        subtopics: ['How Languages Are Acquired', 'Effective Learning Methods', 'Grammar Patterns Across Languages', 'Building Vocabulary Fast'] },
];

const PackCard = ({ pack, onLaunch, launching }) => {
  const isLaunching = launching === pack.id;
  const isDisabled = !!launching;

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 dark:border-gray-700/60 midnight:border-gray-800 bg-white dark:bg-gray-900 midnight:bg-gray-950 hover:border-gray-300 dark:hover:border-gray-600 midnight:hover:border-gray-700 transition-colors duration-150">
      <div className="flex flex-col flex-1 p-4">
        <div className="flex items-start gap-3 mb-3">
          <span className="text-xl leading-none mt-0.5 select-none flex-shrink-0">{pack.emoji}</span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100 leading-snug">
              {pack.title}
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500 leading-relaxed">
              {pack.description}
            </p>
          </div>
        </div>

        <ul className="space-y-1 mb-4">
          {pack.subtopics.map((s, i) => (
            <li key={i} className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500 midnight:text-gray-600">
              <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 midnight:bg-gray-700 flex-shrink-0" />
              {s}
            </li>
          ))}
        </ul>

        <button
          onClick={() => onLaunch(pack.id)}
          disabled={isDisabled}
          className="mt-auto w-full py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-800 text-xs font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          {isLaunching ? (
            <><Loader2 className="w-3 h-3 animate-spin" />Building…</>
          ) : (
            'Launch pack'
          )}
        </button>
      </div>
    </div>
  );
};

const PacksPage = () => {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const { triggerConversationRefresh } = useCommandCenter();

  const [activeCategory, setActiveCategory] = useState('all');
  const [launching, setLaunching] = useState(null);
  const [error, setError] = useState(null);

  const filteredPacks = activeCategory === 'all'
    ? PACKS
    : PACKS.filter(p => p.category === activeCategory);

  const handleLaunch = async (packId) => {
    if (!currentWorkspace?.id) { setError('No workspace selected.'); return; }
    setLaunching(packId);
    setError(null);
    try {
      const res = await packsApi.launch(packId, currentWorkspace.id);
      if (res.success && res.firstConversationId) {
        if (triggerConversationRefresh) triggerConversationRefresh();
        navigate(`/conversations/${res.firstConversationId}`);
      } else {
        setError('Failed to launch pack. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Failed to launch pack. Please try again.');
    } finally {
      setLaunching(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-gray-900 midnight:bg-gray-950">
      <div className="max-w-3xl mx-auto px-6 py-8">

        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1.5">
            <Library className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">Packs</h1>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500">
            Jump into a topic. Each pack creates a folder with pre-seeded conversations you can continue at your own pace.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-5">
          {PACK_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors duration-100 ${
                activeCategory === cat.id
                  ? 'bg-gray-900 dark:bg-gray-100 midnight:bg-gray-100 text-white dark:text-gray-900 midnight:text-gray-900'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-gray-800/60'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-xs text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {launching && (
          <div className="mb-4 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/60 midnight:bg-gray-800/40 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
            The Cat is generating your conversations — usually 30–60 seconds.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredPacks.map(pack => (
            <PackCard key={pack.id} pack={pack} onLaunch={handleLaunch} launching={launching} />
          ))}
        </div>

        {filteredPacks.length === 0 && (
          <p className="text-center py-12 text-sm text-gray-400 dark:text-gray-500">No packs in this category yet.</p>
        )}
      </div>
    </div>
  );
};

export default PacksPage;
