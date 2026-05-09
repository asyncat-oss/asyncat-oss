import { useState } from 'react';
import PropTypes from 'prop-types';
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
          className={`
            w-full px-3 py-2.5 rounded-xl border transition-all duration-200 text-sm
            placeholder:text-gray-400 dark:placeholder:text-gray-500 midnight:placeholder:text-slate-500
            ${error
              ? 'border-red-500/60 bg-red-50 dark:border-red-800/60 dark:bg-red-950/20 midnight:border-red-800/60 midnight:bg-red-950/20 focus:border-red-500 dark:focus:border-red-500 midnight:focus:border-red-500'
              : 'border-gray-300 dark:border-gray-600/70 midnight:border-slate-700 bg-white dark:bg-slate-800/70 midnight:bg-slate-950/60 hover:border-gray-400 dark:hover:border-slate-500 midnight:hover:border-slate-600 focus:border-indigo-500 dark:focus:border-indigo-400 midnight:focus:border-indigo-400'
            }
            text-gray-900 dark:text-slate-100 midnight:text-slate-100
            focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-400/20 midnight:focus:ring-indigo-400/25
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 midnight:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 midnight:hover:text-slate-300 transition-colors"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-500 dark:text-red-400 midnight:text-red-400">{error}</p>
      )}
    </div>
  );
};

FormInput.propTypes = {
  label: PropTypes.string.isRequired,
  type: PropTypes.string,
  error: PropTypes.string,
};

export default FormInput;
