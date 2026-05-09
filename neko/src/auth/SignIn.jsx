// auth/SignIn.jsx
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import FormInput from './FormInput';
import useAuth from '../hooks/useAuth';

const DEFAULT_EMAIL = 'admin@local';
const DEFAULT_PASSWORD = '';

const SignIn = ({ initialEmail = DEFAULT_EMAIL, backendOnline = true }) => {
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setEmail(initialEmail);
  }, [initialEmail]);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await signIn(email, password);
      navigate('/');
    } catch (err) {
      console.error('Sign in error:', err);
      let errorMessage = 'Authentication failed.';
      if (err.message?.includes('Invalid email or password') || err.message?.includes('Invalid login credentials')) {
        errorMessage = 'Invalid email or password.';
      } else if (err.message?.includes('Too many requests')) {
        errorMessage = 'Too many attempts. Try again in a few minutes.';
      } else if (!backendOnline || err.message?.includes('fetch') || err.message?.includes('network') || err.message?.includes('Failed to fetch')) {
        errorMessage = 'Backend offline. Start the local Asyncat services, then try again.';
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSignIn} className="space-y-4">
      {error && (
        <div className="p-3 text-sm text-red-700 dark:text-red-300 midnight:text-red-300 bg-red-50 dark:bg-red-950/25 midnight:bg-red-950/25 rounded-xl border border-red-200 dark:border-red-800/40 midnight:border-red-800/40">
          {error}
        </div>
      )}

      <FormInput
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="user@local"
        required
        disabled={isLoading || !backendOnline}
      />

      <FormInput
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
        required
        disabled={isLoading || !backendOnline}
      />

      <button
        type="submit"
        disabled={isLoading || !backendOnline}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium text-sm transition-all duration-200
          bg-gray-900 hover:bg-gray-800 dark:bg-slate-700/80 dark:hover:bg-slate-700 midnight:bg-slate-800/90 midnight:hover:bg-slate-800
          border border-transparent dark:border-slate-600/70 midnight:border-slate-700
          text-white dark:text-slate-100 midnight:text-slate-100
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:outline-none focus:ring-2 focus:ring-offset-2
          focus:ring-offset-white dark:focus:ring-offset-gray-800 midnight:focus:ring-offset-slate-900
          focus:ring-slate-400 dark:focus:ring-slate-500 midnight:focus:ring-slate-500"
      >
        {isLoading ? (
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            <span>Authenticating...</span>
          </div>
        ) : !backendOnline ? (
          <span>Backend offline</span>
        ) : (
          <div className="flex items-center gap-2">
            <span>Unlock</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        )}
      </button>
    </form>
  );
};

SignIn.propTypes = {
  initialEmail: PropTypes.string,
  backendOnline: PropTypes.bool,
};

export default SignIn;
