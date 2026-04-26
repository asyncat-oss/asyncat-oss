import { Check, X, Shield } from "lucide-react";

const soraFontBase = "font-sora";

const PasswordRequirements = ({ password, email = "", fullName = "" }) => {
  const checkWeakPassword = (pwd) => {
    const weakPatterns = [
      /^password/i,
      /^123456/,
      /^qwerty/i,
      /^abc123/i,
      /^letmein/i,
      /^welcome/i,
      /^admin/i,
      /^user/i,
      /(.)\1{2,}/,
    ];
    return weakPatterns.some((pattern) => pattern.test(pwd));
  };

  const checkPersonalInfo = (pwd) => {
    const emailLocal = email.split("@")[0]?.toLowerCase() || "";
    const nameParts = fullName
      .toLowerCase()
      .split(" ")
      .filter((part) => part.length > 2);
    const passwordLower = pwd.toLowerCase();

    return (
      (emailLocal.length > 3 && passwordLower.includes(emailLocal)) ||
      nameParts.some((part) => passwordLower.includes(part))
    );
  };

  const isWeakPassword = password && checkWeakPassword(password);
  const containsPersonalInfo = password && checkPersonalInfo(password);

  const mainRequirements = [
    { id: 'length', text: 'At least 8 characters', test: pwd => pwd.length >= 8 },
    { id: 'upper', text: 'Uppercase letter', test: pwd => /[A-Z]/.test(pwd) },
    { id: 'lower', text: 'Lowercase letter', test: pwd => /[a-z]/.test(pwd) },
    { id: 'number', text: 'Number & special', test: pwd => /[0-9]/.test(pwd) && /[!@#$%^&*()_+={}[\]:;'"\\|,.<>?-]/.test(pwd) },
  ];

  const getRequirementStatus = (requirement) => {
    if (!password) return "inactive";
    return requirement.test(password) ? "valid" : "invalid";
  };

  const validCount = mainRequirements.filter(
    (req) => getRequirementStatus(req) === "valid"
  ).length;
  const totalCount = mainRequirements.length;

  const _getStrengthInfo = () => {
    if (validCount <= 1) return { level: "Weak", color: "red", width: "w-1/4" };
    if (validCount <= 2)
      return { level: "Fair", color: "yellow", width: "w-1/2" };
    if (validCount <= 3)
      return { level: "Good", color: "orange", width: "w-3/4" };
    return { level: "Strong", color: "green", width: "w-full" };
  };

  const allRequirementsMet = validCount === totalCount;

  return (
    <div className={`${soraFontBase}`}>
      {/* Show individual requirements or all met message */}
      {allRequirementsMet ? (
        /* All Requirements Met Message */
        <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 midnight:bg-green-900/10 border border-green-200 dark:border-green-800/50 midnight:border-green-800/30">
          <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500 text-white flex items-center justify-center">
            <Check className="w-3 h-3" strokeWidth={3} />
          </div>
          <div className="flex-1">
            <h5 className="text-sm font-semibold text-green-800 dark:text-green-400 midnight:text-green-400">
              All Password Requirements Met
            </h5>
            <p className="text-xs text-green-700 dark:text-green-400 midnight:text-green-400 mt-0.5">
              Your password meets all security requirements
            </p>
          </div>
          <Shield className="w-5 h-5 text-green-500 dark:text-green-400 midnight:text-green-400" />
        </div>
      ) : (
        /* Individual Requirements Grid */
        <div className="grid grid-cols-2 gap-2">
          {mainRequirements.map((requirement) => {
            const status = getRequirementStatus(requirement);
            return (
              <div
                key={requirement.id}
                className={`flex items-center gap-2 p-2.5 rounded-md transition-all duration-200 ${
                  status === "valid"
                    ? "bg-green-50 dark:bg-green-900/20 midnight:bg-green-900/10 border border-green-200 dark:border-green-800/50 midnight:border-green-800/30"
                    : status === "invalid"
                    ? "bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/10 border border-red-200 dark:border-red-800/50 midnight:border-red-800/30"
                    : "bg-gray-50 dark:bg-gray-800/30 midnight:bg-gray-800/20 border border-gray-200 dark:border-gray-700 midnight:border-gray-700"
                }`}
              >
                <div
                  className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${
                    status === "valid"
                      ? "bg-green-500 text-white"
                      : status === "invalid"
                      ? "bg-red-500 text-white"
                      : "bg-gray-300 dark:bg-gray-600 midnight:bg-gray-600"
                  }`}
                >
                  {status === "valid" ? (
                    <Check className="w-2.5 h-2.5" strokeWidth={3} />
                  ) : status === "invalid" ? (
                    <X className="w-2.5 h-2.5" strokeWidth={3} />
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 midnight:bg-gray-500" />
                  )}
                </div>
                <span
                  className={`text-xs font-medium ${
                    status === "valid"
                      ? "text-green-700 dark:text-green-400 midnight:text-green-400"
                      : status === "invalid"
                      ? "text-red-600 dark:text-red-400 midnight:text-red-400"
                      : "text-gray-600 dark:text-gray-400 midnight:text-gray-400"
                  }`}
                >
                  {requirement.text}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Separate Warning Area for Weak Passwords */}
      {(isWeakPassword || containsPersonalInfo) && (
        <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 midnight:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 midnight:border-amber-800/30">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center mt-0.5">
              <X className="w-2.5 h-2.5" strokeWidth={3} />
            </div>
            <div className="flex-1">
              <h5 className="text-sm font-medium text-amber-800 dark:text-amber-400 midnight:text-amber-400 mb-1">
                Password Security Warning
              </h5>
              <div className="space-y-1">
                {isWeakPassword && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 midnight:text-amber-400">
                    This password is commonly used and easy to guess. Please
                    choose a more unique password.
                  </p>
                )}
                {containsPersonalInfo && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 midnight:text-amber-400">
                    Avoid using parts of your email or name in your password for
                    better security.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PasswordRequirements;
