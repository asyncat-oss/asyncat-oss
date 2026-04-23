import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FormInput from './FormInput';
import PasswordRequirements from './PasswordRequirements';
import useAuth from '../hooks/useAuth';

const soraFontBase = "font-sora";

const SignUp = () => {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    full_name: ''
  });
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [userAlreadyExists, setUserAlreadyExists] = useState(false);

  const validatePasswordRequirements = (password, email, fullName) => {
    const requirements = [
      { test: pwd => pwd.length >= 8, message: 'Password must be at least 8 characters long' },
      { test: pwd => /[A-Z]/.test(pwd), message: 'Password must contain at least one uppercase letter' },
      { test: pwd => /[a-z]/.test(pwd), message: 'Password must contain at least one lowercase letter' },
      { test: pwd => /[0-9]/.test(pwd) && /[!@#$%^&*()_+={}[\]:;'"\\|,.<>?-]/.test(pwd), message: 'Password must contain at least one number and one special character' },
      {
        test: pwd => {
          const weakPatterns = [
            /^password/i, /^123456/, /^qwerty/i, /^abc123/i,
            /^letmein/i, /^welcome/i, /^admin/i, /^user/i,
            /(.)\1{2,}/ // Repeated characters
          ];
          return !weakPatterns.some(pattern => pattern.test(pwd));
        },
        message: 'Password is too common or predictable. Please choose a more unique password.'
      },
      {
        test: pwd => {
          const emailLocal = email.split('@')[0]?.toLowerCase() || '';
          const nameParts = fullName.toLowerCase().split(' ').filter(part => part.length > 2);
          const passwordLower = pwd.toLowerCase();

          return !(emailLocal.length > 3 && passwordLower.includes(emailLocal)) &&
                 !nameParts.some(part => passwordLower.includes(part));
        },
        message: 'Password should not contain parts of your email or name'
      }
    ];

    for (const requirement of requirements) {
      if (!requirement.test(password)) {
        return requirement.message;
      }
    }
    return null;
  };

  const validateForm = () => {
    if (!formData.email || !formData.email.includes('@')) {
      setError('Please provide a valid email address');
      return false;
    }
    if (!formData.full_name?.trim()) {
      setError('Full name is required');
      return false;
    }

    const passwordError = validatePasswordRequirements(formData.password, formData.email, formData.full_name);
    if (passwordError) {
      setError(passwordError);
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords don't match");
      return false;
    }
    return true;
  };

  const checkAllPasswordRequirements = (password, email, fullName) => {
    const requirements = [
      pwd => pwd.length >= 8,
      pwd => /[A-Z]/.test(pwd),
      pwd => /[a-z]/.test(pwd),
pwd => /[0-9]/.test(pwd) && /[!@#$%^&*()_+={}[\]:;'"\\|,.<>?-]/.test(pwd),
    ];

    return requirements.every(test => test(password));
  };

  const allRequirementsMet = checkAllPasswordRequirements(formData.password, formData.email, formData.full_name);
  const isFormValid = formData.email &&
                      formData.full_name?.trim() &&
                      allRequirementsMet &&
                      formData.password === formData.confirmPassword &&
                      formData.confirmPassword !== "";

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError(null);
    setUserAlreadyExists(false);
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      await signUp(formData.email, formData.password, {
        data: { full_name: formData.full_name }
      });
      navigate('/');
    } catch (error) {
      console.error('Sign up error:', error);

      let errorMessage = 'Account creation failed. Please try again.';
      let isExistingUser = false;

      if (error.message?.includes('Email already in use') || error.message?.includes('User already exists')) {
        errorMessage = 'An account with this email already exists. Please sign in instead.';
        isExistingUser = true;
      } else if (error.message?.includes('disabled') || error.message?.includes('solo mode')) {
        errorMessage = 'Registration is disabled. This instance runs in solo mode.';
      } else if (error.message?.includes('Invalid email')) {
        errorMessage = 'Please provide a valid email address.';
      }

      setError(errorMessage);
      setUserAlreadyExists(isExistingUser);
    } finally {
      setIsLoading(false);
    }
  };

  // Show success message if email was sent
  return (
    <div className={`w-full ${soraFontBase}`}>
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white midnight:text-gray-100 mb-2">
          Join Asyncat Workspace
        </h1>
        <p className="text-gray-600 dark:text-gray-400 midnight:text-gray-500">
          The Cat wants to meet you!
        </p>
      </div>

      <form onSubmit={handleSignUp} className="space-y-4">
        {error && (
          <div className="p-3 text-sm bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800/50 midnight:border-red-800/50">
            <div className="text-red-600 dark:text-red-400 midnight:text-red-400 mb-2">
              {error}
            </div>
            {userAlreadyExists && (
              <button
                type="button"
                onClick={() => navigate('/auth')}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-600 dark:bg-red-500 midnight:bg-red-500 text-white text-xs font-medium rounded hover:bg-red-700 dark:hover:bg-red-600 midnight:hover:bg-red-600 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                Sign In Instead
              </button>
            )}
          </div>
        )}

        <FormInput
          label="Full Name"
          name="full_name"
          value={formData.full_name}
          onChange={handleChange}
          placeholder="Enter your full name"
          required
        />

        <FormInput
          label="Email"
          type="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          placeholder="Enter your email"
          required
        />

        <FormInput
          label="Password"
          type="password"
          name="password"
          value={formData.password}
          onChange={handleChange}
          placeholder="Create a secure password"
          required
        />

        <PasswordRequirements
          password={formData.password}
          email={formData.email}
          fullName={formData.full_name}
        />

        <FormInput
          label="Confirm Password"
          type="password"
          name="confirmPassword"
          value={formData.confirmPassword}
          onChange={handleChange}
          placeholder="Confirm your password"
          required
          error={formData.password !== formData.confirmPassword &&
                 formData.confirmPassword !== "" ?
                 "Passwords don't match" : null}
        />

        <button
          type="submit"
          disabled={isLoading || !isFormValid}
          className="w-full bg-gray-900 dark:bg-white midnight:bg-indigo-600 text-white dark:text-gray-900 midnight:text-white py-3 px-4 rounded-lg font-medium transition-all duration-200 hover:bg-gray-800 dark:hover:bg-gray-100 midnight:hover:bg-indigo-700 disabled:opacity-70 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gray-500 dark:focus:ring-gray-400 midnight:focus:ring-indigo-500 focus:ring-offset-2"
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              <span>Creating account...</span>
            </div>
          ) : (
            'Create account'
          )}
        </button>
      </form>
    </div>
  );
};

export default SignUp;