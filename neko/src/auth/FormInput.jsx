import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const soraFontBase = "font-sora";

const FormInput = ({ label, type = "text", error, ...props }) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  
  return (
    <div className={`space-y-1.5 ${soraFontBase}`}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300">
        {label}
      </label>
      <div className="relative">
        <input
          type={showPassword ? "text" : type}
          className={`w-full px-3 py-2.5 rounded-lg border transition-all duration-200 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 midnight:placeholder:text-gray-500
            ${error 
              ? 'border-red-300 dark:border-red-500 midnight:border-red-500 bg-red-50 dark:bg-red-900/10 midnight:bg-red-900/10 focus:border-red-500 focus:ring-red-500' 
              : 'border-gray-300 dark:border-gray-600 midnight:border-gray-700 bg-white dark:bg-gray-800 midnight:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-500 midnight:hover:border-gray-600 focus:border-gray-900 dark:focus:border-white midnight:focus:border-indigo-500'
            }
            text-gray-900 dark:text-gray-100 midnight:text-gray-100
            focus:outline-none focus:ring-1
            disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-50 dark:disabled:bg-gray-700 midnight:disabled:bg-gray-700`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 midnight:text-gray-500 midnight:hover:text-gray-300 transition-colors"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 midnight:text-red-400">{error}</p>
      )}
    </div>
  );
};

export default FormInput;