// auth/SignIn.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, KeyRound } from 'lucide-react';
import FormInput from './FormInput';
import useAuth from '../hooks/useAuth';

const soraFontBase = "font-sora";

const DEFAULT_EMAIL = 'admin@local';
const DEFAULT_PASSWORD = 'changeme';

const SignIn = ({ navigateToSignUp }) => {
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const [email, setEmail] = useState(DEFAULT_EMAIL);
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await signIn(email, password);
      navigate('/');
    } catch (err) {
      console.error('Sign in error:', err);
      let errorMessage = 'Sign in failed. Please check your credentials and try again.';
      if (err.message?.includes('Invalid email or password') || err.message?.includes('Invalid login credentials')) {
        errorMessage = 'Invalid email or password. Please try again.';
      } else if (err.message?.includes('Too many requests')) {
        errorMessage = 'Too many login attempts. Please try again in a few minutes.';
      } else if (err.message?.includes('fetch') || err.message?.includes('network')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUseDefault = async (e) => {
    e.preventDefault();
    setEmail(DEFAULT_EMAIL);
    setPassword(DEFAULT_PASSWORD);
    setIsLoading(true);
    setError(null);

    try {
      await signIn(DEFAULT_EMAIL, DEFAULT_PASSWORD);
      navigate('/');
    } catch (err) {
      let errorMessage = 'Sign in failed. Please check your credentials and try again.';
      if (err.message?.includes('Invalid email or password') || err.message?.includes('Invalid login credentials')) {
        errorMessage = 'Invalid email or password. Please try again.';
      } else if (err.message?.includes('Too many requests')) {
        errorMessage = 'Too many login attempts. Please try again in a few minutes.';
      } else if (err.message?.includes('fetch') || err.message?.includes('network')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`w-full ${soraFontBase}`}>
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white midnight:text-gray-100 mb-2">
          Welcome back
        </h1>
        <p className="text-gray-600 dark:text-gray-400 midnight:text-gray-500">
          The Cat has been waiting for you
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSignIn} className="space-y-4">
        {error && (
          <div className="p-3 text-sm text-red-600 dark:text-red-400 midnight:text-red-400 bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800/50 midnight:border-red-800/50">
            {error}
          </div>
        )}

        <FormInput
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          required
          disabled={isLoading}
        />

        <FormInput
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          required
          disabled={isLoading}
        />

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-gray-900 dark:bg-white midnight:bg-indigo-600 text-white dark:text-gray-900 midnight:text-white py-3 px-4 rounded-lg font-medium transition-all duration-200 hover:bg-gray-800 dark:hover:bg-gray-100 midnight:hover:bg-indigo-700 disabled:opacity-70 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gray-500 dark:focus:ring-gray-400 midnight:focus:ring-indigo-500 focus:ring-offset-2"
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              <span>Signing in...</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <span>Continue with email</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          )}
        </button>

        {/* Default credentials button */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200 dark:border-gray-700" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white dark:bg-gray-900 midnight:bg-gray-950 text-gray-500 dark:text-gray-400">
              or
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleUseDefault}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium border border-gray-200 dark:border-gray-700 midnight:border-gray-700 text-gray-600 dark:text-gray-300 midnight:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors"
        >
          <KeyRound className="w-4 h-4" />
          <span>Use default credentials</span>
        </button>

        <p className="text-xs text-center text-gray-400 dark:text-gray-500 midnight:text-gray-500">
          Default: {DEFAULT_EMAIL} / {DEFAULT_PASSWORD}
        </p>
      </form>
    </div>
  );
};

export default SignIn;
