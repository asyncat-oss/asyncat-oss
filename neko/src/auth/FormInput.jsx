import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const soraFontBase = "font-sora";

const FormInput = ({ label, type = "text", error, ...props }) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";

  return (
    <div className={`space-y-1.5 ${soraFontBase}`}>
      <label className="block text-sm font-medium text-gray-700 dark:text-[#8a8a98] midnight:text-[#727280]">
        {label}
      </label>
      <div className="relative">
        <input
          type={showPassword ? "text" : type}
          className={`
            w-full px-3 py-2.5 rounded-xl border transition-all duration-200 text-sm
            placeholder:text-gray-400 dark:placeholder:text-[#44444e]
            ${error
              ? 'border-red-800/60 bg-red-900/10 dark:border-red-800/60 dark:bg-red-900/10 midnight:border-red-800/60 midnight:bg-red-900/10 focus:border-red-600'
              : 'border-gray-300 dark:border-[#2a2a32] midnight:border-[#2a2a32] bg-white dark:bg-[#1a1a20] midnight:bg-[#1a1a20] hover:border-gray-400 dark:hover:border-[#3a3a44] midnight:hover:border-[#3a3a44] focus:border-indigo-500 dark:focus:border-[#5555a0] midnight:focus:border-[#5555a0]'
            }
            text-gray-900 dark:text-[#e0e0e8] midnight:text-[#dcdce4]
            focus:outline-none focus:ring-1 dark:focus:ring-[#5555a0]/20 midnight:focus:ring-[#5555a0]/20
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#55555e] hover:text-gray-600 dark:hover:text-[#888892] transition-colors"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
};

export default FormInput;
