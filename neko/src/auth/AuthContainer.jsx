import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import SignIn from './SignIn';
import SignUp from './SignUp';
import { initializeTheme, setupThemeListener } from './utils';
import authService from '../services/authService';

const soraFontBase = "font-sora";

// Array of motivational quotes in the style you requested
const motivationalQuotes = [
  { text: "Cut the fluff. Chase the goal. Nap afterwards.", author: "The Cat" },
  { text: "The universe is meaningless, so make your deadlines matter.", author: "The Cat" },
  { text: "Everything is pointless. Do it anyway. At least you'll be busy.", author: "The Cat" },
  { text: "We're all gonna die. Might as well finish the project first.", author: "The Cat" },
  { text: "Embrace the void. File your taxes.", author: "The Cat" },
  { text: "Life is suffering. Optimize your suffering.", author: "The Cat" },
  { text: "Hope is a lie. Hard work is just expensive hope.", author: "The Cat" },
  { text: "The world doesn't care about your feelings. Your boss definitely doesn't.", author: "The Cat" },
  { text: "Reality is overrated. Results are not.", author: "The Cat" },
  { text: "Sisyphus had the right idea. Push rocks, ask questions later.", author: "The Cat" },
  { text: "Chaos is a ladder. Climb it before someone kicks it over.", author: "The Cat" },
  { text: "The absurd man works not because it matters, but because Tuesday.", author: "The Cat" },
  { text: "Meaning is dead. Productivity is what we have left.", author: "The Cat" },
  { text: "Procrastination is just anxiety with a schedule.", author: "The Cat" },
  { text: "Everyone's winging it. Wing it better.", author: "The Cat" },
  { text: "Perfectionism is just fear wearing a suit.", author: "The Cat" },
  { text: "Done is better than good. Good is better than obsessing at 3 AM.", author: "The Cat" },
  { text: "Nothing matters, so everything might as well get finished.", author: "The Cat" },
  { text: "The heat death of the universe is inevitable. Your presentation is due Monday.", author: "The Cat" },
  { text: "We're specks of dust on a rock in space. Make your speck productive.", author: "The Cat" },
  { text: "Coffee is temporary. Deadlines are eternal.", author: "The Cat" },
  { text: "Success is just failure that hasn't given up yet.", author: "The Cat" },
  { text: "If you're not failing, you're not trying. If you're always failing, try harder.", author: "The Cat" },
  { text: "Motivation is fleeting. Habits are forever. Spite is eternal.", author: "The Cat" },
  { text: "The algorithm doesn't care about your feelings. Be the algorithm.", author: "The Cat" },
  { text: "Imposter syndrome means you're honest about your abilities. Use it.", author: "The Cat" },
  { text: "Yesterday's me was an idiot. Tomorrow's me will think the same. Today's me has work to do.", author: "The Cat" },
  { text: "Burnout is just passion without boundaries. Set boundaries.", author: "The Cat" },
  { text: "Your comfort zone is a lovely place, but nothing grows there except anxiety.", author: "The Cat" },
  { text: "Excellence is not a skill, it's an attitude toward doing things you hate.", author: "The Cat" },
  { text: "Procrastination is the art of keeping up with yesterday.", author: "The Cat" },
  { text: "The only difference between a rut and a grave is the depth.", author: "The Cat" },
  { text: "If you wait for perfect conditions, you'll never get anything done. Conditions are never perfect.", author: "The Cat" },
  { text: "Comparison is the thief of joy. Productivity is the thief of time. Steal them back.", author: "The Cat" },
  { text: "Multitasking is just doing several things badly at once. Master one thing badly instead.", author: "The Cat" },
  { text: "The grass is greener where you water it. Or install artificial turf.", author: "The Cat" },
  { text: "You can't control the wind, but you can adjust your sails. Or build a motor.", author: "The Cat" },
  { text: "Life's too short to fold fitted sheets. Life's too long to leave them wrinkled.", author: "The Cat" },
  { text: "If plan A doesn't work, remember there are 25 more letters. If plan Z doesn't work, invent new letters.", author: "The Cat" },
  { text: "Rome wasn't built in a day, but they were laying bricks every hour.", author: "The Cat" },
  { text: "You miss 100% of the shots you don't take. You also miss most of the ones you do take.", author: "The Cat" },
  { text: "Time heals all wounds. Except deadlines. Deadlines infect wounds.", author: "The Cat" },
  { text: "When life gives you lemons, make lemonade. When life gives you deadlines, make coffee.", author: "The Cat" },
  { text: "The early bird gets the worm. The second mouse gets the cheese. The third developer gets the blame.", author: "The Cat" },
  { text: "Practice makes perfect. Perfect is the enemy of done. Practice being done.", author: "The Cat" },
  { text: "Knowledge is power. Power corrupts. Study anyway.", author: "The Cat" },
  { text: "If at first you don't succeed, redefine success.", author: "The Cat" },
  { text: "Work smarter, not harder. Work anyway when being smart doesn't work.", author: "The Cat" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now. The third best time is during your lunch break.", author: "The Cat" },
  { text: "Failure is not the opposite of success, it's a stepping stone to success. Bring good shoes.", author: "The Cat" },
  { text: "Aim for progress, not perfection. Perfection is a procrastination strategy.", author: "The Cat" },
  { text: "Small wins compound. Collect them like loose change.", author: "The Cat" },
  { text: "Break problems into snacks. Eat one at a time.", author: "The Cat" },
  { text: "If the plan is failing, pivot; if pivoting fails, dance.", author: "The Cat" },
  { text: "Deadline adrenaline is free, but burnout costs extra.", author: "The Cat" },
  { text: "Simplify until it works, then add complexity slowly.", author: "The Cat" },
  { text: "Ask dumb questions early to avoid expensive mistakes later.", author: "The Cat" },
  { text: "Good code documents itself. Better code comes with tests.", author: "The Cat" },
  { text: "The path to mastery is paved with embarrassing first attempts.", author: "The Cat" },
  { text: "If your to-do list is a forest, don't forget to plant a clearing.", author: "The Cat" },
  { text: "Expect resistance. Bring a crowbar and a backup plan.", author: "The Cat" },
  { text: "Comfort is an early form of rust. Scrub it off regularly.", author: "The Cat" },
  { text: "A single step forward beats a hundred ideas stuck in your head.", author: "The Cat" },
  { text: "Refactor ruthlessly. Technical debt compounds like interest.", author: "The Cat" },
  { text: "Celebrate small finishes; they stack into big things.", author: "The Cat" },
  { text: "Keep your desk tidy; keep your brain less cluttered.", author: "The Cat" },
  { text: "Ship rough; iterate fast. Perfection is a never-release license.", author: "The Cat" },
  { text: "Focus is your superpower. Guard it with a mute button.", author: "The Cat" },
  { text: "Say no more often. Saying yes spreads you thin.", author: "The Cat" },
  { text: "When motivation fades, honor your systems.", author: "The Cat" },
  { text: "If the universe is indifferent, at least your todo list is specific.", author: "The Cat" },
  { text: "Existential dread — now available in a productivity flavor.", author: "The Cat" },
  { text: "Dream big, then nap to reassess the meaning of dreaming.", author: "The Cat" },
  { text: "The meaning of life is temporarily out of stock. Try again tomorrow.", author: "The Cat" },
  { text: "If life gives you chaos, file it under 'research' and charge it to experience.", author: "The Cat" },
  { text: "Ambition: the polite word for chaos with a timeline.", author: "The Cat" },
  { text: "If your app crashes, just call it a 'trust exercise'.", author: "The Cat" },
  { text: "Aim for the stars. If you miss, you'll still avoid the meeting.", author: "The Cat" },
  { text: "Ship early. Break things. Write a heartfelt changelog about the trauma.", author: "The Cat" },
  { text: "Pretend you know what you’re doing until facts catch up.", author: "The Cat" },
  { text: "Motivation is a performance — hire better props.", author: "The Cat" },
  { text: "If plan B isn't working, invent plan Æ and confuse your enemies.", author: "The Cat" },
  { text: "Your best idea is probably just your brain on lunch. Feed it again.", author: "The Cat" },
  { text: "A prototype is an archaeological site for future regret.", author: "The Cat" },
  { text: "If nothing goes right, go left; if left is busy, spin in dramatic fashion.", author: "The Cat" },
  { text: "Celebrate small wins. They distract from the slow collapse of plans.", author: "The Cat" },
  { text: "The future is uncertain. Your commit history is permanent. Commit anyway.", author: "The Cat" },
  { text: "We are cosmic accidents with deadlines. Sign the attendance sheet.", author: "The Cat" },
  { text: "Do the work. The universe will provide passive-aggressive feedback later.", author: "The Cat" }
];

const AuthContainer = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [currentQuote, setCurrentQuote] = useState(motivationalQuotes[0]);
  const [authMode, setAuthMode] = useState('solo');

  // Fetch auth mode on mount
  useEffect(() => {
    const mode = authService.getAuthMode() || 'solo';
    setAuthMode(mode);

    // Redirect /signup to /auth in solo mode
    if (mode === 'solo' && location.pathname === '/signup') {
      navigate('/auth');
    }
  }, [location.pathname, navigate]);

  // Determine current page from location
  const getCurrentPage = () => {
    const path = location.pathname;
    if (path === '/signup') return 'signup';
    return 'signin'; // default for /auth
  };
  
  const currentPage = getCurrentPage();
  
  // Function to get a random quote
  const getRandomQuote = () => {
    const randomIndex = Math.floor(Math.random() * motivationalQuotes.length);
    return motivationalQuotes[randomIndex];
  };

  // Function to get a quote based on time of day for some variety
  const getTimeBasedQuote = () => {
    const hour = new Date().getHours();
    const seed = Math.floor(hour / 6); // Changes 4 times per day
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    const index = (seed + dayOfYear) % motivationalQuotes.length;
    return motivationalQuotes[index];
  };

  // Initialize theme and set up listener on component mount
  useEffect(() => {
    // Initialize theme based on localStorage or system preference
    initializeTheme();
    
    // Set up listener for system theme changes
    const cleanup = setupThemeListener();

    // Set initial quote - mix of random and time-based
    // 70% chance for completely random, 30% chance for time-based
    const useRandom = Math.random() < 0.7;
    setCurrentQuote(useRandom ? getRandomQuote() : getTimeBasedQuote());

    return cleanup;
  }, []);

  // Handle navigation between auth pages using React Router
  const navigateTo = (page) => {
    if (page === 'signin') {
      navigate('/auth');
    } else {
      navigate(`/${page}`);
    }
    
    // Maybe change quote when navigating (20% chance for variety)
    if (Math.random() < 0.2) {
      setCurrentQuote(getRandomQuote());
    }
  };

  const renderAuthContent = () => {
    switch (currentPage) {
      case 'signup':
        return <SignUp navigateToSignIn={() => navigateTo('signin')} />;
      default: // 'signin'
        return <SignIn navigateToSignUp={() => navigateTo('signup')} />;
    }
  };

  const getNavigationLinks = () => {
    // In solo mode (default), sign-up is disabled - only one user allowed
    if (authMode === 'solo') {
      // Solo mode - only show sign in, with help text about default credentials
      return (
        <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-500 text-center">
          Solo mode: one user only. Use default credentials or change password in Settings.
        </p>
      );
    }

    // Server mode - allow sign-up
    switch (currentPage) {
      case 'signup':
        return (
          <p className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-500">
            Already have an account?{' '}
            <button
              onClick={() => navigate('/auth')}
              className="text-gray-900 dark:text-white midnight:text-indigo-400 hover:underline focus:outline-none font-medium"
            >
              Sign in
            </button>
          </p>
        );
      default: // 'signin'
        return (
          <p className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-500">
            Don't have an account?{' '}
            <button
              onClick={() => navigate('/signup')}
              className="text-gray-900 dark:text-white midnight:text-indigo-400 hover:underline focus:outline-none font-medium"
            >
              Sign up
            </button>
          </p>
        );
    }
  };

  return (
    <div className={`min-h-screen w-full bg-white dark:bg-gray-900 midnight:bg-gray-950 transition-colors duration-200 ${soraFontBase}`}>
      <div className="flex min-h-screen">
        {/* Left Panel - Marketing Content */}
        <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 p-12 flex-col justify-center">
          <div className="max-w-md mx-auto">

            {/* Random motivational quote */}
            <div className="mb-12">
              <h2 className="text-4xl font-bold text-gray-900 dark:text-white midnight:text-gray-100 mb-4 leading-tight">
                "{currentQuote.text}"
                <span className="block mt-3 text-lg font-medium text-gray-600 dark:text-gray-300 midnight:text-gray-400">— {currentQuote.author}</span>
              </h2>
              
              {/* Optional: Add a small button to get a new quote */}
              <button
                onClick={() => setCurrentQuote(getRandomQuote())}
                className="mt-4 text-xs text-gray-500 dark:text-gray-400 midnight:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 midnight:hover:text-gray-400 transition-colors"
                title="Get a new quote"
              >
                ↻ Cat's wisdom
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel - Auth Form */}
        <div className="w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center p-6 lg:p-12">
          <div className="w-full max-w-sm">

            {/* Auth Content */}
            <div className="space-y-6">
              {renderAuthContent()}
              
              {/* Navigation Links */}
              {getNavigationLinks() && (
                <div className="text-center pt-4 border-t border-gray-200 dark:border-gray-700 midnight:border-gray-800">
                  {getNavigationLinks()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthContainer;