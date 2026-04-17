// packsController.js — Pre-seeded learning & exploration packs
import OpenAIClient from './openAIClient.js';
import { generateFollowUpSuggestions } from './chat/followUpSuggestions.js';
import { v4 as uuidv4 } from 'uuid';
import { config } from 'dotenv';

config();

const AI_MODEL = process.env.AI_MODEL || 'gpt-4o';

const aiClient = new OpenAIClient({
  endpoint: process.env.AI_BASE_URL,
  apiKey: process.env.AI_API_KEY,
  defaultModel: AI_MODEL,
});

// ── Focused system prompt for pack generation ────────────────────────────────
// Deliberately concise — avoids token budget issues from the full workspace prompt

const PACK_SYSTEM_PROMPT = `You are The Cat 🐱, a knowledgeable and engaging AI tutor in Asyncat.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔢 MATHEMATICS — KaTeX RENDERING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The platform renders LaTeX via KaTeX. ALWAYS use proper notation:
- Inline: $x^2 + y^2 = r^2$, $f'(x) = nx^{n-1}$
- Display: $$\\frac{d}{dx}\\sin(x) = \\cos(x)$$
- Chemistry (mhchem): $\\ce{H2O}$, $\\ce{2H2 + O2 -> 2H2O}$, $\\ce{N2 + 3H2 <=> 2NH3}$
- NEVER write math as plain text like "x^2" or "sqrt(x)"

For step-by-step problem solving:
**Step 1:** [what you are doing]
$$[LaTeX for this step]$$
**Step 2:** ...
**Answer:** $$[final result]$$

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 SMART ARTIFACT MODE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use artifacts for substantial, reusable content:

<artifact type="react_component" language="jsx" title="..." editable="true">
  Interactive UI: calculators, graph plotters, quizzes, visualizations.
  Use Tailwind CSS. NO import/export statements.
  Direct access to: useState, useEffect, useMemo, lucide-react icons,
  recharts (LineChart, BarChart, etc.), MathBlock, MathInline,
  math.evaluate(), math.derivative(), math.simplify()
</artifact>

<artifact type="code" language="python|javascript|html|etc" title="..." editable="true">
  Runnable code samples and scripts.
</artifact>

<artifact type="diagram" language="mermaid" title="..." editable="true">
  Flowcharts, sequence diagrams, concept maps.
</artifact>

<artifact type="document" title="..." editable="true">
  Plain text documents — NO HTML tags.
</artifact>

Use artifacts for: interactive graphs, code examples, study sheets, worked problem sets.
Skip artifacts for: short explanations, conversational answers, quick facts.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Be thorough, educational, and engaging. Show full working for all math.
This is the opening of a conversation the user will continue — make it a great start.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

// ── Pack definitions ──────────────────────────────────────────────────────────

export const PACKS = [
  // ── Learn ──────────────────────────────────────────────────────────────────
  {
    id: 'calculus-bootcamp',
    emoji: '∫',
    title: 'Calculus Bootcamp',
    description: 'Limits, derivatives, integrals, and real-world applications from the ground up.',
    category: 'learn',
    color: '#6366f1',
    subtopics: [
      { title: 'Understanding Limits', prompt: 'Explain limits intuitively — what they actually mean geometrically and why they are the foundation of all of calculus.' },
      { title: 'Derivatives in Action', prompt: 'Teach me derivatives with intuition: what is a derivative really measuring, and how do we compute them using the key rules?' },
      { title: 'Integration Fundamentals', prompt: 'Break down integration — both definite and indefinite — with clear examples and the Fundamental Theorem of Calculus.' },
      { title: 'Chain Rule & Product Rule', prompt: 'Walk me through the chain rule and product rule with worked step-by-step examples I can follow.' },
    ],
  },
  {
    id: 'organic-chemistry',
    emoji: '⚗️',
    title: 'Organic Chemistry',
    description: 'Functional groups, mechanisms, and reactions explained with clarity.',
    category: 'learn',
    color: '#8b5cf6',
    subtopics: [
      { title: 'Functional Groups Overview', prompt: 'Give me a clear overview of the most important functional groups in organic chemistry and what makes each one reactive.' },
      { title: 'SN1 vs SN2 Reactions', prompt: 'Explain the difference between SN1 and SN2 reactions — mechanisms, examples, and how to predict which one will occur.' },
      { title: 'Acids, Bases & pKa', prompt: 'Help me understand acidity, basicity, and pKa in organic chemistry with practical examples.' },
      { title: 'Stereochemistry Basics', prompt: 'Explain chirality, enantiomers, and diastereomers — and why stereochemistry matters in chemistry and drug design.' },
    ],
  },
  {
    id: 'world-history',
    emoji: '🌍',
    title: 'World History',
    description: 'Pivotal moments, empires, and ideas that shaped the modern world.',
    category: 'learn',
    color: '#f59e0b',
    subtopics: [
      { title: 'Ancient Civilizations', prompt: 'Tell me about the most influential ancient civilizations — what made them rise, flourish, and ultimately fall.' },
      { title: 'Renaissance & Enlightenment', prompt: 'How did the Renaissance and Enlightenment fundamentally change how humans think about science, society, and themselves?' },
      { title: 'The Industrial Revolution', prompt: 'Walk me through the Industrial Revolution — causes, key inventions, and how it transformed society and set the stage for modernity.' },
      { title: '20th Century Turning Points', prompt: 'What were the most critical turning points of the 20th century and why do they still shape the world today?' },
    ],
  },
  {
    id: 'physics-fundamentals',
    emoji: '⚡',
    title: 'Physics Fundamentals',
    description: 'Mechanics, waves, thermodynamics, and the bizarre world of modern physics.',
    category: 'learn',
    color: '#3b82f6',
    subtopics: [
      { title: "Newton's Laws of Motion", prompt: "Explain Newton's three laws of motion with vivid real-world examples that make each law deeply intuitive." },
      { title: 'Waves & Oscillations', prompt: 'Help me understand waves — types, key properties, interference, and why wave phenomena show up everywhere in physics.' },
      { title: 'Thermodynamics Essentials', prompt: 'Break down the laws of thermodynamics and explain entropy in an accessible, intuitive way with good examples.' },
      { title: 'Special Relativity Intro', prompt: 'Introduce me to special relativity — what time dilation and length contraction actually mean and why they follow from simple postulates.' },
    ],
  },
  // ── Science ────────────────────────────────────────────────────────────────
  {
    id: 'biology-decoded',
    emoji: '🧬',
    title: 'Biology Decoded',
    description: 'Cells, genetics, evolution, and ecosystems explained from first principles.',
    category: 'science',
    color: '#10b981',
    subtopics: [
      { title: 'Cell Biology Basics', prompt: "Walk me through the cell — what's inside, what each organelle does, and why cells are the fundamental unit of life." },
      { title: 'DNA, RNA & Protein Synthesis', prompt: 'Explain how genetic information flows from DNA to RNA to protein — the central dogma, step by step.' },
      { title: 'Evolution & Natural Selection', prompt: "Help me understand evolution and natural selection — Darwin's core insight, the evidence, and common misconceptions." },
      { title: 'Ecosystems & Ecology', prompt: 'Explain how ecosystems work — food chains, energy flow, biodiversity, and what happens when they get disrupted.' },
    ],
  },
  {
    id: 'astronomy-space',
    emoji: '🌌',
    title: 'Astronomy & Space',
    description: 'From our solar system to the edge of the observable universe.',
    category: 'science',
    color: '#7c3aed',
    subtopics: [
      { title: 'Tour of the Solar System', prompt: 'Give me a tour of the solar system — planets, moons, and the most fascinating facts about each world.' },
      { title: 'Life Cycle of Stars', prompt: 'Explain how stars are born, live, and die — and how stellar evolution forged the atoms that make up everything.' },
      { title: 'Black Holes Demystified', prompt: 'What actually is a black hole? Explain event horizons, Hawking radiation, and singularities intuitively.' },
      { title: 'Big Bang & Cosmology', prompt: 'Walk me through the Big Bang theory — what happened, the key evidence for it, and the open questions in modern cosmology.' },
    ],
  },
  // ── Create ─────────────────────────────────────────────────────────────────
  {
    id: 'content-creation-studio',
    emoji: '✍️',
    title: 'Content Creation Studio',
    description: 'Blog writing, social media, SEO strategy, and audience engagement.',
    category: 'create',
    color: '#ec4899',
    subtopics: [
      { title: 'Writing Compelling Headlines', prompt: 'Teach me how to write headlines that grab attention and make people actually want to read the content.' },
      { title: 'SEO Content Strategy', prompt: 'Explain SEO content strategy — keyword research, search intent, content structure, and what modern search actually rewards.' },
      { title: 'Social Media Copywriting', prompt: 'What makes social media copy convert? Teach me the principles behind effective posts that drive real engagement.' },
      { title: 'Storytelling for Content', prompt: 'How do I use storytelling in my content to make it more engaging, memorable, and shareable?' },
    ],
  },
  {
    id: 'creative-writing-workshop',
    emoji: '📖',
    title: 'Creative Writing Workshop',
    description: 'Story structure, character, dialogue, and worldbuilding — all the craft essentials.',
    category: 'create',
    color: '#f97316',
    subtopics: [
      { title: 'Story Structure', prompt: "Explain the key story structures — three-act, hero's journey, and others — and when each works best for different stories." },
      { title: 'Character Development', prompt: 'How do I create characters that feel fully real and that readers genuinely care about deeply?' },
      { title: 'Writing Great Dialogue', prompt: "What makes dialogue feel natural and purposeful? Show me the difference between weak and strong dialogue with real examples." },
      { title: 'Worldbuilding Principles', prompt: 'How do skilled authors build believable fictional worlds? What details and internal systems matter most?' },
    ],
  },
  {
    id: 'code-and-build',
    emoji: '💻',
    title: 'Code & Build',
    description: 'Algorithms, system design, clean code, and debugging mastery.',
    category: 'create',
    color: '#0ea5e9',
    subtopics: [
      { title: 'Algorithmic Thinking', prompt: 'Teach me how to think algorithmically — breaking problems down, reasoning about complexity, and approaching coding challenges.' },
      { title: 'System Design Fundamentals', prompt: 'Introduce me to system design — how do large-scale systems like social platforms or payment services actually work at a high level?' },
      { title: 'Clean Code Principles', prompt: "What does clean code actually mean? Teach me the core principles with real before/after examples." },
      { title: 'Debugging Strategies', prompt: 'What are the best mental models and strategies for debugging code effectively when you are stuck?' },
    ],
  },
  // ── Productivity ───────────────────────────────────────────────────────────
  {
    id: 'study-smarter',
    emoji: '🎯',
    title: 'Study Smarter',
    description: 'Memory science, note-taking systems, focus techniques, and exam prep.',
    category: 'productivity',
    color: '#14b8a6',
    subtopics: [
      { title: 'Active Recall & Spaced Repetition', prompt: 'Explain active recall and spaced repetition — why they work better than passive re-reading and how to build a routine around them.' },
      { title: 'Note-Taking Systems', prompt: 'Compare the major note-taking systems (Cornell, Zettelkasten, mind maps, outline) and help me identify the right one for me.' },
      { title: 'Focus & Deep Work', prompt: 'How do I build a deep focus practice for studying? What does the science say about concentration, distraction, and flow states?' },
      { title: 'Exam Preparation Strategy', prompt: 'What is the most effective evidence-backed strategy for exam preparation in the final 1–2 weeks before a test?' },
    ],
  },
  {
    id: 'career-accelerator',
    emoji: '🚀',
    title: 'Career Accelerator',
    description: 'Resume, interviews, personal branding, and salary negotiation.',
    category: 'productivity',
    color: '#6366f1',
    subtopics: [
      { title: 'Crafting a Strong Resume', prompt: 'What are the most important principles for writing a resume that gets noticed by ATS systems and real recruiters?' },
      { title: 'Acing Interviews', prompt: 'What is the best approach to job interviews — preparation frameworks, common mistakes, and how to perform well under pressure?' },
      { title: 'LinkedIn & Personal Brand', prompt: 'How do I build a compelling professional presence on LinkedIn that genuinely attracts opportunities and the right connections?' },
      { title: 'Salary Negotiation', prompt: 'Walk me through salary negotiation — the psychology, proven tactics, and common mistakes to avoid.' },
    ],
  },
  // ── Fun & Games ────────────────────────────────────────────────────────────
  {
    id: 'trivia-master',
    emoji: '🏆',
    title: 'Trivia Master',
    description: 'Science, history, culture, and geography trivia challenges to sharpen your knowledge.',
    category: 'fun',
    color: '#f59e0b',
    subtopics: [
      { title: 'Science Trivia Round', prompt: 'Give me a 5-question science trivia quiz with varying difficulty. Include clear answer explanations after each.' },
      { title: 'History & Geography Quiz', prompt: 'Give me a challenging 5-question history and geography quiz with interesting context for each answer.' },
      { title: 'Pop Culture & Arts Round', prompt: 'Give me a fun 5-question pop culture and arts trivia quiz with surprising facts behind each answer.' },
      { title: 'Mind-Bending Facts', prompt: 'Share 5 genuinely surprising, counterintuitive facts from science or history and explain exactly why each one is true.' },
    ],
  },
  {
    id: 'logic-puzzles',
    emoji: '🧩',
    title: 'Logic & Puzzles',
    description: 'Brain teasers, deductive reasoning, and lateral thinking challenges.',
    category: 'fun',
    color: '#8b5cf6',
    subtopics: [
      { title: 'Classic Logic Puzzle', prompt: 'Give me a challenging classic logic puzzle (like the Einstein riddle) and walk me through the step-by-step deductive reasoning to solve it.' },
      { title: 'Math Brain Teasers', prompt: 'Give me 3 math-based brain teasers of increasing difficulty, then walk through the elegant solutions to each.' },
      { title: 'Lateral Thinking Challenges', prompt: 'Give me 3 lateral thinking puzzles and explain what makes each one tricky and satisfying to crack.' },
      { title: 'Critical Thinking Scenario', prompt: 'Present me with a complex real-world scenario that requires careful, multi-step critical thinking to reason through to a conclusion.' },
    ],
  },
  {
    id: 'philosophy-corner',
    emoji: '🤔',
    title: 'Philosophy Corner',
    description: 'Thought experiments, ethics, consciousness, and the great thinkers.',
    category: 'fun',
    color: '#64748b',
    subtopics: [
      { title: 'Classic Thought Experiments', prompt: "Walk me through one of philosophy's most famous thought experiments — the trolley problem, ship of Theseus, or similar — and explore the debate around it." },
      { title: 'Philosophy of Mind', prompt: 'What is the hard problem of consciousness? Why do philosophers and neuroscientists find it so difficult and why does it matter?' },
      { title: 'Major Ethical Theories', prompt: 'Compare the three major ethical frameworks — consequentialism, deontology, and virtue ethics — with concrete examples that reveal their key differences.' },
      { title: 'Stoicism for Modern Life', prompt: 'What are the core teachings of Stoic philosophy and how can they genuinely be applied to everyday life and challenges today?' },
    ],
  },

  // ── Learn (expanded) ───────────────────────────────────────────────────────
  {
    id: 'statistics-probability',
    emoji: '📊',
    title: 'Statistics & Probability',
    description: 'Distributions, hypothesis testing, Bayes theorem, and statistical reasoning.',
    category: 'learn',
    color: '#0891b2',
    subtopics: [
      { title: 'Probability Fundamentals', prompt: 'Explain probability from first principles — sample spaces, events, conditional probability, and the multiplication rule with examples.' },
      { title: "Bayes' Theorem Demystified", prompt: "Explain Bayes' theorem — what it means intuitively, how to apply it, and why it's so powerful with a concrete worked example." },
      { title: 'Distributions Explained', prompt: 'Walk me through the most important probability distributions — normal, binomial, Poisson — and when each is used in practice.' },
      { title: 'Hypothesis Testing', prompt: 'Explain hypothesis testing step by step — null hypothesis, p-values, significance levels, Type I and Type II errors — with a real example.' },
    ],
  },
  {
    id: 'linear-algebra',
    emoji: '⬡',
    title: 'Linear Algebra',
    description: 'Vectors, matrices, transformations, eigenvalues, and why they power modern AI.',
    category: 'learn',
    color: '#7c3aed',
    subtopics: [
      { title: 'Vectors & Vector Spaces', prompt: 'Explain vectors and vector spaces intuitively — what they are geometrically and algebraically, with key operations.' },
      { title: 'Matrix Operations & Meaning', prompt: 'Walk me through matrix multiplication, transpose, and inverse — and what these operations mean geometrically.' },
      { title: 'Eigenvalues & Eigenvectors', prompt: 'Explain eigenvalues and eigenvectors — what they represent geometrically and why they are so important in applications like PCA and ML.' },
      { title: 'Linear Transformations', prompt: 'What is a linear transformation? Explain with visualisable examples and connect it to matrix multiplication.' },
    ],
  },
  {
    id: 'economics-101',
    emoji: '📈',
    title: 'Economics 101',
    description: 'Supply and demand, market structures, macroeconomics, and behavioral economics.',
    category: 'learn',
    color: '#16a34a',
    subtopics: [
      { title: 'Supply, Demand & Equilibrium', prompt: 'Explain supply and demand thoroughly — how curves shift, what equilibrium means, and how price signals work in markets.' },
      { title: 'Market Structures', prompt: 'Walk me through the different market structures — perfect competition, monopoly, oligopoly, monopolistic competition — and their real-world examples.' },
      { title: 'Macroeconomics Basics', prompt: 'Explain GDP, inflation, unemployment, and fiscal vs monetary policy — the core of macroeconomics with concrete examples.' },
      { title: 'Behavioral Economics', prompt: 'What does behavioral economics reveal about how humans actually make decisions? Cover key biases and concepts like loss aversion and nudges.' },
    ],
  },

  // ── Science (expanded) ────────────────────────────────────────────────────
  {
    id: 'human-body',
    emoji: '🫀',
    title: 'Human Body',
    description: 'Anatomy and physiology — how our major systems actually work.',
    category: 'science',
    color: '#dc2626',
    subtopics: [
      { title: 'The Cardiovascular System', prompt: 'Explain how the heart and circulatory system work — blood flow, heart chambers, blood pressure, and what happens during a heart attack.' },
      { title: 'The Nervous System', prompt: 'Walk me through the nervous system — central vs peripheral, how neurons fire, synapses, and the fight-or-flight response.' },
      { title: 'The Immune System', prompt: 'Explain how the immune system defends the body — innate vs adaptive immunity, antibodies, vaccines, and autoimmune conditions.' },
      { title: 'Metabolism & Digestion', prompt: 'How does digestion and metabolism work? From eating food to cellular energy production — explain the full chain.' },
    ],
  },
  {
    id: 'neuroscience',
    emoji: '🧠',
    title: 'Neuroscience',
    description: 'How the brain works — memory, learning, perception, and consciousness.',
    category: 'science',
    color: '#9333ea',
    subtopics: [
      { title: 'How Memory Works', prompt: 'Explain the neuroscience of memory — encoding, storage, retrieval, short-term vs long-term memory, and what sleep does for memory consolidation.' },
      { title: 'Neuroplasticity', prompt: 'What is neuroplasticity and why does it matter? Explain how the brain rewires itself through learning and experience.' },
      { title: 'Dopamine & Reward', prompt: 'Explain the dopamine system — how reward and motivation work neurologically, and the role dopamine plays in learning, addiction, and drive.' },
      { title: 'Sleep & the Brain', prompt: 'What actually happens in the brain during sleep? Explain sleep stages, REM, glymphatic clearance, and why sleep deprivation is so damaging.' },
    ],
  },
  {
    id: 'climate-science',
    emoji: '🌿',
    title: 'Climate Science',
    description: 'The greenhouse effect, climate systems, tipping points, and solutions.',
    category: 'science',
    color: '#15803d',
    subtopics: [
      { title: 'The Greenhouse Effect', prompt: 'Explain the greenhouse effect from first principles — radiation, atmospheric absorption, and why CO₂ concentration matters so much.' },
      { title: 'Climate Feedbacks & Tipping Points', prompt: 'What are climate feedback loops and tipping points? Explain ice-albedo feedback, permafrost methane, and what "tipping" means.' },
      { title: 'Oceans & Climate', prompt: 'How do the oceans regulate climate? Explain ocean heat absorption, thermohaline circulation, and ocean acidification.' },
      { title: 'Energy Transition', prompt: 'Walk me through the global energy transition — the science behind solar, wind, batteries, nuclear, and what getting to net zero requires.' },
    ],
  },

  // ── Create (expanded) ─────────────────────────────────────────────────────
  {
    id: 'data-science-python',
    emoji: '🐍',
    title: 'Data Science with Python',
    description: 'Pandas, NumPy, visualization, and machine learning fundamentals.',
    category: 'create',
    color: '#2563eb',
    subtopics: [
      { title: 'NumPy & Pandas Essentials', prompt: 'Teach me the core operations in NumPy and Pandas — arrays, DataFrames, indexing, filtering, and common data manipulation patterns.' },
      { title: 'Data Visualization', prompt: 'Walk me through data visualization in Python — Matplotlib and Seaborn best practices, choosing the right chart type, and making plots communicate clearly.' },
      { title: 'Machine Learning Intro with scikit-learn', prompt: 'Introduce me to machine learning with scikit-learn — train/test splits, a simple regression and classification model, and how to evaluate results.' },
      { title: 'Exploratory Data Analysis', prompt: 'What does a thorough EDA look like? Walk me through the steps: missing data, distributions, correlations, and what to look for before modeling.' },
    ],
  },
  {
    id: 'music-theory',
    emoji: '🎵',
    title: 'Music Theory',
    description: 'Notes, scales, chords, rhythm, and how music is built from first principles.',
    category: 'create',
    color: '#7c3aed',
    subtopics: [
      { title: 'Notes, Scales & Intervals', prompt: 'Explain the fundamentals of music theory — notes, octaves, intervals, and major/minor scales from first principles.' },
      { title: 'Chords & Harmony', prompt: 'How are chords built? Explain triads, 7th chords, chord progressions, and what makes a progression sound resolved or tense.' },
      { title: 'Rhythm & Time Signatures', prompt: 'Break down rhythm — beats, time signatures (4/4, 3/4, 6/8), syncopation, and how rhythm creates feel and groove.' },
      { title: 'Song Structure & Composition', prompt: 'What are the standard song structures in popular music? Walk me through verse-chorus, AABA, and the principles behind good composition.' },
    ],
  },
  {
    id: 'product-design',
    emoji: '🎨',
    title: 'Product Design',
    description: 'UX principles, design systems, user research, and design thinking.',
    category: 'create',
    color: '#f97316',
    subtopics: [
      { title: 'UX Fundamentals', prompt: 'What are the core principles of UX design? Explain usability, affordances, mental models, and Hick\'s Law with real product examples.' },
      { title: 'Design Systems & Components', prompt: 'What is a design system and why do teams build them? Explain tokens, components, patterns, and how Figma/design systems work in practice.' },
      { title: 'User Research Methods', prompt: 'What are the main user research methods and when do you use each — interviews, surveys, usability testing, card sorting, and A/B testing?' },
      { title: 'Design Critique & Iteration', prompt: 'How do designers give and receive good critique? Explain the design critique framework and how iteration moves a design from concept to polished product.' },
    ],
  },

  // ── Productivity (expanded) ───────────────────────────────────────────────
  {
    id: 'financial-literacy',
    emoji: '💰',
    title: 'Financial Literacy',
    description: 'Budgeting, investing, compound interest, and building long-term wealth.',
    category: 'productivity',
    color: '#16a34a',
    subtopics: [
      { title: 'Budgeting & Cash Flow', prompt: 'Teach me the fundamentals of personal budgeting — the 50/30/20 rule, tracking cash flow, and building an emergency fund.' },
      { title: 'Compound Interest & Investing', prompt: 'Explain compound interest with worked examples, and introduce the basics of investing — index funds, diversification, and time horizon.' },
      { title: 'Debt, Credit & Loans', prompt: 'How does debt work? Explain interest rates, APR, good debt vs bad debt, credit scores, and strategies for paying down debt effectively.' },
      { title: 'Long-Term Wealth Building', prompt: 'What are the key principles of building long-term wealth? Cover tax-advantaged accounts, asset allocation, and the wealth-building mindset.' },
    ],
  },
  {
    id: 'mental-models',
    emoji: '🔲',
    title: 'Mental Models',
    description: 'The thinking tools used by great decision-makers and problem solvers.',
    category: 'productivity',
    color: '#374151',
    subtopics: [
      { title: 'First Principles Thinking', prompt: 'Explain first principles thinking — what it is, how Elon Musk and Feynman used it, and a step-by-step process for applying it to any problem.' },
      { title: 'Inversion & Avoiding Failure', prompt: 'Explain the mental model of inversion — thinking backwards from failure — and how Charlie Munger applies it to decision-making.' },
      { title: 'Second & Third Order Effects', prompt: 'What are second and third order consequences? Explain the mental model with examples of how ignoring downstream effects causes poor decisions.' },
      { title: 'Probabilistic Thinking', prompt: 'How do great thinkers reason under uncertainty? Explain probabilistic thinking, base rates, and how to make better decisions with incomplete information.' },
    ],
  },
  {
    id: 'public-speaking',
    emoji: '🎤',
    title: 'Public Speaking',
    description: 'Structure, delivery, managing nerves, and commanding a room.',
    category: 'productivity',
    color: '#dc2626',
    subtopics: [
      { title: 'Structuring a Great Talk', prompt: 'How do you structure a compelling talk or presentation? Walk me through the key frameworks — the "rule of three", problem-solution, story arc, etc.' },
      { title: 'Managing Nerves & Stage Fright', prompt: 'What actually causes stage fright and what are the most effective techniques for managing it before and during a presentation?' },
      { title: 'Voice, Pace & Delivery', prompt: 'What separates great public speakers in terms of delivery — vocal variety, pace, pausing, and how to avoid filler words?' },
      { title: 'Storytelling & Persuasion', prompt: 'How do the best speakers use storytelling and persuasion? Explain narrative hooks, emotional resonance, and the difference between informing and persuading.' },
    ],
  },

  // ── Fun (expanded) ────────────────────────────────────────────────────────
  {
    id: 'cooking-science',
    emoji: '🍳',
    title: 'The Science of Cooking',
    description: 'Maillard reactions, emulsification, fermentation, and why recipes actually work.',
    category: 'fun',
    color: '#ea580c',
    subtopics: [
      { title: 'The Maillard Reaction', prompt: 'Explain the Maillard reaction — the chemistry of browning in cooking, why it creates flavour, and how to control it.' },
      { title: 'Emulsification & Sauces', prompt: 'What is emulsification and how does it work in cooking? Explain mayo, hollandaise, and vinaigrette from a food science perspective.' },
      { title: 'Fermentation & Flavour', prompt: 'Explain fermentation in food — how yeast, bacteria, and chemistry create bread, cheese, wine, kimchi, and yoghurt.' },
      { title: 'Heat & Protein Denaturation', prompt: 'What happens to proteins when you cook them? Explain denaturation, gelatin from collagen, the perfect egg, and why sous vide works.' },
    ],
  },
  {
    id: 'film-analysis',
    emoji: '🎬',
    title: 'Film Analysis',
    description: 'Cinematography, narrative structure, genre, and what makes great cinema.',
    category: 'fun',
    color: '#1e293b',
    subtopics: [
      { title: 'Visual Language of Cinema', prompt: 'Explain the visual language of film — shot types, camera movement, framing, and how cinematographers use them to tell stories.' },
      { title: 'Story Structure in Film', prompt: 'How do great films structure their stories? Walk me through three-act structure, character arcs, and what makes a screenplay work.' },
      { title: 'Genre, Tone & Subtext', prompt: 'How do filmmakers use genre, tone, and subtext to communicate meaning beyond what is literally on screen?' },
      { title: 'Directors & Their Craft', prompt: 'Pick two or three influential directors and explain their distinctive visual styles, recurring themes, and what made their work iconic.' },
    ],
  },
  {
    id: 'language-learning',
    emoji: '🗣️',
    title: 'Language Learning',
    description: 'How languages are acquired, effective methods, grammar patterns, and fluency.',
    category: 'fun',
    color: '#0891b2',
    subtopics: [
      { title: 'How Languages Are Acquired', prompt: 'What does linguistics and cognitive science tell us about how humans acquire languages — both as children and adults?' },
      { title: 'Effective Learning Methods', prompt: 'What are the most evidence-backed methods for learning a new language as an adult — immersion, spaced repetition, comprehensible input, and output practice?' },
      { title: 'Common Grammar Patterns Across Languages', prompt: 'What are the universal grammar patterns that appear across many languages? Explain tense, aspect, syntax and what makes languages similar and different.' },
      { title: 'Building Vocabulary Fast', prompt: 'What are the most effective strategies for building vocabulary in a new language — frequency lists, etymology, contextual learning, and memory techniques?' },
    ],
  },
];

export const PACK_CATEGORIES = [
  { id: 'all',          label: 'All'          },
  { id: 'learn',        label: 'Learn'        },
  { id: 'science',      label: 'Science'      },
  { id: 'create',       label: 'Create'       },
  { id: 'productivity', label: 'Productivity' },
  { id: 'fun',          label: 'Fun'          },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function generateSubtopicResponse(subtopic) {
  try {
    const response = await aiClient.client.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: PACK_SYSTEM_PROMPT },
        { role: 'user',   content: subtopic.prompt },
      ],
      max_completion_tokens: 1200,
    });
    const choice = response.choices?.[0];
    const text = choice?.message?.content;
    if (!text) {
      console.error(`Pack empty response for "${subtopic.title}" — finish_reason: ${choice?.finish_reason}, choices: ${response.choices?.length}`);
      return null;
    }
    return text;
  } catch (err) {
    console.error(`Pack AI generation error for "${subtopic.title}":`, err.message, err.status || '');
    return null;
  }
}

// ── Controllers ───────────────────────────────────────────────────────────────

export function getPacks(req, res) {
  const packs = PACKS.map(({ subtopics, ...rest }) => ({
    ...rest,
    subtopicCount: subtopics.length,
  }));
  return res.json({ success: true, packs, categories: PACK_CATEGORIES });
}

export async function launchPack(req, res) {
  const { packId } = req.body;
  const workspaceId = req.workspaceId;
  const userId = req.user.id;
  const db = req.supabase; // authenticated client — respects RLS

  if (!packId) return res.status(400).json({ success: false, error: 'packId required' });
  if (!workspaceId) return res.status(400).json({ success: false, error: 'workspaceId required' });

  const pack = PACKS.find(p => p.id === packId);
  if (!pack) return res.status(404).json({ success: false, error: 'Pack not found' });

  try {
    // 1. Create the folder
    const { data: folder, error: folderError } = await db
      .schema('aichats')
      .from('chat_folders')
      .insert({
        user_id: userId,
        workspace_id: workspaceId,
        name: `${pack.emoji} ${pack.title}`,
        color: pack.color,
      })
      .select()
      .single();

    if (folderError) throw folderError;

    // 2. Generate AI responses sequentially to avoid rate limits
    const now = new Date();
    const conversations = [];

    for (let i = 0; i < pack.subtopics.length; i++) {
      const subtopic = pack.subtopics[i];

      const aiText = await generateSubtopicResponse(subtopic);
      if (!aiText) continue; // skip failed generations rather than storing fallback garbage

      // Generate follow-up suggestions based on the exchange
      const suggestions = await generateFollowUpSuggestions(
        subtopic.prompt,
        aiText,
        {},    // no workspace data context needed for packs
        false, // no project filter
        'chat',
        aiClient,
        AI_MODEL
      );

      const convId = uuidv4();
      const t1 = new Date(now.getTime() + i * 2000).toISOString();
      const t2 = new Date(now.getTime() + i * 2000 + 500).toISOString();

      const messages = [
        { user: subtopic.prompt, id: uuidv4(), timestamp: t1, responseStyle: 'normal' },
        { cat: aiText, id: uuidv4(), timestamp: t2, responseStyle: 'normal', suggestions },
      ];

      const { error } = await db
        .schema('aichats')
        .from('conversations')
        .insert({
          id: convId,
          user_id: userId,
          workspace_id: workspaceId,
          title: subtopic.title,
          folder_id: folder.id,
          mode: 'chat',
          messages,
          last_message_at: t2,
          metadata: { pack_id: packId, pack_title: pack.title, pack_emoji: pack.emoji },
        });

      if (error) throw error;
      conversations.push({ id: convId, title: subtopic.title });
    }

    if (conversations.length === 0) {
      throw new Error('All subtopic generations failed');
    }

    return res.json({
      success: true,
      folderId: folder.id,
      conversations,
      firstConversationId: conversations[0].id,
    });
  } catch (err) {
    console.error('Launch pack error:', err);
    return res.status(500).json({ success: false, error: 'Failed to launch pack' });
  }
}
