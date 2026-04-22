

const soraFontBase = "font-sora"; // Added Sora font

const AppearanceSection = ({ theme, setThemeMode }) => {  // Get theme-specific icon for midnight
  const getMidnightIcon = () => {
    return (
      <svg className="w-5 h-5 mr-3 text-purple-500 dark:text-purple-400 midnight:text-purple-300" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 A7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="20" cy="4" r="2" fill="currentColor"/>
      </svg>
    );
  };

  return (
    <div className={`space-y-6 ${soraFontBase}`}>      {/* Theme Setting Card */}
      <div className="backdrop-blur-md bg-white/90 dark:bg-gray-800/90 midnight:bg-gray-900/90 p-6 rounded-xl shadow-sm border border-gray-200/50 dark:border-gray-600/50 midnight:border-gray-500/40">
        <div className="flex items-center gap-2 mb-4">
          <Palette size={20} className="text-gray-700 dark:text-gray-200 midnight:text-blue-300" />
          <h3 className="text-base font-medium text-gray-700 dark:text-gray-200 midnight:text-blue-200">
            Theme
          </h3>
        </div>
        
        <div className="backdrop-blur-sm bg-gray-50/80 dark:bg-gray-700/80 midnight:bg-gray-800/80 p-4 rounded-lg border border-gray-200/30 dark:border-gray-600/30 midnight:border-gray-500/30">
          <div className="space-y-4">
            <div className="flex flex-col gap-3">              {/* Light mode option */}
              <label className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-200/80 dark:hover:bg-gray-600/80 midnight:hover:bg-gray-700/80 cursor-pointer backdrop-blur-sm transition-all duration-200 border border-transparent hover:border-gray-300/50 dark:hover:border-gray-500/50 midnight:hover:border-gray-400/30">
                <div className="flex items-center">
                  <Sun className="text-amber-500 dark:text-amber-400 midnight:text-amber-300 w-5 h-5 mr-3" />
                  <span className="text-gray-700 dark:text-gray-200 midnight:text-gray-100">Light Mode</span>
                </div>
                <input 
                  type="radio" 
                  name="theme" 
                  checked={theme === 'light'} 
                  onChange={() => setThemeMode('light')}
                  className="w-4 h-4 text-blue-600 focus:ring-blue-500 dark:text-blue-500 dark:focus:ring-blue-400 midnight:text-blue-500 midnight:focus:ring-blue-400"
                />
              </label>
              
              {/* Dark mode option */}
              <label className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-200/80 dark:hover:bg-gray-600/80 midnight:hover:bg-gray-700/80 cursor-pointer backdrop-blur-sm transition-all duration-200 border border-transparent hover:border-gray-300/50 dark:hover:border-gray-500/50 midnight:hover:border-gray-400/30">
                <div className="flex items-center">
                  <Moon className="text-indigo-500 dark:text-indigo-400 midnight:text-indigo-300 w-5 h-5 mr-3" />
                  <span className="text-gray-700 dark:text-gray-200 midnight:text-gray-100">Dark Mode</span>
                </div>                <input 
                  type="radio" 
                  name="theme" 
                  checked={theme === 'dark'} 
                  onChange={() => setThemeMode('dark')}
                  className="w-4 h-4 text-blue-600 focus:ring-blue-500 dark:text-blue-500 dark:focus:ring-blue-400 midnight:text-blue-500 midnight:focus:ring-blue-400"
                />
              </label>
              
              {/* Midnight mode option */}
              <label className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-200/80 dark:hover:bg-gray-600/80 midnight:hover:bg-gray-700/80 cursor-pointer backdrop-blur-sm transition-all duration-200 border border-transparent hover:border-gray-300/50 dark:hover:border-gray-500/50 midnight:hover:border-gray-400/30">
                <div className="flex items-center">
                  {getMidnightIcon()}
                  <span className="text-gray-700 dark:text-gray-200 midnight:text-gray-100">Midnight Mode</span>
                </div>
                <input 
                  type="radio" 
                  name="theme" 
                  checked={theme === 'midnight'} 
                  onChange={() => setThemeMode('midnight')}
                  className="w-4 h-4 text-blue-600 focus:ring-blue-500 dark:text-blue-500 dark:focus:ring-blue-400 midnight:text-blue-500 midnight:focus:ring-blue-400"
                />
              </label>
                {/* System preference option */}
              <button 
                onClick={() => {
                  localStorage.removeItem('theme');
                  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  document.documentElement.classList.toggle('dark', prefersDark);
                  document.documentElement.classList.remove('midnight');
                  setThemeMode(prefersDark ? 'dark' : 'light');
                }}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-200/80 dark:hover:bg-gray-600/80 midnight:hover:bg-gray-700/80 cursor-pointer w-full text-left backdrop-blur-sm transition-all duration-200 border border-transparent hover:border-gray-300/50 dark:hover:border-gray-500/50 midnight:hover:border-gray-400/30"
              >
                <div className="flex items-center">
                  <svg className="w-5 h-5 mr-3 text-gray-600 dark:text-gray-300 midnight:text-blue-400" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 18C15.3137 18 18 15.3137 18 12C18 8.68629 15.3137 6 12 6C8.68629 6 6 8.68629 6 12C6 15.3137 8.68629 18 12 18Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M22 12H23M1 12H2M12 22V23M12 1V2M4.93 4.93L4.22 4.22M19.07 4.93L19.78 4.22M4.93 19.07L4.22 19.78M19.07 19.07L19.78 19.78" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-gray-700 dark:text-gray-200 midnight:text-gray-100">System Preference</span>
                </div>
              </button>
            </div>
          </div>
          
          <p className="text-sm text-gray-500 dark:text-gray-300 midnight:text-gray-200 mt-4">
            Select your preferred theme or use your system's default setting.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AppearanceSection;