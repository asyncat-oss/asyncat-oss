import { Check, X } from "lucide-react";

const soraFontBase = "font-sora";

const PasswordRequirements = ({ password }) => {
  const requirements = [
    { id: 'length', text: '8+ characters', test: pwd => pwd.length >= 8 },
    { id: 'upper', text: 'Uppercase letter', test: pwd => /[A-Z]/.test(pwd) },
    { id: 'lower', text: 'Lowercase letter', test: pwd => /[a-z]/.test(pwd) },
    { id: 'number', text: 'Number & special', test: pwd => /[0-9]/.test(pwd) && /[!@#$%^&*()_+=[\]{}|;:'",.<>?-]/.test(pwd) },
  ];

  const getStatus = (req) => {
    if (!password) return 'idle';
    return req.test(password) ? 'pass' : 'fail';
  };

  const allMet = requirements.every(r => r.test(password));

  return (
    <div className={`${soraFontBase}`}>
      {allMet && password ? (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 dark:bg-green-900/30 midnight:bg-green-900/30 border border-green-200 dark:border-green-800 midnight:border-green-800">
          <div className="w-4 h-4 rounded-full bg-green-500 dark:bg-green-600 midnight:bg-green-600 flex items-center justify-center">
            <Check className="w-2.5 h-2.5 text-white dark:text-green-200 midnight:text-green-200" strokeWidth={3} />
          </div>
          <span className="text-xs text-green-700 dark:text-green-300 midnight:text-green-300">Password requirements met</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {requirements.map(req => {
            const status = getStatus(req);
            return (
              <div
                key={req.id}
                className={`
                  flex items-center gap-2 p-2.5 rounded-xl border transition-all duration-150
                  ${status === 'pass' ? 'bg-green-50 dark:bg-green-900/30 midnight:bg-green-900/30 border-green-200 dark:border-green-800 midnight:border-green-800' : ''}
                  ${status === 'fail' ? 'bg-red-50 dark:bg-red-900/30 midnight:bg-red-900/30 border-red-200 dark:border-red-800 midnight:border-red-800' : ''}
                  ${status === 'idle' ? 'bg-gray-50 dark:bg-gray-800 midnight:bg-gray-900 border-gray-200 dark:border-gray-700 midnight:border-gray-700' : ''}
                `}
              >
                <div className={`
                  w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0
                  ${status === 'pass' ? 'bg-green-500 dark:bg-green-600 midnight:bg-green-600' : ''}
                  ${status === 'fail' ? 'bg-red-500 dark:bg-red-600 midnight:bg-red-600' : ''}
                  ${status === 'idle' ? 'bg-gray-300 dark:bg-gray-600 midnight:bg-gray-600' : ''}
                `}>
                  {status === 'pass' && <Check className="w-2.5 h-2.5 text-white dark:text-green-200 midnight:text-green-200" strokeWidth={3} />}
                  {status === 'fail' && <X className="w-2.5 h-2.5 text-white dark:text-red-200 midnight:text-red-200" strokeWidth={3} />}
                  {status === 'idle' && <div className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 midnight:bg-gray-500" />}
                </div>
                <span className={`
                  text-xs
                  ${status === 'pass' ? 'text-green-700 dark:text-green-300 midnight:text-green-300' : ''}
                  ${status === 'fail' ? 'text-red-600 dark:text-red-300 midnight:text-red-300' : ''}
                  ${status === 'idle' ? 'text-gray-500 dark:text-gray-400 midnight:text-gray-400' : ''}
                `}>
                  {req.text}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PasswordRequirements;
