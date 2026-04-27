import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white dark:bg-[#0f0f0f] midnight:bg-black flex flex-col items-center justify-center p-8">
      <div className="max-w-sm w-full text-center space-y-6">
        {/* Clean typography */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-400 dark:text-gray-500 midnight:text-gray-600 tracking-wide uppercase">
            404
          </p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
            Page not found
          </h1>
          <p className="text-gray-500 dark:text-gray-400 midnight:text-gray-500 text-sm leading-relaxed">
            This page doesn't exist or was removed.
          </p>
        </div>

        {/* Minimal action links */}
        <div className="flex items-center justify-center gap-6 pt-2">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 midnight:hover:text-gray-200 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Go back
          </button>
          <button
            onClick={() => navigate('/home')}
            className="flex items-center gap-1.5 text-sm text-gray-900 dark:text-gray-100 midnight:text-gray-100 hover:text-indigo-600 dark:hover:text-indigo-400 midnight:hover:text-indigo-400 transition-colors font-medium"
          >
            <Home className="w-3.5 h-3.5" />
            Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;