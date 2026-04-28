// auth/SignIn.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import FormInput from './FormInput';
import useAuth from '../hooks/useAuth';

const soraFontBase = "font-sora";

const DEFAULT_EMAIL = 'admin@local';
const DEFAULT_PASSWORD = '****';

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
      let errorMessage = 'Authentication failed.';
      if (err.message?.includes('Invalid email or password') || err.message?.includes('Invalid login credentials')) {
        errorMessage = 'Invalid email or password.';
      } else if (err.message?.includes('Too many requests')) {
        errorMessage = 'Too many attempts. Try again in a few minutes.';
      } else if (err.message?.includes('fetch') || err.message?.includes('network')) {
        errorMessage = 'Network error. Check your connection.';
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSignIn} className="space-y-4">
      {error && (
        <div className="p-3 text-sm text-red-400 dark:text-red-400 bg-red-50 dark:bg-red-900/20 midnight:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800/40 midnight:border-red-800/40">
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
        disabled={isLoading}
      />

      <FormInput
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
        required
        disabled={isLoading}
      />

      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium text-sm transition-all duration-200
          bg-[#e8e8ec] hover:bg-[#d0d0d8] dark:bg-[#e8e8ec] dark:hover:bg-[#d0d0d8] midnight:bg-[#dcdce4] midnight:hover:bg-[#c8c8d4]
          text-[#0d0d0f] dark:text-[#0d0d0f] midnight:text-[#08080a]
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:outline-none focus:ring-2 focus:ring-offset-2
          focus:ring-offset-white dark:focus:ring-offset-[#131316] midnight:focus:ring-offset-[#0e0e12]
          focus:ring-[#a0a0b0]"
      >
        {isLoading ? (
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 rounded-full border-2 border-[#0d0d0f]/30 border-t-[#0d0d0f] dark:border-[#0d0d0f]/30 dark:border-t-[#0d0d0f] midnight:border-[#08080a]/30 midnight:border-t-[#08080a] animate-spin" />
            <span>Authenticating...</span>
          </div>
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

export default SignIn;
