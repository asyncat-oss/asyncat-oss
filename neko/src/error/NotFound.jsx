import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft, Search } from 'lucide-react';

const NotFound = () => {
  const navigate = useNavigate();

  const handleGoHome = () => {
    navigate('/home');
  };

  const handleGoBack = () => {
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 midnight:bg-gray-950 flex flex-col items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        {/* 404 Cat Icon */}
        <div className="text-9xl mb-6">😾</div>
        
        {/* 404 Title */}
        <h1 className="text-6xl font-bold text-gray-800 dark:text-gray-200 midnight:text-gray-300 mb-4">
          404
        </h1>
        
        <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-300 midnight:text-gray-400 mb-4">
          Page Not Found
        </h2>
        
        <p className="text-gray-600 dark:text-gray-400 midnight:text-gray-500 mb-8 leading-relaxed">
          The Cat knocked this page off the internet. It's probably somewhere under the couch with the missing socks and your motivation.
        </p>

        {/* Action buttons */}
        <div className="space-y-3">
          <button
            onClick={handleGoHome}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 midnight:bg-indigo-400 midnight:hover:bg-indigo-500 text-white rounded-lg transition-colors font-medium"
          >
            <Home className="w-4 h-4" />
            Go to Dashboard
          </button>
          
          <button
            onClick={handleGoBack}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 midnight:bg-gray-800 midnight:hover:bg-gray-700 text-gray-800 dark:text-gray-200 midnight:text-gray-300 rounded-lg transition-colors font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>

        {/* Fun cat facts */}
        <div className="mt-12 p-4 bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-800">
          <p className="text-sm text-gray-600 dark:text-gray-400 midnight:text-gray-500 italic">
            "Fun fact: Cats spend 70% of their lives sleeping and 30% knocking things off tables. This page was in the 30%."
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 midnight:text-gray-600 mt-2">
            — The Cat's excuse for everything
          </p>
        </div>

        {/* Error code for debugging */}
        <div className="mt-6 text-xs text-gray-400 dark:text-gray-600 midnight:text-gray-700">
          Error ID: CAT-404-{Date.now().toString(36).toUpperCase()}
        </div>
      </div>
    </div>
  );
};

export default NotFound;
