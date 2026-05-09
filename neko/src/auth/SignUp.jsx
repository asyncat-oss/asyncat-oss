// auth/SignUp.jsx
import { useState } from 'react';
import PropTypes from 'prop-types';
import FormInput from './FormInput';
import PasswordRequirements from './PasswordRequirements';
import useAuth from '../hooks/useAuth';

const SignUp = ({ navigateToSignIn }) => {
  const { signUp } = useAuth();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    full_name: ''
  });
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const validatePasswordRequirements = (password, email, fullName) => {
    const weakPatterns = [
      /^password/i, /^123456/, /^qwerty/i, /^abc123/i,
      /^letmein/i, /^welcome/i, /^admin/i, /^user/i,
      /(.)\1{2,}/
    ];
    const emailLocal = email.split('@')[0]?.toLowerCase() || '';
    const nameParts = fullName.toLowerCase().split(' ').filter(p => p.length > 2);

    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter.';
    if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter.';
    if (!/[0-9]/.test(password) || !/[!@#$%^&*()_+=[\]{}|;:'",.<>?-]/.test(password)) {
      return 'Password must contain a number and a special character.';
    }
    if (weakPatterns.some(p => p.test(password))) return 'Password is too common. Be more creative.';
    if (emailLocal.length > 3 && password.toLowerCase().includes(emailLocal)) {
      return 'Password should not contain parts of your email.';
    }
    if (nameParts.some(p => password.toLowerCase().includes(p))) {
      return 'Password should not contain parts of your name.';
    }
    return null;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError(null);

    if (!formData.email || !formData.email.includes('@')) {
      setError('Please provide a valid email address.');
      return;
    }
    if (!formData.full_name?.trim()) {
      setError('Full name is required.');
      return;
    }
    const pwdError = validatePasswordRequirements(formData.password, formData.email, formData.full_name);
    if (pwdError) {
      setError(pwdError);
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setIsLoading(true);
    try {
      await signUp(formData.email, formData.password, { data: { full_name: formData.full_name } });
    } catch (err) {
      let msg = 'Account creation failed.';
      if (err.message?.includes('Email already in use')) {
        msg = 'An account with this email already exists.';
      } else if (err.message?.includes('disabled') || err.message?.includes('local build')) {
        msg = 'Registration is disabled in the local build.';
      } else if (err.message?.includes('Invalid email')) {
        msg = 'Please provide a valid email address.';
      }
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const allRequirementsMet = formData.password.length >= 8
    && /[A-Z]/.test(formData.password)
    && /[a-z]/.test(formData.password)
    && /[0-9]/.test(formData.password)
    && /[!@#$%^&*()_+=[\]{}|;:'",.<>?-]/.test(formData.password);

  const isFormValid = formData.email
    && formData.full_name?.trim()
    && allRequirementsMet
    && formData.password === formData.confirmPassword
    && formData.confirmPassword !== "";

  return (
    <form onSubmit={handleSignUp} className="space-y-4">
      {error && (
        <div className="p-3 text-sm text-red-700 dark:text-red-300 midnight:text-red-300 bg-red-50 dark:bg-red-950/25 midnight:bg-red-950/25 rounded-xl border border-red-200 dark:border-red-800/40 midnight:border-red-800/40">
          {error}
        </div>
      )}

      <FormInput
        label="Full Name"
        name="full_name"
        value={formData.full_name}
        onChange={handleChange}
        placeholder="Your name"
        required
      />

      <FormInput
        label="Email"
        type="email"
        name="email"
        value={formData.email}
        onChange={handleChange}
        placeholder="you@example.com"
        required
      />

      <FormInput
        label="Password"
        type="password"
        name="password"
        value={formData.password}
        onChange={handleChange}
        placeholder="Min. 8 chars"
        required
      />

      <FormInput
        label="Confirm Password"
        type="password"
        name="confirmPassword"
        value={formData.confirmPassword}
        onChange={handleChange}
        placeholder="Repeat password"
        required
        error={
          formData.password !== formData.confirmPassword && formData.confirmPassword !== ""
            ? "Passwords don't match"
            : null
        }
      />

      <PasswordRequirements password={formData.password} />

      <button
        type="submit"
        disabled={isLoading || !isFormValid}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium text-sm transition-all duration-200
          bg-gray-900 hover:bg-gray-800 dark:bg-slate-700/80 dark:hover:bg-slate-700 midnight:bg-slate-800/90 midnight:hover:bg-slate-800
          border border-transparent dark:border-slate-600/70 midnight:border-slate-700
          text-white dark:text-slate-100 midnight:text-slate-100
          disabled:opacity-40 disabled:cursor-not-allowed
          focus:outline-none focus:ring-2 focus:ring-offset-2
          focus:ring-offset-white dark:focus:ring-offset-gray-800 midnight:focus:ring-offset-slate-900
          focus:ring-slate-400 dark:focus:ring-slate-500 midnight:focus:ring-slate-500"
      >
        {isLoading ? (
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            <span>Creating account...</span>
          </div>
        ) : (
          'Create account'
        )}
      </button>

      <p className="text-center text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">
        Already have an account?{' '}
        <button
          type="button"
          onClick={navigateToSignIn}
          className="text-indigo-600 dark:text-indigo-300 midnight:text-indigo-300 hover:text-indigo-700 dark:hover:text-indigo-200 midnight:hover:text-indigo-200 transition-colors"
        >
          Sign in
        </button>
      </p>
    </form>
  );
};

SignUp.propTypes = {
  navigateToSignIn: PropTypes.func.isRequired,
};

export default SignUp;
